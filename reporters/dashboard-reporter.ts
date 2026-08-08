import fs from "node:fs";
import path from "node:path";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestStep } from "@playwright/test/reporter";

// Reporter customizado do Playwright: gera um relatório HTML único e
// autocontido (test-results/relatorio_execucao_<datetime>.html), com
// dashboard (donut PASS/FAIL/SKIP + barras de tempo), tabela por suíte e um
// painel de "log" por cenário com os passos de negócio (via test.step()),
// motivo da falha, screenshot e stack trace. Pensado pra ser aberto e
// mandado direto pra gerência, sem depender de nenhuma outra ferramenta de
// relatório (Allure, HTML report nativo, etc. podem continuar coexistindo
// normalmente). Ver README.md em dashboard-reporter-toolkit/ para mais detalhes.

type RowStatus = "PASS" | "FAIL" | "SKIP";

interface StepView {
  title: string;
  status: RowStatus;
  duration: string;
}

interface ScreenshotView {
  path: string;
  title: string;
}

interface RowView {
  id: string;
  code: string;
  label: string;
  suite: string;
  status: RowStatus;
  duration: string;
  durationSecs: number;
  steps: StepView[];
  errorMessage?: string;
  errorStack?: string;
  lastStepTitle?: string;
  screenshots: ScreenshotView[];
  videoPath?: string;
}

const CODE_PATTERN = /^([A-Z]{2,6}\d{2,4})\s*[-–—]\s*(.*)$/;

// Erros do Playwright vêm com códigos de cor ANSI (usados para colorir o
// terminal); sem remover, aparecem como "[2m", "[31m" etc. no HTML.
const ESC = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(ESC + "\\[[0-9;]*m", "g");

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function statusOf(status: string): RowStatus {
  if (status === "passed") return "PASS";
  if (status === "skipped") return "SKIP";
  return "FAIL"; // failed | timedOut | interrupted
}

function suiteTitleOf(test: TestCase): string {
  const parent = test.parent;
  if (parent && parent.type === "describe" && parent.title) return parent.title;
  return "Geral";
}

// Busca os test.step() que envolvem os métodos dos Page Objects, em
// qualquer profundidade (incluindo dentro de "Before Hooks"/beforeEach,
// onde entram open()/confirmAuthenticated()) — mas sem descer dentro de um
// test.step já encontrado, pra não repetir os passos aninhados nele (ex.:
// "Criar original" dentro de "Definir tipo de arquivamento"). As ações
// brutas (fill/click/expect) nunca aparecem aqui — é isso que dá a
// granularidade "por keyword" do log.
function collectNamedSteps(steps: TestStep[]): TestStep[] {
  const result: TestStep[] = [];
  for (const step of steps) {
    if (step.category === "test.step") {
      result.push(step);
    } else {
      result.push(...collectNamedSteps(step.steps));
    }
  }
  return result;
}

function playwrightVersion(): string {
  try {
    return require("@playwright/test/package.json").version as string;
  } catch {
    return "";
  }
}

export interface DashboardReporterOptions {
  /** Pasta de saída, relativa à raiz do projeto (onde está o playwright.config). Padrão: "test-results". */
  outputDir?: string;
  /** Nome do projeto exibido no cabeçalho. Padrão: env REPORT_PROJECT_NAME, senão "Projeto". */
  projectName?: string;
  /** Rótulo do ambiente (badge no cabeçalho). Padrão: env REPORT_ENVIRONMENT, senão "-". */
  environment?: string;
  /** Regex pra extrair o código do cenário do título do teste (ex.: "CT001 - ..." -> "CT001"). Padrão cobre a maioria das convenções (2-6 letras + 2-4 dígitos). */
  codePattern?: RegExp;
}

export default class DashboardReporter implements Reporter {
  private startTime = 0;
  private rootSuite: Suite | undefined;
  private outputDir = "test-results";
  private readonly options: DashboardReporterOptions;

