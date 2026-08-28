import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";
import { GitHubClient } from "./github-client.js";

const config = loadConfig({
  GITHUB_OWNER: "owner",
  GITHUB_REPO: "repo",
  GITHUB_TOKEN: "test-only-token",
  GITHUB_API_URL: "https://api.github.test",
});

describe("GitHubClient", () => {
  it("envia ref e inputs no dispatch e aceita a resposta com run id", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ ref: "feature/qa", inputs: { grupo: "auth" } });
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-only-token");
      return new Response(JSON.stringify({ workflow_run_id: 123, html_url: "https://github.test/run/123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = new GitHubClient(config, fetchMock as typeof fetch);

    await expect(client.dispatchWorkflow(77, "feature/qa", { grupo: "auth" })).resolves.toMatchObject({
      workflow_run_id: 123,
    });
  });

  it("converte respostas conhecidas da API em erro seguro", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "Bad credentials" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }));
    const client = new GitHubClient(config, fetchMock as typeof fetch);

    await expect(client.listWorkflows()).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining("Token do GitHub"),
    });
  });

  it("trata o media type raw+json da API de Contents como texto YAML", async () => {
    const yaml = "name: Playwright\non:\n  workflow_dispatch:\n";
    const fetchMock = vi.fn(async () => new Response(yaml, {
      status: 200,
      headers: { "content-type": "application/vnd.github.raw+json" },
    }));
    const client = new GitHubClient(config, fetchMock as typeof fetch);

    await expect(client.getWorkflowYaml(".github/workflows/playwright.yml", "main")).resolves.toBe(yaml);
  });
});
