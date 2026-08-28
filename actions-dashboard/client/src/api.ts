export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new ApiError(
      body?.error?.message || `Falha na requisição (${response.status}).`,
      response.status,
      body?.error?.code,
    );
  }

  return body as T;
}
