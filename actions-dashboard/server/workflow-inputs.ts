import YAML from "yaml";
import { AppError } from "./errors.js";
import type { WorkflowInputDefinition, WorkflowInputType } from "./types.js";

const SUPPORTED_TYPES = new Set<WorkflowInputType>([
  "string",
  "boolean",
  "choice",
  "environment",
]);

export function parseWorkflowInputs(yamlSource: string): WorkflowInputDefinition[] {
  let document: unknown;

  try {
    document = YAML.parse(yamlSource);
  } catch {
    throw new AppError(422, "Não foi possível interpretar o YAML do workflow.", "INVALID_WORKFLOW_YAML");
  }

  const root = asRecord(document);
  const triggers = asRecord(root.on);
  const dispatch = asRecord(triggers.workflow_dispatch);
  const inputs = asRecord(dispatch.inputs);

  return Object.entries(inputs).map(([name, value]) => normalizeDefinition(name, asRecord(value)));
}

function normalizeDefinition(name: string, raw: Record<string, unknown>): WorkflowInputDefinition {
  const declaredType = typeof raw.type === "string" ? raw.type : "string";
  const type = SUPPORTED_TYPES.has(declaredType as WorkflowInputType)
    ? (declaredType as WorkflowInputType)
    : "string";
  const options = Array.isArray(raw.options) ? raw.options.map(String) : [];
  const definition: WorkflowInputDefinition = {
    name,
    description: typeof raw.description === "string" ? raw.description : "",
    required: raw.required === true,
    type,
    options,
  };

  if (raw.default !== undefined && (typeof raw.default === "string" || typeof raw.default === "boolean" || typeof raw.default === "number")) {
    definition.default = type === "boolean" ? raw.default === true || raw.default === "true" : String(raw.default);
  }

  return definition;
}

export function normalizeDispatchInputs(
  definitions: WorkflowInputDefinition[],
  rawInputs: unknown,
): Record<string, string | boolean> {
  const values = asRecord(rawInputs);
  const knownNames = new Set(definitions.map((definition) => definition.name));
  const unknownNames = Object.keys(values).filter((name) => !knownNames.has(name));

  if (unknownNames.length > 0) {
    throw new AppError(400, `Inputs desconhecidos: ${unknownNames.join(", ")}.`, "INVALID_INPUTS");
  }

  const normalized: Record<string, string | boolean> = {};

  for (const definition of definitions) {
    let value = values[definition.name];
    if (value === undefined || value === null || value === "") value = definition.default;

    if (value === undefined) {
      if (definition.required) {
        throw new AppError(400, `O input “${definition.name}” é obrigatório.`, "INVALID_INPUTS");
      }
      continue;
    }

    if (definition.type === "boolean") {
      if (value !== true && value !== false && value !== "true" && value !== "false") {
        throw new AppError(400, `O input “${definition.name}” deve ser booleano.`, "INVALID_INPUTS");
      }
      normalized[definition.name] = value === true || value === "true";
      continue;
    }

    const stringValue = String(value).trim();
    if (definition.required && !stringValue) {
      throw new AppError(400, `O input “${definition.name}” é obrigatório.`, "INVALID_INPUTS");
    }
    if (definition.type === "choice" && !definition.options.includes(stringValue)) {
      throw new AppError(400, `O input “${definition.name}” deve ser uma das opções permitidas.`, "INVALID_INPUTS");
    }
    normalized[definition.name] = stringValue;
  }

  return normalized;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const PLAYWRIGHT_INPUTS_FALLBACK: WorkflowInputDefinition[] = [
  {
    name: "grupo",
    description: "Grupo funcional de testes",
    required: true,
    type: "choice",
    default: "todos",
    options: ["todos", "auth", "catalogo", "cesta", "reservas", "admin"],
  },
  {
    name: "navegador",
    description: "Navegador usado pelo Playwright",
    required: true,
    type: "choice",
    default: "chromium",
    options: ["chromium"],
  },
  {
    name: "publicar_relatorios",
    description: "Publicar artefatos somente se o repositório for privado",
    required: false,
    type: "boolean",
    default: false,
    options: [],
  },
  {
    name: "ambiente",
    description: "Rótulo exposto em TEST_ENV nos relatórios",
    required: true,
    type: "string",
    default: "CI",
    options: [],
  },
];
