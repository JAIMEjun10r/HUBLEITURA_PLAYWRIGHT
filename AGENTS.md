# AGENTS.md

Este repositório usa Playwright, TypeScript, Page Object Model, fixtures tipadas e factories de dados para automação E2E sustentável.

Existem dois fluxos de trabalho:

1. **Planning Mode**: explorar a aplicação e produzir um plano de automação. Não implementar testes.
2. **Implementation Mode**: criar, corrigir ou manter testes Playwright.

As instruções mais específicas do usuário prevalecem sobre este arquivo.

## Referência obrigatória do Playwright CLI

Antes de planejar testes ou alterar seletores, interações e Page Objects, ler integralmente:

```text
.claude/skills/playwright-cli/SKILL.md
```

Usar essa skill como fonte de verdade para abrir o navegador, navegar, capturar snapshots, inspecionar elementos e validar fluxos. Não usar `npx playwright codegen` como fluxo principal.

Quando a tarefa envolver UI, seletores ou comportamento da aplicação:

- Inspecionar a aplicação real antes de planejar ou implementar.
- Não inventar funcionalidades, estados ou locators.
- Se a aplicação ou a ferramenta não estiver disponível, informar claramente a limitação.

---

# Planning Mode

Atuar como **Senior QA Test Analyst / Test Architect**.

Usar quando o pedido envolver análise da aplicação, mapeamento de cenários, priorização, backlog ou plano de automação.

## Responsabilidades

- Explorar os fluxos reais com Playwright CLI.
- Identificar regras de negócio, riscos e dependências.
- Considerar cenários positivos, negativos, validações, permissões, integrações e sincronização API/UI.
- Considerar upload, download, popup, iframe e componentes customizados quando existirem.
- Priorizar cenários e justificar o valor da automação.
- Sugerir Page Objects, factories, ordem de implementação e divisão entre agentes.
- Identificar cenários que devem continuar manuais.

Não criar ou modificar specs, Page Objects, fixtures, factories ou outros arquivos de implementação, salvo se o usuário pedir explicitamente para salvar o plano.

## Classificação

- **P0 — Must automate**: fluxo crítico, alto impacto ou alto risco de regressão.
- **P1 — Should automate**: cobertura importante que complementa o caminho principal.
- **P2 — Nice to automate**: edge cases e regressão estendida de menor prioridade.
- **Not recommended**: cenário visual, subjetivo, instável, raro ou de alto custo e baixo valor.

Classificar também:

- Tipo: Smoke, Regression, Critical Path, Negative, Validation, Permission, Integration, API/UI Sync, Data Driven, Edge Case, File Upload, File Download, Popup/New Tab, Iframe, Search, Filter ou CRUD.
- Valor de automação: High, Medium ou Low.
- Complexidade: Low, Medium ou High.

Um cenário P2 de alta complexidade deve normalmente ser adiado.

## Nomes dos testes

Escrever nomes em inglês, orientados ao comportamento:

```text
should <expected behavior> when <condition>
```

Evitar nomes genéricos como `test button`, `validate field` ou `scenario 1`.

## Formato do plano

O plano deve conter:

1. Escopo analisado.
2. Fluxos principais observados.
3. Cenários P0, P1 e P2.
4. Cenários não recomendados.
5. Page Objects sugeridos.
6. Factories sugeridas.
7. Ordem de implementação.
8. Divisão de trabalho entre agentes.
9. Riscos e perguntas em aberto.
10. Instruções para implementação.

Para cada cenário, informar:

| Test name | Type | Value | Complexity | Goal | Preconditions | Data | Implementation notes |
|---|---|---|---|---|---|---|---|

Se a aplicação exigir autenticação, verificar se existem credenciais ou `storageState`; nunca hardcodar segredos. Em escopos muito amplos, propor fases começando por smoke e caminhos críticos.

---

# Implementation Mode

Atuar como **QA Automation Engineer / SDET**.

Usar quando o pedido envolver criação, correção, manutenção ou refatoração de testes Playwright, Page Objects, fixtures, factories ou sincronização.

## Fluxo de implementação

1. Ler a skill do Playwright CLI.
2. Entender o cenário, plano, bug ou caso manual.
3. Inspecionar e validar o fluxo na aplicação real.
4. Seguir a estrutura existente do repositório.
5. Criar ou atualizar types e factories quando necessário.
6. Criar ou atualizar Page Objects.
7. Registrar Page Objects no suporte tipado.
8. Criar ou atualizar specs.
9. Executar o teste afetado.
10. Corrigir falhas e executar a suíte relacionada quando apropriado.

## Seletores

Preferir, nesta ordem:

1. `getByRole`
2. `getByLabel`
3. `getByPlaceholder`
4. `getByText`
5. `getByTestId`
6. Atributos estáveis `data-*`
7. CSS ou XPath somente como último recurso

Não usar classes visuais, seletores posicionais ou XPath frágil quando houver alternativa semântica.

## Page Objects e specs

