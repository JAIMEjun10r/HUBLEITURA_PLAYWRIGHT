import { describe, expect, it, vi } from "vitest";
import type { GitHubClient } from "./github-client.js";
import { GitHubService } from "./github-service.js";
import type { GitHubRun } from "./types.js";

function exampleRun(id = 123): GitHubRun {
  return {
    getRepository: vi.fn().mockResolvedValue({ full_name: "owner/repo", private: false, visibility: "public", html_url: "" }),
    id,
    run_number: 8,
    run_attempt: 1,
    workflow_id: 77,
    name: "Playwright",
    display_title: "Playwright",
    event: "workflow_dispatch",
    status: "queued",
    conclusion: null,
    head_branch: "main",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    run_started_at: null,
    html_url: `https://github.test/run/${id}`,
    actor: { login: "jaime" },
  };
}

function mockClient(dispatchResult: object | undefined) {
  const run = exampleRun();
  return {
    listWorkflows: vi.fn().mockResolvedValue([{ id: 77, name: "Playwright", path: ".github/workflows/playwright.yml", state: "active", html_url: "" }]),
    listBranches: vi.fn().mockResolvedValue([{ name: "main", protected: true }]),
    getWorkflowYaml: vi.fn().mockResolvedValue(`on:\n  workflow_dispatch:\n    inputs:\n      grupo:\n        required: true\n        type: choice\n        options: [todos, auth]\n        default: todos`),
    getAuthenticatedUser: vi.fn().mockResolvedValue({ login: "jaime" }),
    listRuns: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([run]),
    dispatchWorkflow: vi.fn().mockResolvedValue(dispatchResult),
    getRun: vi.fn().mockResolvedValue(run),
  } as unknown as GitHubClient;
}

describe("GitHubService.dispatch", () => {
  it("usa diretamente o ID retornado pela API atual", async () => {
    const client = mockClient({ workflow_run_id: 123 });
    const service = new GitHubService(client);
    const result = await service.dispatch(77, "main", { grupo: "auth" });

    expect(result.correlation).toBe("github-response");
    expect(result.run.id).toBe(123);
    expect(client.dispatchWorkflow).toHaveBeenCalledWith(77, "main", { grupo: "auth" });
  });

  it("correlaciona por ator e parâmetros quando a API responde sem corpo", async () => {
    const client = mockClient(undefined);
    const service = new GitHubService(client, async () => undefined);
    const result = await service.dispatch(77, "main", { grupo: "todos" });

    expect(result.correlation).toBe("fallback");
    expect(result.run.id).toBe(123);
  });
});
