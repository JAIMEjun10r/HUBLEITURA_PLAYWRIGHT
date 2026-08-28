import path from "node:path";
import { Readable } from "node:stream";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AppConfig } from "./config.js";
import { AppError, GitHubApiError } from "./errors.js";
import type { DashboardGitHubService } from "./github-service.js";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

function asyncRoute(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

function positiveId(value: string | string[], label: string): number {
  if (Array.isArray(value)) {
    throw new AppError(400, `${label} inválido.`, "INVALID_ID");
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(400, `${label} inválido.`, "INVALID_ID");
  }
  return id;
}

export function createApp(
  service: DashboardGitHubService,
  config: Pick<AppConfig, "githubOwner" | "githubRepo">,
  staticDirectory?: string,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' https://avatars.githubusercontent.com data:; style-src 'self' 'unsafe-inline'; connect-src 'self'");
    next();
  });
  app.use(express.json({ limit: "64kb" }));

  app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
  app.get("/api/github/repository", asyncRoute(async (_request, response) => {
    const repository = await service.getRepository();
    response.json({
      owner: config.githubOwner,
      repo: config.githubRepo,
      fullName: repository.full_name,
      private: repository.private,
      visibility: repository.visibility,
    });
  }));

  app.get("/api/github/workflows", asyncRoute(async (_request, response) => {
    response.json({ workflows: await service.listWorkflows() });
  }));
  app.get("/api/github/branches", asyncRoute(async (_request, response) => {
    response.json({ branches: await service.listBranches() });
  }));
  app.get("/api/github/workflows/:workflowId/inputs", asyncRoute(async (request, response) => {
    const workflowId = positiveId(request.params.workflowId, "workflowId");
    const ref = typeof request.query.ref === "string" ? request.query.ref : "";
    response.json(await service.getWorkflowInputs(workflowId, ref));
  }));
  app.post("/api/github/workflows/:workflowId/dispatch", asyncRoute(async (request, response) => {
    const workflowId = positiveId(request.params.workflowId, "workflowId");
    const { ref, inputs } = request.body || {};
    if (typeof ref !== "string") throw new AppError(400, "ref é obrigatório.", "INVALID_BRANCH");
    response.status(201).json(await service.dispatch(workflowId, ref, inputs));
  }));
  app.get("/api/github/runs", asyncRoute(async (request, response) => {
    const workflowId = request.query.workflowId === undefined
      ? undefined
      : positiveId(String(request.query.workflowId), "workflowId");
    response.json({ runs: await service.listRuns(workflowId) });
  }));
  app.get("/api/github/runs/:runId", asyncRoute(async (request, response) => {
    response.json({ run: await service.getRun(positiveId(request.params.runId, "runId")) });
  }));
  app.get("/api/github/runs/:runId/jobs", asyncRoute(async (request, response) => {
    response.json({ jobs: await service.listJobs(positiveId(request.params.runId, "runId")) });
  }));
  app.post("/api/github/runs/:runId/cancel", asyncRoute(async (request, response) => {
    await service.cancel(positiveId(request.params.runId, "runId"));
    response.status(202).json({ message: "Cancelamento solicitado." });
  }));
  app.post("/api/github/runs/:runId/rerun", asyncRoute(async (request, response) => {
    await service.rerun(positiveId(request.params.runId, "runId"));
    response.status(201).json({ message: "Reexecução solicitada." });
  }));
  app.get("/api/github/runs/:runId/artifacts", asyncRoute(async (request, response) => {
    response.json({ artifacts: await service.listArtifacts(positiveId(request.params.runId, "runId")) });
  }));
  app.get("/api/github/artifacts/:artifactId/download", asyncRoute(async (request, response) => {
    const { artifact, response: githubResponse } = await service.downloadArtifact(
      positiveId(request.params.artifactId, "artifactId"),
    );
    response.setHeader("Content-Type", githubResponse.headers.get("content-type") || "application/zip");
    response.setHeader("Content-Disposition", `attachment; filename="${artifact.name.replace(/[^A-Za-z0-9_.-]/g, "-")}.zip"`);
    if (!githubResponse.body) throw new AppError(502, "O GitHub retornou um artefato vazio.", "EMPTY_ARTIFACT");
    Readable.fromWeb(githubResponse.body as import("node:stream/web").ReadableStream).pipe(response);
  }));

  if (staticDirectory) {
    app.use(express.static(staticDirectory));
    app.use((request, response, next) => {
      if (request.method !== "GET" || request.path.startsWith("/api/")) return next();
      response.sendFile(path.join(staticDirectory, "index.html"));
    });
  }

  app.use((_request, response) => response.status(404).json({ error: { code: "NOT_FOUND", message: "Rota não encontrada." } }));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const appError = error instanceof AppError
      ? error
      : new AppError(500, "Erro interno inesperado.", "INTERNAL_ERROR");
    const body: Record<string, unknown> = {
      error: { code: appError.code, message: appError.message },
    };
    if (appError instanceof GitHubApiError && appError.rateLimitRemaining === "0") {
      body.rateLimit = { remaining: 0, resetAt: appError.rateLimitReset };
    }
    response.status(appError.status).json(body);
  });

  return app;
}