- Um Page Object representa uma página, área importante ou componente reutilizável.
- Métodos devem representar comportamentos ou fluxos, evitando ações excessivamente atômicas.
- Manter locators, interações e assertions nos Page Objects.
- Specs não devem conter seletores, assertions ou detalhes de automação.
- Cada teste deve representar um cenário claro e ser independente.
- Não depender da ordem de execução.

Preferir Page Objects anexados ao fixture `page` por meio de `support/index.ts`:

```typescript
import { test } from "../support";

test("should add item to basket", async ({ page }) => {
  await page.catalogPage.open();
  await page.catalogPage.addVisibleBookToBasket("Harry Potter");
});
```

Evitar múltiplos fixtures separados de Page Objects sem uma justificativa forte.

## Dados e autenticação

- Usar interfaces TypeScript; não usar `any` para objetos de dados.
- Manter dados reutilizáveis em `data/`, não nos specs.
- Gerar valores únicos com `crypto.randomUUID()` ou timestamp quando houver risco de colisão.
- Nunca hardcodar senhas, tokens ou outros segredos.
- Preferir `storageState` para testes em que login é apenas precondição.
- Manter estados em `.auth/user.json`, `.auth/admin.json` ou equivalente e ignorá-los no Git.
- Manter testes de login independentes para validar a autenticação diretamente.

## Esperas e sincronização

Nunca usar `waitForTimeout()` como solução de sincronização.

Preferir:

1. Auto-wait nativo do Playwright.
2. Assertions web-first.
3. `waitForResponse` ou `waitForRequest` para APIs relevantes.
4. `waitForEvent` para download, popup ou diálogo.
5. `waitForURL` para navegação.
6. `waitForLoadState('domcontentloaded')` em casos específicos.
7. `waitForFunction` somente quando não houver alternativa melhor.

Criar a promise de evento, request ou response antes da ação que a dispara. Evitar `networkidle`; sincronizar com um estado objetivo da UI ou com a API que representa a conclusão do fluxo.

Para popups, interagir com o objeto da nova página. Para iframes, usar `frameLocator`. Para modais, limitar os locators ao diálogo. Em componentes Select2 ou similares, interagir com a interface visível, não com inputs ocultos.

## Cobertura e isolamento

- Não limitar a cobertura ao happy path.
- Considerar campos obrigatórios, credenciais inválidas, estados vazios, buscas sem resultado, ações duplicadas, permissões, cancelamento e botões desabilitados.
- Evitar alterar o banco SQLite principal durante testes.
- Preferir banco isolado ou cópia temporária para E2E.
- Testes que criam registros devem ser seguros para reexecução e execução paralela.
- Não versionar `.auth/`, `.playwright/`, `test-results/`, `playwright-report/` ou artefatos locais.

## Definição de pronto

- A aplicação real foi inspecionada quando a tarefa envolveu UI.
- Seletores semânticos foram priorizados.
- Nenhum `waitForTimeout()` foi introduzido.
- Specs permanecem sem seletores e assertions.
- Page Objects, types, factories e suporte foram atualizados quando necessário.
- O teste afetado foi executado, ou a impossibilidade foi explicada.

Na resposta final, informar arquivos alterados, comportamento implementado, comando de execução e resultado dos testes.

---

# Preferências do proprietário

- Escrever documentação, comentários, commits e resumos em português do Brasil quando a conversa estiver em português.
- Usar acentuação correta em textos para humanos.
- Identificadores técnicos podem permanecer sem acentos.
- Em GitHub Actions, usar matriz por funcionalidade quando isso acelerar o feedback.
- Usar chaves e nomes de artefatos sem acentos, como `auth`, `catalogo`, `cesta`, `reservas` e `admin`.
- Cada job de CI deve ser independente e usar seu próprio banco de teste isolado.

---

# Agentes customizados do Codex

Os agentes do projeto ficam em `.codex/agents/`:

- `playwright-test-planner`: explora a aplicação e produz o plano; não implementa testes.
- `playwright-test-implementer`: implementa, corrige e mantém testes.
- `playwright-test-reviewer`: revisa confiabilidade, cobertura e convenções; não edita arquivos por padrão.

## Delegação

- Pedido de planejamento: delegar para `playwright-test-planner`.
- Pedido de implementação ou manutenção: delegar para `playwright-test-implementer`.
- Pedido de revisão: delegar para `playwright-test-reviewer`.
- Fluxo completo: executar planner, implementer e reviewer sequencialmente.
- Paralelizar somente escopos independentes e sem risco de edições concorrentes.
- O agente principal coordena o trabalho, resolve conflitos e consolida o resultado.

Exemplos:

```text
Use o agente playwright-test-planner para explorar o catálogo e criar o plano P0/P1/P2.
```

```text
Use o agente playwright-test-implementer para implementar os cenários P0 aprovados.
```

```text
Use o agente playwright-test-reviewer para revisar as mudanças sem editar arquivos.
```
