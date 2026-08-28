import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { formatBytes, formatDuration, statusView } from "./status";
import type { Artifact, Branch, Job, RepositoryInfo, Run, Workflow, WorkflowInput } from "./types";

type InputValues = Record<string, string | boolean>;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function initialValues(inputs: WorkflowInput[]): InputValues {
  return Object.fromEntries(inputs.map((input) => [
    input.name,
    input.default ?? (input.type === "boolean" ? false : ""),
  ]));
}

export function App() {
  const [repository, setRepository] = useState<RepositoryInfo>();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<number>();
  const [selectedBranch, setSelectedBranch] = useState("");
  const [inputDefinitions, setInputDefinitions] = useState<WorkflowInput[]>([]);
  const [inputValues, setInputValues] = useState<InputValues>({});
  const [inputSource, setInputSource] = useState<"github" | "fallback">("github");
  const [runs, setRuns] = useState<Run[]>([]);
  const [artifacts, setArtifacts] = useState<Record<number, Artifact[]>>({});
  const [jobs, setJobs] = useState<Record<number, Job[]>>({});
  const [expandedRun, setExpandedRun] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string }>();

  const loadRuns = useCallback(async (workflowId?: number, quiet = false) => {
    if (!quiet) setHistoryLoading(true);
    try {
      const query = workflowId ? `?workflowId=${workflowId}` : "";
      const data = await api<{ runs: Run[] }>(`/api/github/runs${query}`);
      setRuns(data.runs);
    } catch (error) {
      if (!quiet) setMessage({ type: "error", text: error instanceof Error ? error.message : "Erro ao carregar execuções." });
    } finally {
      if (!quiet) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [repoData, workflowData, branchData] = await Promise.all([
          api<RepositoryInfo>("/api/github/repository"),
          api<{ workflows: Workflow[] }>("/api/github/workflows"),
          api<{ branches: Branch[] }>("/api/github/branches"),
        ]);
        setRepository(repoData);
        setWorkflows(workflowData.workflows);
        setBranches(branchData.branches);
        const preferred = workflowData.workflows.find((item) => item.path === ".github/workflows/playwright.yml")
          || workflowData.workflows[0];
        setSelectedWorkflow(preferred?.id);
        const main = branchData.branches.find((item) => item.name === "main") || branchData.branches[0];
        setSelectedBranch(main?.name || "");
      } catch (error) {
        setMessage({ type: "error", text: error instanceof Error ? error.message : "Falha ao iniciar o dashboard." });
      } finally {
        setLoading(false);
      }
    }
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedWorkflow || !selectedBranch) return;
    let active = true;
    async function loadInputs() {
      try {
        const data = await api<{ inputs: WorkflowInput[]; source: "github" | "fallback" }>(
          `/api/github/workflows/${selectedWorkflow}/inputs?ref=${encodeURIComponent(selectedBranch)}`,
        );
        if (!active) return;
        setInputDefinitions(data.inputs);
        setInputValues(initialValues(data.inputs));
        setInputSource(data.source);
      } catch (error) {
        if (active) setMessage({ type: "error", text: error instanceof Error ? error.message : "Erro ao carregar inputs." });
      }
    }
    void loadInputs();
    void loadRuns(selectedWorkflow);
    return () => { active = false; };
  }, [selectedWorkflow, selectedBranch, loadRuns]);

  const hasActiveRun = runs.some((run) => run.status !== "completed");
  useEffect(() => {
    if (!hasActiveRun || !selectedWorkflow) return;
    const timer = window.setInterval(() => void loadRuns(selectedWorkflow, true), 12_000);
    return () => window.clearInterval(timer);
  }, [hasActiveRun, selectedWorkflow, loadRuns]);

  const selectedWorkflowData = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflow),
    [workflows, selectedWorkflow],
  );

  async function dispatchWorkflow() {
    if (!selectedWorkflow || !selectedBranch || !selectedWorkflowData) return;
    const confirmed = window.confirm(
      `Executar “${selectedWorkflowData.name}” na branch “${selectedBranch}”?`,
    );
    if (!confirmed) return;

    setDispatching(true);
    setMessage(undefined);
    try {
      const data = await api<{ run: Run; correlation: string }>(
        `/api/github/workflows/${selectedWorkflow}/dispatch`,
        { method: "POST", body: JSON.stringify({ ref: selectedBranch, inputs: inputValues }) },
      );
      setRuns((current) => [data.run, ...current.filter((run) => run.id !== data.run.id)]);
      setMessage({ type: "success", text: `Workflow disparado. Execução #${data.run.run_number} identificada e em acompanhamento.` });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Não foi possível disparar o workflow." });
    } finally {
      setDispatching(false);
    }
  }

  async function runAction(run: Run, action: "cancel" | "rerun") {
    const verb = action === "cancel" ? "cancelar" : "reexecutar";
    if (!window.confirm(`Deseja ${verb} a execução #${run.run_number}?`)) return;
    try {
      const data = await api<{ message: string }>(`/api/github/runs/${run.id}/${action}`, { method: "POST" });
      setMessage({ type: "success", text: data.message });
      window.setTimeout(() => void loadRuns(selectedWorkflow, true), 1_500);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : `Não foi possível ${verb}.` });
    }
  }

  async function toggleDetails(runId: number) {
    if (expandedRun === runId) {
      setExpandedRun(undefined);
      return;
    }
    setExpandedRun(runId);
    try {
      const [jobData, artifactData] = await Promise.all([
        jobs[runId] ? Promise.resolve({ jobs: jobs[runId] }) : api<{ jobs: Job[] }>(`/api/github/runs/${runId}/jobs`),
        artifacts[runId] ? Promise.resolve({ artifacts: artifacts[runId] }) : api<{ artifacts: Artifact[] }>(`/api/github/runs/${runId}/artifacts`),
      ]);
      setJobs((current) => ({ ...current, [runId]: jobData.jobs }));
      setArtifacts((current) => ({ ...current, [runId]: artifactData.artifacts }));
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Erro ao carregar detalhes." });
    }
  }

  if (loading) return <div className="loading-screen"><span className="spinner" />Conectando ao GitHub Actions…</div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span>▶</span></div>
        <div className="brand-copy">
          <strong>Actions Control</strong>
          <span>QA Automation Console</span>
        </div>
        <div className="repository-pill"><span className="repo-dot" />{repository?.fullName || "Repositório"}</div>
      </header>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">CONTROLE DE AUTOMAÇÃO</p>
            <h1>GitHub Actions, em um só lugar.</h1>
            <p>Dispare suítes Playwright, acompanhe a execução e baixe os relatórios sem sair do dashboard.</p>
          </div>
          <div className="connection-state"><span />API conectada</div>
        </section>

        {message && (
          <div className={`notice notice-${message.type}`} role="alert">
            <span>{message.type === "success" ? "✓" : "!"}</span>
            <p>{message.text}</p>
            <button aria-label="Fechar aviso" onClick={() => setMessage(undefined)}>×</button>
          </div>
        )}

        <section className="panel execution-panel">
          <div className="panel-heading">
            <div className="heading-icon">▶</div>
            <div><h2>Nova execução</h2><p>Configure os parâmetros do workflow antes de iniciar.</p></div>
          </div>

          {repository && !repository.private && (
            <div className="privacy-note" role="status">
              <span>◆</span>
              <div>
                <strong>Proteção de relatórios ativa</strong>
                <p>Este repositório é público. Relatórios, evidências e resultados de teste não serão enviados como artefatos.</p>
              </div>
            </div>
          )}

          <div className="form-grid">
            <label className="field">
              <span>Workflow</span>
              <select value={selectedWorkflow || ""} onChange={(event) => setSelectedWorkflow(Number(event.target.value))}>
                {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
              </select>
              <small>{selectedWorkflowData?.path || "Nenhum workflow disponível"}</small>
            </label>
            <label className="field">
              <span>Branch</span>
              <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)}>
                {branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}{branch.protected ? " · protegida" : ""}</option>)}
              </select>
              <small>Enviada ao GitHub como <code>ref</code>.</small>
            </label>
          </div>

          {inputDefinitions.length > 0 && (
            <div className="inputs-block">
              <div className="inputs-title"><span>Inputs do workflow</span>{inputSource === "fallback" && <em>configuração local de contingência</em>}</div>
              <div className="form-grid dynamic-inputs">
                {inputDefinitions.map((input) => (
                  input.type === "boolean" ? (
                    <label className={`toggle-field ${input.name === "publicar_relatorios" && repository?.private === false ? "toggle-disabled" : ""}`} key={input.name}>
                      <input
                        type="checkbox"
                        disabled={input.name === "publicar_relatorios" && repository?.private === false}
                        checked={Boolean(inputValues[input.name])}
                        onChange={(event) => setInputValues((current) => ({ ...current, [input.name]: event.target.checked }))}
                      />
                      <span className="toggle" aria-hidden="true" />
                      <span><strong>{input.name.replaceAll("_", " ")}</strong><small>{input.description}</small></span>
                    </label>
                  ) : (
                    <label className="field" key={input.name}>
                      <span>{input.name.replaceAll("_", " ")}{input.required && <b> *</b>}</span>
                      {input.type === "choice" ? (
                        <select
                          required={input.required}
                          value={String(inputValues[input.name] ?? "")}
                          onChange={(event) => setInputValues((current) => ({ ...current, [input.name]: event.target.value }))}
                        >
                          {input.options.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input
                          required={input.required}
                          value={String(inputValues[input.name] ?? "")}
                          placeholder={input.type === "environment" ? "Nome do environment" : "Informe um valor"}
                          onChange={(event) => setInputValues((current) => ({ ...current, [input.name]: event.target.value }))}
                        />
                      )}
                      <small>{input.description}</small>
                    </label>
                  )
                ))}
              </div>
            </div>
          )}

          <div className="execution-footer">
            <p>Uma confirmação será solicitada antes do disparo real.</p>
            <button className="primary-button" disabled={dispatching || !selectedWorkflow || !selectedBranch} onClick={dispatchWorkflow}>
              {dispatching ? <><span className="button-spinner" />Disparando…</> : <><span>▶</span>Executar workflow</>}
            </button>
          </div>
        </section>

        <section className="history-section">
          <div className="history-heading">
            <div><p className="eyebrow">MONITORAMENTO</p><h2>Execuções recentes</h2><p>Atualização automática a cada 12 segundos enquanto houver uma execução ativa.</p></div>
            <button className="secondary-button" disabled={historyLoading} onClick={() => void loadRuns(selectedWorkflow)}>
              <span className={historyLoading ? "spin" : ""}>↻</span> Atualizar
            </button>
          </div>

          <div className="runs-list">
            {runs.length === 0 && <div className="empty-state"><strong>Nenhuma execução encontrada</strong><span>Dispare o workflow ou confira o filtro selecionado.</span></div>}
            {runs.map((run) => {
              const view = statusView(run.status, run.conclusion);
              const isExpanded = expandedRun === run.id;
              const canRerun = run.status === "completed" && ["failure", "timed_out", "cancelled"].includes(run.conclusion || "");
              return (
                <article className="run-card" key={run.id}>
                  <div className={`status-rail status-${view.key}`} />
                  <div className="run-main">
                    <div className="run-title-row">
                      <div>
                        <div className="run-number">#{run.run_number} <span>· tentativa {run.run_attempt}</span></div>
                        <h3>{run.name}</h3>
                        <p>{run.display_title}</p>
                      </div>
                      <span className={`status-badge status-${view.key}`}><i />{view.label}</span>
                    </div>
                    <div className="run-meta">
                      <span><b>⑂</b>{run.head_branch || "—"}</span>
                      <span><b>◷</b>{dateFormatter.format(new Date(run.created_at))}</span>
                      <span><b>⏱</b>{formatDuration(run.run_started_at, run.status === "completed" ? run.updated_at : new Date().toISOString())}</span>
                      <span className="actor">{run.actor?.avatar_url && <img src={run.actor.avatar_url} alt="" />}{run.actor?.login || "GitHub"}</span>
                    </div>
                  </div>
                  <div className="run-actions">
                    <a className="link-button" href={run.html_url} target="_blank" rel="noreferrer">Ver no GitHub ↗</a>
                    {run.status !== "completed" && <button className="danger-button" onClick={() => void runAction(run, "cancel")}>Cancelar</button>}
                    {canRerun && <button className="secondary-button compact" onClick={() => void runAction(run, "rerun")}>↻ Reexecutar falhas</button>}
                    <button className="details-button" onClick={() => void toggleDetails(run.id)}>{isExpanded ? "Ocultar detalhes" : "Jobs e artefatos"} <span>{isExpanded ? "⌃" : "⌄"}</span></button>
                  </div>
                  {isExpanded && (
                    <div className="run-details">
                      <div>
                        <h4>Jobs</h4>
                        {!jobs[run.id] && <p className="muted">Carregando…</p>}
                        {jobs[run.id]?.map((job) => {
                          const jobStatus = statusView(job.status, job.conclusion);
                          return <a className="detail-row" href={job.html_url} target="_blank" rel="noreferrer" key={job.id}><span className={`detail-dot status-${jobStatus.key}`} /><span>{job.name}</span><em>{jobStatus.label}</em></a>;
                        })}
                      </div>
                      <div>
                        <h4>Artefatos</h4>
                        {!artifacts[run.id] && <p className="muted">Carregando…</p>}
                        {artifacts[run.id]?.length === 0 && <p className="muted">Nenhum artefato disponível.</p>}
                        {artifacts[run.id]?.map((artifact) => (
                          <a
                            className={`artifact-row ${artifact.expired ? "disabled" : ""}`}
                            href={artifact.expired ? undefined : `/api/github/artifacts/${artifact.id}/download`}
                            key={artifact.id}
                          >
                            <span className="artifact-icon">ZIP</span>
                            <span><strong>{artifact.name}</strong><small>{formatBytes(artifact.size_in_bytes)}{artifact.expired ? " · expirado" : ""}</small></span>
                            <b>↓</b>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </main>
      <footer>Actions Control · Credenciais protegidas pelo backend · {repository?.fullName}</footer>
    </div>
  );
}
