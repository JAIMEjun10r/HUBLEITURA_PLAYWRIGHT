export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "APP_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export class GitHubApiError extends AppError {
  constructor(
    status: number,
    message: string,
    public readonly rateLimitRemaining?: string | null,
    public readonly rateLimitReset?: string | null,
    details?: unknown,
  ) {
    super(status, message, "GITHUB_API_ERROR", details);
  }
}

const FRIENDLY_MESSAGES: Record<number, string> = {
  401: "Token do GitHub ausente, inválido ou expirado.",
  403: "O token não possui permissão para esta operação ou o limite da API foi atingido.",
  404: "Recurso não encontrado no repositório configurado.",
  409: "A operação está em conflito com o estado atual da execução.",
  422: "O GitHub rejeitou os parâmetros enviados. Confira branch e inputs do workflow.",
};

export function githubErrorMessage(status: number, apiMessage?: string): string {
  const base = FRIENDLY_MESSAGES[status] || `A API do GitHub respondeu com status ${status}.`;
  return apiMessage ? `${base} Detalhe: ${apiMessage}` : base;
}
