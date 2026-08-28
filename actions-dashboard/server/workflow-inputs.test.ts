import { describe, expect, it } from "vitest";
import { normalizeDispatchInputs, parseWorkflowInputs } from "./workflow-inputs.js";

const workflow = `
name: Test
on:
  workflow_dispatch:
    inputs:
      grupo:
        description: Grupo
        required: true
        type: choice
        default: todos
        options: [todos, auth]
      publicar:
        type: boolean
        default: true
      destino:
        type: environment
        required: true
`;

describe("workflow inputs", () => {
  it("converte a definição YAML nos quatro tipos suportados", () => {
    expect(parseWorkflowInputs(workflow)).toEqual([
      {
        name: "grupo",
        description: "Grupo",
        required: true,
        type: "choice",
        default: "todos",
        options: ["todos", "auth"],
      },
      {
        name: "publicar",
        description: "",
        required: false,
        type: "boolean",
        default: true,
        options: [],
      },
      {
        name: "destino",
        description: "",
        required: true,
        type: "environment",
        options: [],
      },
    ]);
  });

  it("normaliza booleanos e defaults antes do dispatch", () => {
    const definitions = parseWorkflowInputs(workflow);
    expect(normalizeDispatchInputs(definitions, { publicar: "false", destino: "qa" })).toEqual({
      grupo: "todos",
      publicar: false,
      destino: "qa",
    });
  });

  it("rejeita choices inválidos, campos obrigatórios e inputs desconhecidos", () => {
    const definitions = parseWorkflowInputs(workflow);
    expect(() => normalizeDispatchInputs(definitions, { grupo: "admin", destino: "qa" })).toThrow(/opções permitidas/);
    expect(() => normalizeDispatchInputs(definitions, { grupo: "todos" })).toThrow(/destino.*obrigatório/);
    expect(() => normalizeDispatchInputs(definitions, { grupo: "todos", destino: "qa", token: "x" })).toThrow(/desconhecidos/);
  });
});
