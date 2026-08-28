import { AppError } from "./errors.js";
import { correlateDispatchedRun } from "./correlation.js";
import { GitHubClient } from "./github-client.js";
import type {
  GitHubArtifact,
  GitHubBranch,
  GitHubJob,
  GitHubRepository,
  GitHubRun,
  GitHubWorkflow,
  WorkflowInputDefinition,
} from "./types.js";
import {
  normalizeDispatchInputs,
  parseWorkflowInputs,
  PLAYWRIGHT_INPUTS_FALLBACK,
} from "./workflow-inputs.js";

export interface WorkflowInputsResult {
  inputs: WorkflowInputDefinition[];
  source: "github" | "fallback";
}

export interface DispatchResult {
  run: GitHubRun;
  correlation: "github-response" | "fallback";
}

export interface ArtifactDownload {
  artifact: GitHubArtifact;
  response: Response;
}

export interface DashboardGitHubService {
  getRepository(): Promise<GitHubRepository>;
  listWorkflows(): Promise<GitHubWorkflow[]>;
  listBranches(): Promise<GitHubBranch[]>;
  getWorkflowInputs(workflowId: number, ref: string): Promise<WorkflowInputsResult>;
  dispatch(workflowId: number, ref: string, inputs: unknown): Promise<DispatchResult>;
  listRuns(workflowId?: number): Promise<GitHubRun[]>;
  getRun(runId: number): Promise<GitHubRun>;
  listJobs(runId: number): Promise<GitHubJob[]>;
  cancel(runId: number): Promise<void>;
  rerun(runId: number): Promise<void>;
  listArtifacts(runId: number): Promise<GitHubArtifact[]>;
  downloadArtifact(artifactId: number): Promise<ArtifactDownload>;
}

type Sleep = (milliseconds: number) => Promise<void>;

export class GitHubService implements DashboardGitHubService {
  constructor(
    private readonly client: GitHubClient,
    private readonly sleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  listWorkflows(): Promise<GitHubWorkflow[]> {
    return this.client.listWorkflows();
  }

  getRepository(): Promise<GitHubRepository> {
    return this.client.getRepository();
  }

  listBranches(): Promise<GitHubBranch[]> {
    return this.client.listBranches();
  }

  async getWorkflowInputs(workflowId: number, ref: string): Promise<WorkflowInputsResult> {
    const workflow = await this.requireWorkflow(workflowId);
    await this.requireBranch(ref);

    try {
      const source = await this.client.getWorkflowYaml(workflow.path, ref);
      const inputs = parseWorkflowInputs(source);
      if (inputs.length === 0 && workflow.path === ".github/workflows/playwright.yml") {
        return { inputs: PLAYWRIGHT_INPUTS_FALLBACK, source: "fallback" };
      }
      return { inputs, source: "github" };
    } catch (error) {
      if (workflow.path === ".github/workflows/playwright.yml") {
        return { inputs: PLAYWRIGHT_INPUTS_FALLBACK, source: "fallback" };
      }
      throw error;
    }
  }

  async dispatch(workflowId: number, ref: string, rawInputs: unknown): Promise<DispatchResult> {
    await this.requireWorkflow(workflowId);
    await this.requireBranch(ref);
    const { inputs: definitions } = await this.getWorkflowInputs(workflowId, ref);
    const inputs = normalizeDispatchInputs(definitions, rawInputs);
    const actor = await this.client.getAuthenticatedUser();
    const before = await this.client.listRuns({
      workflowId,
      branch: ref,
      event: "workflow_dispatch",
      actor: actor.login,
      perPage: 30,
    });
    const dispatchedAt = new Date();
    const dispatchResponse = await this.client.dispatchWorkflow(workflowId, ref, inputs);

    if (dispatchResponse?.workflow_run_id) {
      return {
        run: await this.client.getRun(dispatchResponse.workflow_run_id),
        correlation: "github-response",
      };
    }

    const criteria = {
      workflowId,
      branch: ref,
      actor: actor.login,
      dispatchedAt,
      previousRunIds: new Set(before.map((run) => run.id)),
    };

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (attempt > 0) await this.sleep(1_200);
      const recent = await this.client.listRuns({
        workflowId,
        branch: ref,
        event: "workflow_dispatch",
        actor: actor.login,
        perPage: 30,
      });
      const run = correlateDispatchedRun(recent, criteria);
      if (run) return { run, correlation: "fallback" };
    }

    throw new AppError(
      504,
      "O workflow foi disparado, mas a nova execução ainda não apareceu na API. Atualize o histórico em instantes.",
      "RUN_CORRELATION_TIMEOUT",
    );
  }

  async listRuns(workflowId?: number): Promise<GitHubRun[]> {
    if (workflowId !== undefined) await this.requireWorkflow(workflowId);
    return this.client.listRuns({ workflowId, perPage: 30 });
  }

  getRun(runId: number): Promise<GitHubRun> {
    return this.client.getRun(runId);
  }

  listJobs(runId: number): Promise<GitHubJob[]> {
    return this.client.listJobs(runId);
  }

  async cancel(runId: number): Promise<void> {
    const run = await this.client.getRun(runId);
    if (run.status === "completed") {
      throw new AppError(409, "Uma execução concluída não pode ser cancelada.", "RUN_ALREADY_COMPLETED");
    }
    await this.client.cancelRun(runId);
  }

  async rerun(runId: number): Promise<void> {
    const run = await this.client.getRun(runId);
    if (run.status !== "completed") {
      throw new AppError(409, "Aguarde a conclusão antes de reexecutar.", "RUN_NOT_COMPLETED");
    }
    if (run.conclusion === "failure" || run.conclusion === "timed_out") {
      await this.client.rerunFailedJobs(runId);
      return;
    }
    await this.client.rerun(runId);
  }

  listArtifacts(runId: number): Promise<GitHubArtifact[]> {
    return this.client.listArtifacts(runId);
  }

  async downloadArtifact(artifactId: number): Promise<ArtifactDownload> {
    const artifact = await this.client.getArtifact(artifactId);
    if (artifact.expired) {
      throw new AppError(410, "Este artefato já expirou.", "ARTIFACT_EXPIRED");
    }
    return { artifact, response: await this.client.downloadArtifact(artifactId) };
  }

  private async requireWorkflow(workflowId: number): Promise<GitHubWorkflow> {
    if (!Number.isSafeInteger(workflowId) || workflowId <= 0) {
      throw new AppError(400, "workflowId inválido.", "INVALID_WORKFLOW_ID");
    }
    const workflows = await this.client.listWorkflows();
    const workflow = workflows.find((item) => item.id === workflowId);
    if (!workflow) throw new AppError(404, "Workflow não permitido ou inexistente.", "WORKFLOW_NOT_FOUND");
    return workflow;
  }

  private async requireBranch(ref: string): Promise<void> {
    if (!ref || ref.length > 255) {
      throw new AppError(400, "Branch inválida.", "INVALID_BRANCH");
    }
    const branches = await this.client.listBranches();
    if (!branches.some((branch) => branch.name === ref)) {
      throw new AppError(404, "Branch não permitida ou inexistente.", "BRANCH_NOT_FOUND");
    }
  }
}
