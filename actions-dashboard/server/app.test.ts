import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { DashboardGitHubService } from "./github-service.js";

function serviceMock(): DashboardGitHubService {
  return {
    getRepository: vi.fn().mockResolvedValue({
      full_name: "owner/repo",
      private: false,
      visibility: "public",
      html_url: "https://github.test/owner/repo",
    }),
    listWorkflows: vi.fn().mockResolvedValue([]),
    listBranches: vi.fn().mockResolvedValue([]),
    getWorkflowInputs: vi.fn().mockResolvedValue({ inputs: [], source: "github" }),
    dispatch: vi.fn().mockResolvedValue({ run: { id: 1 }, correlation: "github-response" }),
    listRuns: vi.fn().mockResolvedValue([]),
    getRun: vi.fn(),
    listJobs: vi.fn().mockResolvedValue([]),
    cancel: vi.fn().mockResolvedValue(undefined),
    rerun: vi.fn().mockResolvedValue(undefined),
    listArtifacts: vi.fn().mockResolvedValue([]),
    downloadArtifact: vi.fn(),
  } as unknown as DashboardGitHubService;
}

describe("API interna", () => {
  it("valida IDs antes de chamar o serviço", async () => {
    const service = serviceMock();
    const response = await request(createApp(service, { githubOwner: "owner", githubRepo: "repo" }))
      .get("/api/github/workflows/invalido/inputs?ref=main");

    expect(response.status).toBe(400);
    expect(service.getWorkflowInputs).not.toHaveBeenCalled();
  });

  it("repassa branch e inputs para o disparo", async () => {
    const service = serviceMock();
    const response = await request(createApp(service, { githubOwner: "owner", githubRepo: "repo" }))
      .post("/api/github/workflows/77/dispatch")
      .send({ ref: "main", inputs: { grupo: "auth" } });

    expect(response.status).toBe(201);
    expect(service.dispatch).toHaveBeenCalledWith(77, "main", { grupo: "auth" });
  });

  it("nunca expõe o token na configuração enviada ao frontend", async () => {
    const secret = "github_pat_seg2_test-secret";
    const response = await request(createApp(serviceMock(), { githubOwner: "owner", githubRepo: "repo" }))
      .get("/api/github/repository");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      owner: "owner",
      repo: "repo",
      fullName: "owner/repo",
      private: false,
      visibility: "public",
    });
    expect(response.text).not.toContain(secret);
    expect(response.text.toLowerCase()).not.toContain("token");
  });
});