  constructor(options: DashboardReporterOptions = {}) {
    this.options = options;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startTime = Date.now();
    this.rootSuite = suite;
    // process.cwd(): diretório de onde `playwright test` foi chamado — na
    // prática, a raiz do projeto. Não usamos config.rootDir porque, quando
    // `testDir` é configurado, ele aponta pra dentro do testDir, não pra
    // raiz (comportamento observado, diferente do que a doc do Playwright
    // sugere).
    this.outputDir = path.resolve(process.cwd(), this.options.outputDir ?? "test-results");
  }

  onEnd(_result: FullResult): void {
    if (!this.rootSuite) return;

    fs.mkdirSync(this.outputDir, { recursive: true });

    const codePattern = this.options.codePattern ?? CODE_PATTERN;
    const rows = this.rootSuite.allTests().map((test, index) => this.buildRow(test, index, codePattern));
    const html = renderReport(rows, this.startTime, Date.now(), this.options);

    const stamp = new Date(this.startTime).toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(this.outputDir, `relatorio_execucao_${stamp}.html`);

    fs.writeFileSync(filePath, html, "utf-8");
    fs.writeFileSync(path.join(this.outputDir, "relatorio_execucao_latest.html"), html, "utf-8");

    console.log(`RELATORIO_GERADO:${filePath}`);
  }

  private buildRow(test: TestCase, index: number, codePattern: RegExp): RowView {
    const result = test.results[test.results.length - 1];
    const match = codePattern.exec(test.title);
    const code = match?.[1] ?? "—";
    const label = match?.[2] ?? test.title;
    const status = result ? statusOf(result.status) : "SKIP";
    const steps = result ? collectNamedSteps(result.steps) : [];
    const failingStep = steps.find((step) => step.error);
    const id = `t${index}`;

    const screenshots = (result?.attachments ?? [])
      .filter((a) => a.contentType.startsWith("image/") && a.path)
      .map((a, i) => ({
        path: this.copyEvidence(a.path!, id, `s${i}${path.extname(a.path!)}`),
        title: path.basename(a.path!),
      }));

    const video = (result?.attachments ?? []).find(
      (a) => a.contentType.startsWith("video/") && a.path,
    );

    return {
      id,
      code,
      label,
      suite: suiteTitleOf(test),
      status,
      duration: formatDuration(result?.duration ?? 0),
      durationSecs: Math.round((result?.duration ?? 0) / 1000),
      steps: steps.map((step) => ({
        title: step.title,
        status: step.error ? "FAIL" : "PASS",
        duration: formatDuration(step.duration),
      })),
      errorMessage: result?.error?.message ? stripAnsi(result.error.message) : undefined,
      errorStack: result?.error?.stack ? stripAnsi(result.error.stack) : undefined,
      lastStepTitle: failingStep?.title,
      screenshots,
      videoPath: video ? this.copyEvidence(video.path!, id, `video${path.extname(video.path!)}`) : undefined,
    };
  }

  // Copia o attachment (nome de arquivo/pasta original do Playwright pode
  // passar de 60 caracteres, o que estoura o limite de 260 caracteres de
  // caminho no Windows ao extrair o relatório de um zip baixado da pipeline)
  // para uma pasta curta e previsível (evidencias/<id>/), e devolve o
  // caminho relativo a partir daí. REPORT_GROUP (setado na matriz da CI)
  // prefixa a pasta pra não colidir quando vários grupos são mesclados num
  // relatório consolidado.
  private copyEvidence(sourcePath: string, id: string, fileName: string): string {
    const prefix = process.env.REPORT_GROUP ? `${process.env.REPORT_GROUP}-` : "";
    const destDir = path.join(this.outputDir, "evidencias", `${prefix}${id}`);
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, fileName);
    fs.copyFileSync(sourcePath, destPath);
    return path.relative(this.outputDir, destPath).split(path.sep).join("/");
  }
}

// ── Dashboard (donut PASS/FAIL/SKIP + barras de tempo por cenário) ──────────

