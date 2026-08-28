export type VisualStatus = "waiting" | "running" | "success" | "failure" | "cancelled" | "neutral";

export interface StatusView {
  key: VisualStatus;
  label: string;
}

export function statusView(status: string, conclusion: string | null): StatusView {
  if (status !== "completed") {
    if (status === "in_progress") return { key: "running", label: "Em execução" };
    return { key: "waiting", label: status === "waiting" ? "Aguardando aprovação" : "Na fila" };
  }

  if (conclusion === "success") return { key: "success", label: "Sucesso" };
  if (conclusion === "cancelled") return { key: "cancelled", label: "Cancelado" };
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "action_required") {
    return { key: "failure", label: conclusion === "timed_out" ? "Tempo esgotado" : "Falha" };
  }
  return { key: "neutral", label: conclusion || "Concluído" };
}

export function formatDuration(start: string | null, end: string): string {
  if (!start) return "—";
  const milliseconds = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0
    ? `${hours}h ${minutes}min`
    : minutes > 0
      ? `${minutes}min ${remaining}s`
      : `${remaining}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
