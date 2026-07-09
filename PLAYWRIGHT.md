# Automação E2E com Playwright

Este documento explica como a automação E2E deste projeto foi organizada e como executar os testes localmente.

## Tecnologias usadas

- Playwright Test
- TypeScript
- Page Object Model
- Fixtures tipadas
- Massa de dados em arquivos dedicados
- Autenticação reutilizável com `storageState`
- Servidor local iniciado automaticamente pelo Playwright

## Estrutura da automação

```text
data/                  Massa de dados usada nos testes
pages/                 Page Objects das telas e componentes
support/               Fixtures, autenticação e helpers compartilhados
tests/                 Especificações Playwright
types/                 Tipos usados pelas factories e Page Objects
playwright.config.ts   Configuração do Playwright
```

## Instalação

Instale as dependências do projeto:

```bash
npm install
```

Se for a primeira vez usando Playwright na máquina, instale os navegadores:

```bash
npx playwright install
```

## Como rodar os testes

Rodar a suíte completa:

```bash
npm run test:e2e
```

Ou diretamente com o Playwright:

```bash
npx playwright test
```

Rodar um arquivo específico:

```bash
npx playwright test tests/catalog.spec.ts
```

Rodar com o navegador visível:

```bash
npx playwright test --headed
```

Abrir o relatório HTML:

```bash
npx playwright show-report
```

## Inicialização da aplicação

Não é necessário executar `npm start` antes dos testes.

O Playwright inicia a aplicação automaticamente por meio do `webServer` configurado em `playwright.config.ts`, usando o script:

```bash
npm run e2e:server
```

Esse script cria uma cópia temporária do banco em:

```text
.playwright/biblioteca.e2e.db
```

Assim, os testes podem criar reservas e alterar dados sem modificar o banco principal do projeto.

## Autenticação com storage state

O arquivo `tests/auth.setup.ts` faz login com os perfis de teste e salva os estados autenticados em:

```text
.auth/user.json
.auth/admin.json
```

Esses arquivos são gerados localmente e estão no `.gitignore`, pois contêm dados de sessão.

Os testes que precisam iniciar logados usam:

```ts
test.use({ storageState: authFiles.user });
```

ou:

```ts
test.use({ storageState: authFiles.admin });
```

## Padrão dos testes

Os testes importam `test` de `support/index.ts`.

Esse arquivo adiciona os Page Objects diretamente ao objeto `page`, permitindo chamadas como:

```ts
await page.loginPage.open();
await page.catalogPage.searchBookByTitle("Harry Potter e a Pedra Filosofal");
await page.basketPage.openWithExpectedBook("Harry Potter e a Pedra Filosofal");
```

As specs ficam mais limpas, enquanto seletores, ações e assertions ficam dentro dos Page Objects.

## Cobertura atual

A suíte cobre cenários de:

- Login com sucesso.
- Validações negativas de login.
- Catálogo com busca, filtros, paginação e estado vazio.
- Cesta com adição, remoção, limpeza, cancelamento de diálogos e duplicidade.
- Checkout com confirmação de reserva e validação de termos.
- Painel administrativo com listagem, filtros e regra de permissão.

## Observações importantes

- Não use `waitForTimeout()` para esperar a interface.
- Prefira assertions web-first, como `toBeVisible`, `toBeHidden`, `toHaveURL` e `toBeEnabled`.
- Quando uma ação disparar uma API importante, crie o `waitForResponse` antes do clique.
- Os arquivos `.auth/`, `.playwright/`, `test-results/` e `playwright-report/` são artefatos locais e não devem ser versionados.