function buildDonut(nPass: number, nFail: number, nSkip: number): string {
  const total = nPass + nFail + nSkip;
  const circ = 2 * Math.PI * 38;
  const passColor = "#16A34A";
  const failColor = "#DC2626";
  const skipColor = "#D97706";

  let ring: string;
  if (total === 0) {
    ring = `<circle cx="50" cy="50" r="38" fill="none" stroke="#E8EEF5" stroke-width="14"/>`;
  } else {
    let offset = 0;
    const segments: string[] = [
      `<circle cx="50" cy="50" r="38" fill="none" stroke="#E8EEF5" stroke-width="14"/>`,
    ];
    for (const [count, color] of [
      [nPass, passColor],
      [nFail, failColor],
      [nSkip, skipColor],
    ] as const) {
      if (count === 0) continue;
      const dash = (count / total) * circ;
      segments.push(
        `<circle cx="50" cy="50" r="38" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-dashoffset="-${offset.toFixed(1)}"/>`,
      );
      offset += dash;
    }
    ring = segments.join("");
  }

  return `
    <div class="chart-card">
      <div class="chart-title">Distribuição</div>
      <div class="donut-wrap">
        <svg width="104" height="104" viewBox="0 0 100 100" style="flex-shrink:0;transform:rotate(-90deg)">
          ${ring}
          <text x="50" y="54" text-anchor="middle" fill="#1A2433" font-size="17" font-weight="800" font-family="system-ui" transform="rotate(90,50,50)">${total}</text>
          <text x="50" y="65" text-anchor="middle" fill="#6B7E96" font-size="8" font-family="system-ui" transform="rotate(90,50,50)">TOTAL</text>
        </svg>
        <div class="donut-legend">
          <div class="legend-item"><span class="legend-dot" style="background:${passColor}"></span>PASS<span class="legend-val">${nPass}</span></div>
          <div class="legend-item"><span class="legend-dot" style="background:${failColor}"></span>FAIL<span class="legend-val">${nFail}</span></div>
          <div class="legend-item"><span class="legend-dot" style="background:${skipColor}"></span>SKIP<span class="legend-val">${nSkip}</span></div>
        </div>
      </div>
    </div>`;
}

function buildTimeBars(rows: RowView[]): string {
  const withCode = rows.filter((r) => r.code !== "—").sort((a, b) => b.durationSecs - a.durationSecs);
  if (withCode.length === 0) return "";

  const maxSecs = Math.max(...withCode.map((r) => r.durationSecs), 1);
  const bars = withCode
    .map((r) => {
      const pct = Math.round((r.durationSecs / maxSecs) * 100);
      const css = r.status === "PASS" ? "pass" : r.status === "FAIL" ? "fail" : "skip";
      return `<div class="bar-row"><div class="bar-label">${escapeHtml(r.code)}</div><div class="bar-track"><div class="bar-fill bar-fill-${css}" style="width:${pct}%"></div></div><div class="bar-time">${r.duration}</div></div>`;
    })
    .join("");

  return `
    <div class="chart-card">
      <div class="chart-title">Tempo por cenário <span style="font-size:9px;color:#94A3B8;font-weight:500;text-transform:none;letter-spacing:0">(ordem decrescente)</span></div>
      <div class="bar-list">${bars}</div>
    </div>`;
}

// ── Tabela de cenários por suite ─────────────────────────────────────────────

function pill(status: RowStatus): string {
  if (status === "PASS") return '<span class="pill pill-pass"><span class="dot dot-pass"></span>PASS</span>';
  if (status === "FAIL") return '<span class="pill pill-fail"><span class="dot dot-fail"></span>FAIL</span>';
  return '<span class="pill pill-skip"><span class="dot dot-skip"></span>SKIP</span>';
}

function buildLogButton(row: RowView): string {
  if (row.status === "SKIP" && row.steps.length === 0) return '<span class="ev-none">—</span>';
  const cls = row.status === "FAIL" ? "fail" : "pass";
  const icon = row.status === "FAIL" ? "&#10060;" : "&#9989;";
  return `<button class="log-badge log-badge-${cls}" onclick="openLog(event,'log-${row.id}')">${icon} Log</button>`;
}

function buildEvidenceButton(row: RowView): string {
  if (row.screenshots.length === 0) return '<span class="ev-none">—</span>';
  return `<button class="log-badge" style="background:#EEF4FF;color:#2563EB" onclick="openLightbox('${row.id}',0)">&#128444; ${row.screenshots.length}</button>`;
}

