# Dashboard Reporter — Playwright

Reporter customizado do Playwright que gera um relatório HTML único e
autocontido, no estilo de dashboard (KPIs, gráfico de distribuição PASS/FAIL/SKIP,
barras de tempo por cenário, tabela por suíte e um painel de "log" por teste
com passos de negócio, motivo da falha, screenshot e stack trace).

Não substitui o Allure nem o HTML report nativo do Playwright — convive com
eles. A ideia é ter um único arquivo `.html`, fácil de abrir no navegador e
mandar por e-mail/Teams, sem precisar rodar nenhum comando adicional
(`allure generate`, etc.).

## Instalação em um novo projeto

1. Copie `dashboard-reporter.ts` para dentro do projeto (ex.: `reporters/dashboard-reporter.ts`).
   Não precisa ser exatamente essa pasta — o caminho é resolvido a partir de
   `process.cwd()` (raiz de onde `playwright test` é chamado), não de onde o
   arquivo está.
2. Registre no array `reporter` do `playwright.config.ts`:

   ```ts
   reporter: [
     ["list"], // opcional, mas recomendado: mostra progresso teste a teste no console
     ["html", { open: "never" }],
     [
       "./reporters/dashboard-reporter.ts",
       {
         projectName: "Nome do Projeto",
         environment: process.env.TEST_ENV, // ex.: "QA", "PROD"
       },
     ],
   ],
   ```

3. Rode `npx playwright test` normalmente. Ao final, o relatório estará em
   `test-results/relatorio_execucao_<datetime>.html` (e uma cópia sempre
   atualizada em `test-results/relatorio_execucao_latest.html`). O caminho
   também é impresso no console como `RELATORIO_GERADO:<path>`.

Nenhuma dependência além de `@playwright/test`, que qualquer projeto Playwright já tem.

## Opções do reporter

| Opção | Padrão | Descrição |
|---|---|---|
| `outputDir` | `"test-results"` | Pasta de saída, relativa à raiz do projeto. |
| `projectName` | env `REPORT_PROJECT_NAME`, senão `"Projeto"` | Nome exibido no cabeçalho do relatório. |
| `environment` | env `REPORT_ENVIRONMENT`, senão `"—"` | Badge de ambiente no cabeçalho (QA/PROD/etc.). |
| `codePattern` | `/^([A-Z]{2,6}\d{2,4})\s*[-–—]\s*(.*)$/` | Regex pra extrair o "código do cenário" do título do teste (ex.: `"CT001 - descrição"` → código `CT001`, label `descrição`). Ajuste se seu projeto usar outra convenção de nomenclatura de testes. |

Se preferir configurar por variável de ambiente em vez de hardcoded no config,
use `REPORT_PROJECT_NAME` e `REPORT_ENVIRONMENT` no `.env` do projeto.

## Pra tirar o máximo proveito: use `test.step()`

O painel de "log" de cada cenário é construído a partir dos `test.step()`
chamados durante o teste — sem eles, o relatório ainda funciona (mostra
status, tempo, evidências, vídeo), mas a seção "Passos Executados" fica vazia.

Recomendado: envolver os métodos públicos dos seus Page Objects em
`test.step()`, com um nome de negócio, em vez de deixar as ações cruas
(`click`/`fill`/`expect`) soltas. Exemplo:

```ts
import { test } from "@playwright/test";

class LoginPage {
  async login(user: string, senha: string): Promise<void> {
    await test.step(`Login como ${user}`, async () => {
      await this.page.getByLabel("Usuário").fill(user);
      await this.page.getByLabel("Senha").fill(senha);
      await this.page.getByRole("button", { name: "Entrar" }).click();
    });
  }
}
```

Isso dá uma granularidade "por keyword" parecida com o log de execução do
Robot Framework — passos com nome de negócio, não uma lista de cliques e
preenchimentos.

Passos aninhados (um `test.step()` chamado de dentro de outro) não aparecem
soltos no log — só o passo mais externo é listado, com o resto embutido nele.
Isso evita repetir sub-passos internos como itens separados no "Passos
Executados".

## Como o relatório classifica cada teste

- **Código do cenário**: extraído do título do teste via `codePattern`. Testes
  cujo título não bate com o padrão (ex.: um teste de setup/autenticação sem
  código) aparecem com código `—` e ainda são listados normalmente.
- **Suíte**: o `test.describe()` mais próximo do teste. Testes fora de um
  `describe()` caem numa seção "Geral".
- **Motivo da falha / Última Ação**: `error.message` do teste e o último
  `test.step()` que continha um erro.
- **Evidências / Vídeo**: os attachments que o próprio Playwright já gera
  (`screenshot`, `video` na config `use`) — sem precisar de nenhuma tag ou
  configuração extra além de ligar `screenshot`/`video` no `playwright.config.ts`.

## Limitações conhecidas

- Não inclui metadados que não vêm da execução do teste (autor, sprint,
  User Story/Jira etc.) — isso exigiria uma fonte de dados externa própria de
  cada projeto. Dá pra estender o `RowView`/`buildRow` pra puxar de um
  arquivo de mapeamento (`código → metadados`) se for necessário.
- `codePattern` como usado aqui não afeta o funcionamento do Playwright, é só
  cosmético (rótulo exibido) — nenhum teste precisa ser renomeado pra usar o
  reporter, ele só cai na seção "sem código" (`—`) se o título não bater com
  o padrão.
