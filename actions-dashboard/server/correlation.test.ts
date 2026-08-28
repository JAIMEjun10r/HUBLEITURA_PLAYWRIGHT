import { describe, expect, it } from "vitest";
import { correlateDispatchedRun } from "./correlation.js";
import type { GitHubRun } from "./types.js";

function run(overrides: Partial<GitHubRun> = {}): GitHubRun {
  return {
    id: 20,
    run_number: 4,
    run_attempt: 1,
    workflow_id: 10,
    name: "Playwright",
    display_title: "Playwright",
    event: "workflow_dispatch",
    status: "queued",
    conclusion: null,
    head_branch: "main",
    created_at: "2026-08-27T12:00:01.000Z",
    updated_at: "2026-08-27T12:00:01.000Z",
    run_started_at: null,
    html_url: "https://github.com/example/actions/runs/20",
    actor: { login: "jaime" },
    ...overrides,
  };
}

const criteria = {
  workflowId: 10,
  branch: "main",
  actor: "Jaime",
  dispatchedAt: new Date("2026-08-27T12:00:00.000Z"),
  previousRunIds: new Set([19]),
};

describe("correlação de execução", () => {
  it("seleciona somente a execução nova do mesmo workflow, branch, evento e ator", () => {
    expect(correlateDispatchedRun([
      run({ id: 19 }),
      run({ id: 21, actor: { login: "outra-pessoa" } }),
      run(),
    ], criteria)?.id).toBe(20);
  });

  it("não seleciona uma execução anterior ao disparo", () => {
    expect(correlateDispatchedRun([run({ created_at: "2026-08-27T11:59:00.000Z" })], criteria)).toBeUndefined();
  });

  it("falha de forma segura quando há mais de uma candidata", () => {
    expect(() => correlateDispatchedRun([run(), run({ id: 21 })], criteria)).toThrow(/Mais de uma execução/);
  });
});
