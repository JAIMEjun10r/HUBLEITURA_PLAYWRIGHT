const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const testDataDir = path.join(projectRoot, ".playwright");
const testDbPath = path.join(testDataDir, "biblioteca.e2e.db");
const fallbackDbPath = path.join(projectRoot, "database", "biblioteca.db");

fs.mkdirSync(testDataDir, { recursive: true });

const gitShow = spawnSync("git", ["show", "HEAD:database/biblioteca.db"], {
  cwd: projectRoot,
  encoding: "buffer",
  shell: false,
});

if (gitShow.status === 0 && gitShow.stdout.length > 0) {
  fs.writeFileSync(testDbPath, gitShow.stdout);
} else {
  fs.copyFileSync(fallbackDbPath, testDbPath);
}

const server = spawn(process.execPath, [path.join(projectRoot, "src", "server.js")], {
  cwd: projectRoot,
  env: {
    ...process.env,
    HUB_DB_PATH: testDbPath,
  },
  stdio: "inherit",
  shell: false,
});

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code || 0);
});
