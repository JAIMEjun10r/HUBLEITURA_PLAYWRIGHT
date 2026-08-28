export interface AppConfig {
  githubToken?: string;
  githubOwner: string;
  githubRepo: string;
  githubApiVersion: string;
  githubApiUrl: string;
  port: number;
}

const REPOSITORY_PART = /^[A-Za-z0-9_.-]+$/;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const githubOwner = env.GITHUB_OWNER?.trim() || "JAIMEjun10r";
  const githubRepo = env.GITHUB_REPO?.trim() || "HUBLEITURA_PLAYWRIGHT";
  const githubToken = env.GITHUB_TOKEN?.trim() || undefined;
  const port = Number(env.PORT || 4000);

  if (!REPOSITORY_PART.test(githubOwner) || !REPOSITORY_PART.test(githubRepo)) {
    throw new Error("GITHUB_OWNER e GITHUB_REPO contêm caracteres inválidos.");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT deve ser um número inteiro entre 1 e 65535.");
  }

  return {
    githubToken,
    githubOwner,
    githubRepo,
    githubApiVersion: env.GITHUB_API_VERSION?.trim() || "2026-03-10",
    githubApiUrl: env.GITHUB_API_URL?.trim() || "https://api.github.com",
    port,
  };
}
