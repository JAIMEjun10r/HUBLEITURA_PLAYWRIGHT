import { AppError } from "./errors.js";
import type { GitHubRun } from "./types.js";

export interface CorrelationCriteria {
  workflowId: number;
  branch: string;
  actor: string;
  dispatchedAt: Date;
  previousRunIds: Set<number>;
}

export function correlateDispatchedRun(
  runs: GitHubRun[],
  criteria: CorrelationCriteria,
): GitHubRun | undefined {
  const earliest = criteria.dispatchedAt.getTime() - 5_000;
  const candidates = runs.filter((run) =>
    run.workflow_id === criteria.workflowId
    && run.head_branch === criteria.branch
    && run.event === "workflow_dispatch"
    && run.actor?.login.toLowerCase() === criteria.actor.toLowerCase()
    && new Date(run.created_at).getTime() >= earliest
    && !criteria.previousRunIds.has(run.id));

  if (candidates.length > 1) {
    throw new AppError(
      409,
      "Mais de uma execução corresponde ao disparo. Abra o histórico antes de tentar novamente.",
      "AMBIGUOUS_RUN_CORRELATION",
    );
  }

  return candidates[0];
}