function buildVideoButton(row: RowView): string {
  if (!row.videoPath) return '<span class="vid-none">—</span>';
  return `<button class="vid-btn" onclick="openVideo('${escapeHtml(row.videoPath)}')">&#9654; Vídeo</button>`;
}

function buildSection(suite: string, rows: RowView[]): string {
  const rowsHtml = rows
    .map(
      (r) => `
        <tr class="data-row">
          <td><span class="scenario-code">${escapeHtml(r.code)}</span></td>
          <td>${escapeHtml(r.label)}</td>
          <td class="num">${pill(r.status)}</td>
          <td class="time">${r.duration}</td>
          <td class="num">${buildLogButton(r)}</td>
          <td class="num">${buildEvidenceButton(r)}</td>
          <td class="num">${buildVideoButton(r)}</td>
        </tr>`,
    )
    .join("");

  return `
  <div class="section">
    <div class="section-header">
      <span class="section-title">${escapeHtml(suite)}</span>
      <span class="section-tag">${rows.length} cenário${rows.length === 1 ? "" : "s"}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Cenário</th>
            <th class="num">Status</th>
            <th class="num">Tempo</th>
            <th class="num">Log</th>
            <th class="num">Evidências</th>
            <th class="num">Vídeo</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </div>`;
}

// ── Painéis de log (um por cenário) ──────────────────────────────────────────

function buildLogPanel(row: RowView): string {
  const cls = row.status === "FAIL" ? "fail" : "pass";
  const icon = row.status === "FAIL" ? "&#10060;" : "&#9989;";
  const resultLabel = row.status === "FAIL" ? "encerrado com FAIL" : "concluído com sucesso";

  const stepsHtml = row.steps.length
    ? `
    <div class="log-section" style="margin-top:2px">Passos Executados</div>
    <div class="log-steps">${row.steps
      .map(
        (s) =>
          `<div class="log-step"><span class="log-step-icon" style="color:${s.status === "FAIL" ? "#DC2626" : "#16A34A"}">${s.status === "FAIL" ? "&#10007;" : "&#10003;"}</span><span>${escapeHtml(s.title)} <span style="color:#94A3B8">(${s.duration})</span></span></div>`,
      )
      .join("")}</div>`
    : "";

  const failHtml =
    row.status === "FAIL"
      ? `
    <div class="log-fail-row">
      <div class="log-fail-label">&#128308; Motivo da Falha</div>
      <div class="log-fail-value">${escapeHtml(row.errorMessage ?? "Erro não especificado")}</div>
    </div>
    ${
      row.lastStepTitle
        ? `<div class="log-fail-row"><div class="log-fail-label">&#128205; Última Ação</div><div class="log-fail-value">${escapeHtml(row.lastStepTitle)}</div></div>`
        : ""
    }
    ${
      row.screenshots[0]
        ? `<div class="log-fail-row"><div class="log-fail-label">&#128248; Screenshot</div><img class="log-thumb" src="${escapeHtml(row.screenshots[0].path)}" onclick="openLightbox('${row.id}',0)" title="Clique para ampliar"></div>`
        : ""
    }
    ${
      row.errorStack
        ? `<details class="log-trace"><summary>&#128317; Stack trace completo</summary><pre>${escapeHtml(row.errorStack)}</pre></details>`
        : ""
    }`
      : "";

  return `
<div class="log-panel" id="log-${row.id}">
  <div class="log-panel-header ${cls}">
    <span class="log-panel-title ${cls}">${icon} Log &mdash; ${escapeHtml(row.code)} &middot; ${escapeHtml(row.label)}</span>
    <button class="log-panel-close" onclick="closeLog('log-${row.id}')">&#10005;</button>
  </div>
  <div class="log-body">
    <div class="log-section">Resultado</div>
    <div class="log-msg-${cls}">${icon} ${row.status} &mdash; Cenário ${resultLabel} em ${row.duration}</div>
    ${stepsHtml}
    ${failHtml}
  </div>
