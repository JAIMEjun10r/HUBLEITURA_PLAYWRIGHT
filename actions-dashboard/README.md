# Actions Control — dashboard do GitHub Actions

Prova de conceito para disparar e acompanhar workflows reais do repositório `JAIMEjun10r/HUBLEITURA_PLAYWRIGHT`. A interface prioriza o workflow `.github/workflows/playwright.yml`, mas lista todos os workflows ativos retornados pela API.

## Arquitetura

O dashboard fica isolado da aplicação educacional existente:

```text
actions-dashboard/
├── client/              React + Vite; não conhece nem recebe o token
├── server/              Express + TypeScript; integra com a API do GitHub
├── .env.example         Configuração sem segredo real
└── package.json         Um comando inicia frontend e backend
```

O navegador chama somente `/api/github/*`. O backend centraliza as chamadas em `server/github-client.ts`, valida workflows, branches, IDs e inputs, e então adiciona o token no header enviado ao GitHub. Em produção, o Express também serve o build estático do React.

O polling ocorre a cada 12 segundos somente enquanto existir uma execução não concluída. Jobs e artefatos são carregados sob demanda ao expandir uma execução, reduzindo o consumo do rate limit.

### Privacidade dos relatórios

O repositório está público, portanto o workflow aplica uma trava de segurança baseada em `github.event.repository.private`: relatórios, dashboards e evidências nunca são enviados como artefatos enquanto a visibilidade for pública. O input `publicar_relatorios` usa `false` como padrão e fica desabilitado na interface para repositórios públicos. Essa proteção também vale para execuções por `push`.

Se o repositório for tornado privado no futuro, a publicação continuará opt-in nos disparos manuais. Em pushes para `main`, o comportamento histórico de publicação é mantido apenas no repositório privado.

### Identificação da execução disparada

A versão atual da API pode devolver `workflow_run_id` no próprio dispatch, e esse é o caminho preferencial. O backend também aceita a resposta antiga `204 No Content`; nesse caso, correlaciona a nova execução usando, em conjunto:

- workflow e branch selecionados;
- evento `workflow_dispatch`;
- ator do token autenticado;
- horário do disparo;
- IDs observados antes do dispatch.

Se mais de uma execução satisfizer os critérios, o backend retorna conflito e não escolhe uma execução arbitrariamente.

## Pré-requisitos

- Node.js 20 ou mais recente.
- npm 10 ou mais recente.
- Acesso de leitura ao repositório.
- Fine-grained personal access token para disparar, cancelar, reexecutar e baixar artefatos privados.

## Instalação e execução

Dentro da pasta do dashboard:

```bash
cd actions-dashboard
npm install
cp .env.example .env
npm run dev
```

No Windows PowerShell, use `Copy-Item .env.example .env` no lugar de `cp` se necessário.

- Interface de desenvolvimento: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

Outros comandos:

```bash
npm test
npm run build
$env:NODE_ENV="production"; npm start  # PowerShell, após o build
```

Em produção, acesse `http://localhost:4000`.

## Configuração segura do token

1. No GitHub, abra **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Crie um token com prazo curto e selecione somente o repositório `HUBLEITURA_PLAYWRIGHT`.
3. Configure as permissões de repositório:
   - **Actions: Read and write** — listar, disparar, cancelar, reexecutar e baixar artefatos;
   - **Contents: Read** — ler o YAML do workflow e descobrir os inputs;
   - **Metadata: Read** — permissão básica adicionada pelo GitHub para identificar o repositório.
4. Copie `.env.example` para `.env` e preencha apenas a cópia local:

```env
GITHUB_TOKEN=github_pat_seu_token
GITHUB_OWNER=JAIMEjun10r
GITHUB_REPO=HUBLEITURA_PLAYWRIGHT
PORT=4000
GITHUB_API_VERSION=2026-03-10
```

O `.gitignore` da raiz ignora `.env` em qualquer pasta e permite somente `.env.example`. O backend não registra headers, corpo de autenticação ou o valor do token. O bundle do frontend não usa variáveis `GITHUB_*`.

Sem token, o dashboard ainda pode listar dados públicos do repositório, sujeito ao rate limit anônimo. Operações de escrita retornam uma mensagem de autenticação clara.

## Funcionalidades

- Lista workflows e branches reais.
- Lê `on.workflow_dispatch.inputs` do YAML na branch selecionada.
- Renderiza inputs `string`, `boolean`, `choice` e `environment`.
- Usa uma configuração tipada de contingência apenas para `playwright.yml` se o YAML não puder ser obtido ou interpretado.
- Dispara o workflow com `{ "ref": "branch", "inputs": {} }`.
- Mostra execuções recentes, status, conclusão, ator, data, duração, número e tentativa.
- Abre a execução e os jobs no GitHub.
- Cancela execuções ainda não concluídas.
- Reexecuta jobs falhos em runs com falha/timeout e oferece reexecução completa para outras conclusões permitidas pelo backend.
- Lista artefatos históricos ou gerados em repositórios privados e faz o download pelo backend, sem expor o token.

