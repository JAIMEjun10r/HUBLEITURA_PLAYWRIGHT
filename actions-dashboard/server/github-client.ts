import type { AppConfig } from "./config.js";
import { GitHubApiError, githubErrorMessage } from "./errors.js";
import type {
  DispatchResponse,
  GitHubActor,
  GitHubArtifact,
  GitHubBranch,
  GitHubJob,
  GitHubRepository,
  GitHubRun,
  GitHubWorkflow,
  RunQuery,
} from "./types.js";

type Fetch = typeof fetch;

export class GitHubClient {
  constructor(
    private readonly config: AppConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async listWorkflows(): Promise<GitHubWorkflow[]> {
    const data = await this.request<{ workflows: GitHubWorkflow[] }>("/actions/workflows?per_page=100");
    return data.workflows;
  }

  async getRepository(): Promise<GitHubRepository> {
    return this.request<GitHubRepository>("");
  }

  async listBranches(): Promise<GitHubBranch[]> {
    return this.request<GitHubBranch[]>("/branches?per_page=100");
  }

  async getWorkflow(workflowId: number): Promise<GitHubWorkflow> {
    return this.request<GitHubWorkflow>(`/actions/workflows/${workflowId}`);
  }

  async getWorkflowYaml(path: string, ref: string): Promise<string> {
    return this.request<string>(`/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`, {
      headers: { Accept: "application/vnd.github.raw+json" },
    }, true, true);
  }

  async getAuthenticatedUser(): Promise<GitHubActor> {
    return this.request<GitHubActor>("/user", {}, false);
  }

  async dispatchWorkflow(
    workflowId: number,
    ref: string,
    inputs: Record<string, string | boolean>,
  ): Promise<DispatchResponse | undefined> {
    return this.request<DispatchResponse | undefined>(`/actions/workflows/${workflowId}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref, inputs }),
    });
  }

  async listRuns(query: RunQuery = {}): Promise<GitHubRun[]> {
    const search = new URLSearchParams({ per_page: String(query.perPage || 30) });
    if (query.branch) search.set("branch", query.branch);
    if (query.event) search.set("event", query.event);
    if (query.actor) search.set("actor", query.actor);
    const base = query.workflowId
      ? `/actions/workflows/${query.workflowId}/runs`
      : "/actions/runs";
    const data = await this.request<{ workflow_runs: GitHubRun[] }>(`${base}?${search}`);
    return data.workflow_runs;
  }

  async getRun(runId: number): Promise<GitHubRun> {
    return this.request<GitHubRun>(`/actions/runs/${runId}`);
  }

  async listJobs(runId: number): Promise<GitHubJob[]> {
    const data = await this.request<{ jobs: GitHubJob[] }>(`/actions/runs/${runId}/jobs?per_page=100`);
    return data.jobs;
  }

  async cancelRun(runId: number): Promise<void> {
    await this.request(`/actions/runs/${runId}/cancel`, { method: "POST" });
  }

  async rerunFailedJobs(runId: number): Promise<void> {
    await this.request(`/actions/runs/${runId}/rerun-failed-jobs`, { method: "POST" });
  }

  async rerun(runId: number): Promise<void> {
    await this.request(`/actions/runs/${runId}/rerun`, { method: "POST" });
  }

  async listArtifacts(runId: number): Promise<GitHubArtifact[]> {
    const data = await this.request<{ artifacts: GitHubArtifact[] }>(`/actions/runs/${runId}/artifacts?per_page=100`);
    return data.artifacts;
  }

  async getArtifact(artifactId: number): Promise<GitHubArtifact> {
    return this.request<GitHubArtifact>(`/actions/artifacts/${artifactId}`);
  }

  async downloadArtifact(artifactId: number): Promise<Response> {
    return this.rawRequest(`/actions/artifacts/${artifactId}/zip`);
  }

  private repositoryUrl(path: string): string {
    const { githubApiUrl, githubOwner, githubRepo } = this.config;
    return `${githubApiUrl}/repos/${encodeURIComponent(githubOwner)}/${encodeURIComponent(githubRepo)}${path}`;
  }

  private async request<T = void>(
    path: string,
    init: RequestInit = {},
    repositoryPath = true,
    parseAsText = false,
  ): Promise<T> {
    const url = repositoryPath ? this.repositoryUrl(path) : `${this.config.githubApiUrl}${path}`;
    const response = await this.fetchImpl(url, this.buildInit(init));
    if (!response.ok) await this.throwApiError(response);
    if (response.status === 204) return undefined as T;

    if (parseAsText) return response.text() as Promise<T>;
    const contentType = response.headers.get("content-type") || "";
    return (contentType.includes("json") ? response.json() : response.text()) as Promise<T>;
  }

  private async rawRequest(path: string): Promise<Response> {
    const response = await this.fetchImpl(this.repositoryUrl(path), this.buildInit({ redirect: "follow" }));
    if (!response.ok) await this.throwApiError(response);
    return response;
  }

  private buildInit(init: RequestInit): RequestInit {
    const headers = new Headers(init.headers);
    headers.set("Accept", headers.get("Accept") || "application/vnd.github+json");
    headers.set("X-GitHub-Api-Version", this.config.githubApiVersion);
    headers.set("User-Agent", "hubleitura-actions-dashboard");
    if (init.body) headers.set("Content-Type", "application/json");
    if (this.config.githubToken) headers.set("Authorization", `Bearer ${this.config.githubToken}`);
    return { ...init, headers };
  }

  private async throwApiError(response: Response): Promise<never> {
    let details: unknown;
    let apiMessage: string | undefined;
    try {
      details = await response.json();
      if (details && typeof details === "object" && "message" in details) {
        apiMessage = String((details as { message: unknown }).message);
      }
    } catch {
      details = undefined;
    }

    throw new GitHubApiError(
      response.status,
      githubErrorMessage(response.status, apiMessage),
      response.headers.get("x-ratelimit-remaining"),
      response.headers.get("x-ratelimit-reset"),
      details,
    );
  }
}