</div>`;
}

// ── Documento completo ────────────────────────────────────────────────────────

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F0F4F9; color: #1A2433; padding: 32px 24px; min-height: 100vh; }
.page { max-width: 1000px; margin: 0 auto; }
.header { background: #0D1F3C; border-radius: 12px; padding: 28px 32px; margin-bottom: 24px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.header-left { flex: 1; }
.header-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #7BA7D1; margin-bottom: 6px; }
.header-title { font-size: 22px; font-weight: 700; color: #FFFFFF; line-height: 1.25; }
.header-meta { margin-top: 10px; display: flex; gap: 16px; flex-wrap: wrap; }
.meta-item { font-size: 12.5px; color: #8FAFCC; }
.meta-item strong { color: #C8DCF0; font-weight: 600; }
.badge-env { background: #1B3A5C; border: 1px solid #2B5280; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; color: #7EC8E3; letter-spacing: .08em; white-space: nowrap; align-self: center; }
.kpi-strip { display: grid; gap: 12px; margin-bottom: 24px; }
.kpi { background: #FFFFFF; border-radius: 10px; padding: 18px 20px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.kpi-value { font-size: 34px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.kpi-label { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #6B7E96; margin-top: 4px; }
.kpi-total .kpi-value { color: #2563EB; }
.kpi-pass  .kpi-value { color: #16A34A; }
.kpi-fail  .kpi-value { color: #DC2626; }
.kpi-skip  .kpi-value { color: #D97706; }
.dashboard{display:grid;grid-template-columns:220px 1fr;gap:16px;margin-bottom:24px;}
@media(max-width:780px){.dashboard{grid-template-columns:1fr;}}
.chart-card{background:#FFFFFF;border-radius:10px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.07);}
.chart-title{font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#3A5270;margin-bottom:14px;}
.donut-wrap{display:flex;align-items:center;gap:16px;}
.donut-legend{display:flex;flex-direction:column;gap:6px;}
.legend-item{display:flex;align-items:center;gap:7px;font-size:11.5px;color:#2A3D55;}
.legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
.legend-val{font-weight:700;font-variant-numeric:tabular-nums;margin-left:auto;padding-left:8px;color:#1A2433;}
.bar-list{display:flex;flex-direction:column;gap:9px;}
.bar-row{display:flex;align-items:center;gap:8px;}
.bar-label{font-size:10.5px;color:#4A6785;font-weight:600;width:54px;flex-shrink:0;}
.bar-track{flex:1;background:#EEF2F7;border-radius:4px;height:14px;overflow:hidden;}
.bar-fill{height:100%;border-radius:4px;}
.bar-fill-pass{background:linear-gradient(90deg,#2563EB,#3B82F6);}
.bar-fill-fail{background:linear-gradient(90deg,#DC2626,#EF4444);}
.bar-fill-skip{background:linear-gradient(90deg,#D97706,#F59E0B);}
.bar-time{font-size:10.5px;font-weight:700;color:#2A3D55;font-variant-numeric:tabular-nums;width:38px;text-align:right;flex-shrink:0;}
.section { margin-bottom: 24px; }
.section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.section-title { font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #3A5270; }
.section-tag { font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 99px; background: #E8F0FA; color: #2563EB; }
.table-wrap { overflow-x: auto; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.07); -ms-overflow-style: none; scrollbar-width: none; }
.table-wrap::-webkit-scrollbar { display: none; }
table { width: 100%; border-collapse: collapse; background: #FFFFFF; font-size: 13px; }
thead th { background: #1E3A5A; color: #C8DCF0; font-size: 10.5px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; padding: 9px 10px; text-align: left; white-space: nowrap; }
thead th.num { text-align: center; }
tbody tr { border-bottom: 1px solid #EEF2F7; }
tbody tr:last-child { border-bottom: none; }
tbody tr:hover { background: #F7F9FC; }
td { padding: 10px 10px; vertical-align: middle; color: #2A3D55; line-height: 1.4; }
td.num { text-align: center; font-variant-numeric: tabular-nums; font-weight: 600; }
td.time { text-align: center; font-variant-numeric: tabular-nums; color: #4A6785; white-space: nowrap; font-weight: 600; }
.scenario-code { display: inline-block; font-size: 10px; font-weight: 700; background: #EEF4FF; color: #2563EB; border-radius: 4px; padding: 1px 6px; letter-spacing: .04em; white-space: nowrap; }
.pill { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 99px; white-space: nowrap; }
.pill-pass { background: #DCFCE7; color: #15803D; }
.pill-fail { background: #FEE2E2; color: #B91C1C; }
.pill-skip { background: #FEF9C3; color: #A16207; }
.dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.dot-pass { background: #16A34A; }
.dot-fail { background: #DC2626; }
.dot-skip { background: #D97706; }
.ev-none, .vid-none { font-size: 11px; color: #94A3B8; font-style: italic; }
.vid-btn { background: #EEF4FF; color: #2563EB; border: none; border-radius: 5px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.vid-btn:hover { background: #DBEAFE; }
.log-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;cursor:pointer;white-space:nowrap;border:none;}
.log-badge:hover{opacity:.85;}
.log-badge-pass{background:#DCFCE7;color:#15803D;}
.log-badge-fail{background:#FEE2E2;color:#B91C1C;}
.card-overlay{display:none;position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.45);}
.card-overlay.open{display:block;}
.log-panel{display:none;position:fixed;z-index:501;width:520px;max-width:94vw;top:50%;left:50%;transform:translate(-50%,-50%);background:#FFFFFF;border:1px solid #DDE6F0;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.30);overflow:hidden;}
.log-panel.open{display:block;}
.log-panel-header{padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px;}
.log-panel-header.pass{background:#F0FDF4;border-bottom:1px solid #BBF7D0;}
.log-panel-header.fail{background:#FFF5F5;border-bottom:1px solid #FECACA;}
.log-panel-title{font-size:11.5px;font-weight:700;}
.log-panel-title.pass{color:#15803D;}
.log-panel-title.fail{color:#B91C1C;}
.log-panel-close{background:none;border:none;color:#94A3B8;font-size:16px;cursor:pointer;padding:0;line-height:1;flex-shrink:0;}
.log-panel-close:hover{color:#1A2433;}
.log-body{padding:14px 16px;display:flex;flex-direction:column;gap:10px;max-height:70vh;overflow-y:auto;}
.log-section{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7BA7D1;margin-top:2px;}
.log-msg-pass{font-size:12px;color:#15803D;background:#F0FDF4;border-radius:6px;padding:8px 10px;font-weight:600;}
.log-msg-fail{font-size:12px;color:#B91C1C;background:#FFF5F5;border-radius:6px;padding:8px 10px;font-weight:600;}
.log-steps{display:flex;flex-direction:column;gap:5px;}
.log-step{display:flex;align-items:flex-start;gap:8px;font-size:11.5px;color:#2A3D55;}
.log-step-icon{flex-shrink:0;font-weight:700;}
.log-fail-row{display:flex;flex-direction:column;gap:3px;}
.log-fail-label{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6B7E96;}
.log-fail-value{font-size:11.5px;color:#1A2433;line-height:1.4;}
.log-thumb{width:100%;max-height:150px;object-fit:cover;border-radius:6px;border:1px solid #EEF2F7;cursor:pointer;background:#F0F4F8;margin-top:2px;display:block;}
.log-trace{border-radius:6px;overflow:hidden;border:1px solid #EEF2F7;font-size:11px;}
.log-trace summary{padding:8px 12px;font-weight:600;color:#4A6785;background:#F7FBFF;cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;user-select:none;}
.log-trace summary::-webkit-details-marker{display:none;}
.log-trace pre{margin:0;padding:10px 12px;font-size:9.5px;color:#374151;background:#F9FAFB;overflow-x:auto;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;border-top:1px solid #EEF2F7;}
#lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.85); z-index: 9999; align-items: center; justify-content: center; flex-direction: column; gap: 12px; padding: 20px; }
#lightbox img { max-width: 95vw; max-height: 85vh; border-radius: 8px; box-shadow: 0 8px 40px rgba(0,0,0,.6); object-fit: contain; }
#lb-caption, #lb-counter { color: #CBD5E1; font-size: 12px; }
#lb-close { position: fixed; top: 16px; right: 20px; color: #fff; font-size: 28px; cursor: pointer; line-height: 1; background: rgba(0,0,0,.4); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
#lb-close:hover { background: rgba(255,255,255,.2); }
#videobox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.92); z-index: 9999; align-items: center; justify-content: center; flex-direction: column; gap: 12px; padding: 20px; }
#vb-player { max-width: 95vw; max-height: 85vh; border-radius: 8px; box-shadow: 0 8px 40px rgba(0,0,0,.7); outline: none; }
#vb-close { position: fixed; top: 16px; right: 20px; color: #fff; font-size: 28px; cursor: pointer; line-height: 1; background: rgba(0,0,0,.4); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
#vb-close:hover { background: rgba(255,255,255,.2); }
.lb-nav { position: fixed; top: 50%; transform: translateY(-50%); color: #fff; font-size: 38px; font-weight: 300; cursor: pointer; background: rgba(0,0,0,.45); border-radius: 50%; width: 52px; height: 52px; display: none; align-items: center; justify-content: center; user-select: none; z-index: 10001; line-height: 1; }
.lb-nav:hover { background: rgba(255,255,255,.2); }
#lb-prev { left: 16px; }
#lb-next { right: 16px; }
.footer { margin-top: 28px; text-align: center; font-size: 11.5px; color: #8FA5BC; }
`;

