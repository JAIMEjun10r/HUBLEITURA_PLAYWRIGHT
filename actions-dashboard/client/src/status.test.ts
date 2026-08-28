import { describe, expect, it } from "vitest";
import { formatDuration, statusView } from "./status";

describe("estados visuais do dashboard", () => {
  it.each([
    ["queued", null, "waiting", "Na fila"],
    ["in_progress", null, "running", "Em execução"],
    ["completed", "success", "success", "Sucesso"],
    ["completed", "failure", "failure", "Falha"],
    ["completed", "cancelled", "cancelled", "Cancelado"],
  ])("mapeia %s/%s", (status, conclusion, key, label) => {
    expect(statusView(status, conclusion)).toEqual({ key, label });
  });

  it("formata a duração da execução", () => {
    expect(formatDuration("2026-08-27T10:00:00Z", "2026-08-27T10:02:08Z")).toBe("2min 8s");
  });
});