Estados visuais: âmbar para fila/espera, azul para execução, verde para sucesso, vermelho para falha e cinza para cancelamento/estado neutro.

## API interna

```text
GET  /api/github/repository
GET  /api/github/workflows
GET  /api/github/branches
GET  /api/github/workflows/:workflowId/inputs?ref=main
POST /api/github/workflows/:workflowId/dispatch
GET  /api/github/runs?workflowId=123
GET  /api/github/runs/:runId
GET  /api/github/runs/:runId/jobs
POST /api/github/runs/:runId/cancel
POST /api/github/runs/:runId/rerun
GET  /api/github/runs/:runId/artifacts
GET  /api/github/artifacts/:artifactId/download
```

Erros `401`, `403`, `404`, `409` e `422` são convertidos para mensagens seguras. Quando o GitHub informa rate limit esgotado, a API interna inclui também o instante de reset, nunca o token.

## Como validar um disparo real

Esta sequência cria uma execução real e consome minutos do GitHub Actions:

1. Configure o PAT e execute `npm run dev`.
2. Confirme que o cabeçalho mostra `JAIMEjun10r/HUBLEITURA_PLAYWRIGHT` e que workflows/branches carregam.
3. Selecione **Playwright**, a branch desejada e, para uma validação rápida, o grupo `auth`.
4. Mantenha `navegador=chromium`, `publicar_relatorios=false` e `ambiente=CI`.
5. Clique em **Executar workflow** e confirme o diálogo.
6. Confira se a nova execução aparece primeiro na fila, depois em execução e por fim concluída.
7. Use **Ver no GitHub** para comparar o ID e os inputs.
8. Expanda **Jobs e artefatos** e confirme que nenhum relatório foi publicado enquanto o repositório estiver público.

Testes automatizados usam mocks e nunca fazem dispatch real.

## Ajuste do workflow Playwright

O dispatch manual ganhou os inputs `grupo`, `navegador`, `publicar_relatorios` e `ambiente`. Para `push` na `main`, expressões de fallback mantêm todos os cinco grupos, Chromium e `TEST_ENV=CI`. A publicação de relatórios foi deliberadamente alterada por segurança: é bloqueada em repositórios públicos e permitida apenas quando o repositório for privado. Um dispatch com grupo específico produz matriz com somente esse grupo.

## Trocar o repositório

Altere `GITHUB_OWNER` e `GITHUB_REPO` no `.env`. O PAT precisa estar autorizado para o novo repositório. Workflows genéricos serão listados e seus inputs serão lidos automaticamente; a contingência tipada existe somente para o caminho `.github/workflows/playwright.yml`.

## Adaptação para o GitHub da empresa

- Para GitHub Enterprise Server, acrescente a URL da API em `GITHUB_API_URL` (por exemplo, `https://github.empresa/api/v3`) e valide a versão suportada da API.
- Prefira um GitHub App com instalação por organização em vez de PAT pessoal para uso compartilhado.
- Coloque o backend atrás da autenticação corporativa e aplique autorização por repositório e por operação.
- Mantenha os segredos em um cofre corporativo e registre auditoria das ações sem registrar credenciais.
- Revise políticas de proxy, SSO, allowlists e limites da API antes da publicação interna.

## Limitações conhecidas

- A prova de conceito é local e não possui login próprio; não a exponha na internet sem uma camada de autenticação/autorização.
- Em repositórios públicos, o histórico e os logs básicos do GitHub Actions continuam públicos; somente os uploads de relatórios, screenshots, vídeos e demais evidências são bloqueados pelo workflow.
- A listagem inicial usa até 100 workflows, 100 branches, 30 runs e 100 jobs/artefatos por requisição; paginação visual ainda não foi implementada.
- Inputs do tipo `environment` são renderizados como texto para não exigir a permissão adicional de administração necessária para enumerar environments.
- O download é transmitido pelo backend. Em produção, defina limites e observabilidade adequados para artefatos muito grandes.
- A API do GitHub pode demorar alguns segundos para indexar uma execução em instalações que ainda respondem `204`; o fallback aguarda cerca de 11 segundos antes de informar timeout.

## Interface

A tela é responsiva e tem duas áreas principais: **Nova execução**, com workflow, branch e inputs dinâmicos; e **Execuções recentes**, composta por cards com barra e badge de status, metadados, ações, jobs e artefatos expansíveis. Em telas pequenas, controles e ações são reorganizados em uma única coluna.