const SCRIPT = `
var _activeLog = null;
function openLog(e, id) {
  e.stopPropagation();
  if (_activeLog === id) { closeAllCards(); return; }
  closeAllCards();
  document.getElementById(id).classList.add("open");
  document.getElementById("card-overlay").classList.add("open");
  _activeLog = id;
}
function closeLog(id) {
  var panel = document.getElementById(id);
  if (panel) panel.classList.remove("open");
  var ov = document.getElementById("card-overlay");
  if (ov) ov.classList.remove("open");
  _activeLog = null;
}
function closeAllCards() {
  document.querySelectorAll(".log-panel.open").forEach(function (p) { p.classList.remove("open"); });
  var ov = document.getElementById("card-overlay");
  if (ov) ov.classList.remove("open");
  _activeLog = null;
}
var _lbTestId = null, _lbIdx = 0;
function showLightboxImage() {
  var imgs = window.__SCREENSHOTS__[_lbTestId] || [];
  if (!imgs.length) return;
  document.getElementById("lb-img").src = imgs[_lbIdx];
  document.getElementById("lb-counter").textContent = (_lbIdx + 1) + " / " + imgs.length;
  var show = imgs.length > 1;
  document.getElementById("lb-prev").style.display = show ? "flex" : "none";
  document.getElementById("lb-next").style.display = show ? "flex" : "none";
  document.getElementById("lightbox").style.display = "flex";
  document.body.style.overflow = "hidden";
}
function openLightbox(testId, idx) {
  _lbTestId = testId;
  _lbIdx = idx;
  showLightboxImage();
}
function lbNav(dir) {
  var imgs = window.__SCREENSHOTS__[_lbTestId] || [];
  if (!imgs.length) return;
  _lbIdx = (_lbIdx + dir + imgs.length) % imgs.length;
  showLightboxImage();
}
function closeLightbox() {
  document.getElementById("lightbox").style.display = "none";
  document.getElementById("lb-img").src = "";
  document.body.style.overflow = "";
}
function openVideo(src) {
  var player = document.getElementById("vb-player");
  player.src = src;
  document.getElementById("videobox").style.display = "flex";
  document.body.style.overflow = "hidden";
  player.play().catch(function () {});
}
function closeVideo() {
  var player = document.getElementById("vb-player");
  player.pause();
  player.src = "";
  document.getElementById("videobox").style.display = "none";
  document.body.style.overflow = "";
}
document.getElementById("card-overlay").addEventListener("click", closeAllCards);
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") { closeLightbox(); closeVideo(); closeAllCards(); }
  if (document.getElementById("lightbox").style.display === "flex") {
    if (e.key === "ArrowLeft") lbNav(-1);
    if (e.key === "ArrowRight") lbNav(1);
  }
});
`;

