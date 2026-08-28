import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

type WorkflowStep = {
  uses?: string;
  if?: string;
};

type WorkflowJob = {
  if?: string;
  steps?: WorkflowStep[];
};

type WorkflowDocument = {
  on: {
    workflow_dispatch: {
      inputs: {
        publicar_relatorios: { default: boolean };
      };
    };
  };
  jobs: Record<string, WorkflowJob>;
};

const workflowPath = path.resolve(process.cwd(), "..", ".github", "workflows", "playwright.yml");

describe("privacidade dos relatórios no workflow", () => {
  const workflow = YAML.parse(fs.readFileSync(workflowPath, "utf8")) as WorkflowDocument;

  it("mantém a publicação desabilitada por padrão", () => {
    expect(workflow.on.workflow_dispatch.inputs.publicar_relatorios.default).toBe(false);
  });

  it("protege todo upload no job de testes pela visibilidade privada", () => {
    const uploads = workflow.jobs.testes.steps?.filter((step) => step.uses?.startsWith("actions/upload-artifact@")) || [];
    expect(uploads.length).toBeGreaterThan(0);
    expect(uploads.every((step) => step.if?.includes("github.event.repository.private == true"))).toBe(true);
  });

  it("não executa a consolidação em repositórios públicos", () => {
    expect(workflow.jobs["consolidar-relatorio"].if).toContain("github.event.repository.private == true");
  });
});
