import path from "node:path";
import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { GitHubClient } from "./github-client.js";
import { GitHubService } from "./github-service.js";

const config = loadConfig();
const client = new GitHubClient(config);
const service = new GitHubService(client);
const staticDirectory = process.env.NODE_ENV === "production"
  ? path.resolve(process.cwd(), "dist/client")
  : undefined;
const app = createApp(service, config, staticDirectory);

app.listen(config.port, () => {
  console.log(`Actions Dashboard disponível em http://localhost:${config.port}`);
  if (!config.githubToken) {
    console.log("GITHUB_TOKEN não configurado: leituras públicas funcionam, ações de escrita ficarão indisponíveis.");
  }
});