function renderReport(
  rows: RowView[],
  startTime: number,
  endTime: number,
  options: DashboardReporterOptions,
): string {
  const total = rows.length;
  const nPass = rows.filter((r) => r.status === "PASS").length;
  const nFail = rows.filter((r) => r.status === "FAIL").length;
  const nSkip = rows.filter((r) => r.status === "SKIP").length;

  const kpiCols = nSkip > 0 ? 4 : 3;
  const kpiSkipHtml =
    nSkip > 0 ? `<div class="kpi kpi-skip"><div class="kpi-value">${nSkip}</div><div class="kpi-label">Ignorado</div></div>` : "";

  const start = new Date(startTime);
  const durationMs = endTime - startTime;

  const sections = new Map<string, RowView[]>();
  for (const row of rows) {
    const list = sections.get(row.suite) ?? [];
    list.push(row);
    sections.set(row.suite, list);
  }

  const sectionsHtml = [...sections.entries()].map(([suite, list]) => buildSection(suite, list)).join("");
  const logPanelsHtml = rows.map((row) => buildLogPanel(row)).join("");
  const screenshotsMap: Record<string, string[]> = {};
  for (const row of rows) {
    if (row.screenshots.length) screenshotsMap[row.id] = row.screenshots.map((s) => s.path);
  }

  const projectName = options.projectName ?? process.env.REPORT_PROJECT_NAME ?? "Projeto";
  const environment = options.environment ?? process.env.REPORT_ENVIRONMENT ?? "—";
  const executedBy = process.env.USERNAME ?? process.env.USER ?? "—";
  const version = playwrightVersion();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório de Execução — ${escapeHtml(projectName)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-left">
      <div class="header-eyebrow">Automação</div>
      <div class="header-title">Relatório de Execução</div>
      <div class="header-meta">
        <span class="meta-item"><strong>Projeto</strong> ${escapeHtml(projectName)}</span>
        <span class="meta-item"><strong>Data</strong> ${start.toLocaleDateString("pt-BR")}</span>
        <span class="meta-item"><strong>Início</strong> ${start.toLocaleTimeString("pt-BR")}</span>
        <span class="meta-item"><strong>Duração total</strong> ${formatDuration(durationMs)}</span>
        <span class="meta-item"><strong>Executado por</strong> ${escapeHtml(executedBy)}</span>
        <span class="meta-item"><strong>Ferramenta</strong> Playwright ${version}</span>
      </div>
    </div>
    <div class="badge-env">${escapeHtml(environment)}</div>
  </div>

  <div class="kpi-strip" style="grid-template-columns:repeat(${kpiCols}, 1fr)">
    <div class="kpi kpi-total"><div class="kpi-value">${total}</div><div class="kpi-label">Total</div></div>
    <div class="kpi kpi-pass"><div class="kpi-value">${nPass}</div><div class="kpi-label">Sucesso</div></div>
    <div class="kpi kpi-fail"><div class="kpi-value">${nFail}</div><div class="kpi-label">Falha</div></div>
    ${kpiSkipHtml}
  </div>

  <div class="dashboard">
    ${buildDonut(nPass, nFail, nSkip)}
    ${buildTimeBars(rows)}
  </div>

  ${sectionsHtml}

  <div class="footer">Gerado automaticamente pela suíte Playwright em ${new Date(endTime).toLocaleString("pt-BR")}</div>

</div>

<div id="card-overlay" class="card-overlay"></div>
${logPanelsHtml}

<div id="lightbox" onclick="if(event.target===this)closeLightbox()">
  <span id="lb-close" onclick="closeLightbox()">&#10005;</span>
  <span id="lb-prev" class="lb-nav" onclick="lbNav(-1);event.stopPropagation()">&#8249;</span>
  <span id="lb-next" class="lb-nav" onclick="lbNav(1);event.stopPropagation()">&#8250;</span>
  <img id="lb-img" src="" alt="Evidência">
  <div id="lb-counter"></div>
</div>

<div id="videobox" onclick="if(event.target===this)closeVideo()">
  <span id="vb-close" onclick="closeVideo()">&#10005;</span>
  <video id="vb-player" controls></video>
</div>

<script>
window.__SCREENSHOTS__ = ${JSON.stringify(screenshotsMap)};
${SCRIPT}
</script>
</body>
</html>`;
}
