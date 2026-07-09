import { expect, Page } from "@playwright/test";

export class CatalogPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    const booksResponse = this.waitForBooksResponse();

    await this.page.goto("/catalog.html");
    await booksResponse;

    await expect(
      this.page.getByRole("heading", { name: /Conhe.a Nosso Acervo/ })
    ).toBeVisible();
  }

  async searchBookByTitle(title: string): Promise<void> {
    const searchResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/books") &&
        response.url().includes("search=") &&
        response.request().method() === "GET" &&
        response.ok()
    );

    await this.page
      .getByRole("textbox", { name: /Buscar por t.tulo|Buscar por titulo/ })
      .fill(title);
    await searchResponse;

    await expect(this.page.getByRole("heading", { name: title })).toBeVisible();
    await expect(this.page.getByText(/Exibindo 1 de 1 livros/)).toBeVisible();
  }

  async expectInitialBookList(): Promise<void> {
    await expect(this.page.getByText(/Exibindo 12 de 23 livros/)).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "1984" })).toBeVisible();
    await expect(
      this.page.getByRole("heading", { name: "Harry Potter e a Pedra Filosofal" })
    ).toBeVisible();
  }

  async searchBookWithNoResults(searchTerm: string): Promise<void> {
    const searchResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/books") &&
        response.url().includes("search=") &&
        response.request().method() === "GET" &&
        response.ok()
    );

    await this.page
      .getByRole("textbox", { name: /Buscar por t.tulo|Buscar por titulo/ })
      .fill(searchTerm);
    await searchResponse;

    await expect(
      this.page.getByRole("heading", { name: /Nenhum livro encontrado/ })
    ).toBeVisible();
    await expect(this.page.getByText(`Busca: "${searchTerm}"`)).toBeVisible();
  }

  async addVisibleBookToBasket(title: string, expectedBasketCount = 1): Promise<void> {
    const bookCard = this.page
      .locator(".card")
      .filter({ has: this.page.getByRole("heading", { name: title }) });

    await bookCard.getByRole("button", { name: /Adicionar/ }).click();

    await expect(bookCard.getByRole("button", { name: /Adicionado/ })).toBeVisible();
    await expect(
      this.page.getByText(new RegExp(`${title}.*foi adicionado.*cesta`))
    ).toBeVisible();
    await expect(
      this.page.getByRole("link", {
        name: new RegExp(`CESTA DE LIVROS ${expectedBasketCount}`),
      })
    ).toBeVisible();
  }

  async tryToAddSameBookAgain(title: string): Promise<void> {
    const bookCard = this.page
      .locator(".card")
      .filter({ has: this.page.getByRole("heading", { name: title }) });
    const addButton = bookCard.getByRole("button", { name: /Adicionar|Adicionado/ });

    await expect(addButton).toBeEnabled({ timeout: 4_000 });
    await addButton.click();

    await expect(this.page.getByText(new RegExp(`${title}.*j.*est.*cesta`))).toBeVisible();
    await expect(this.page.getByRole("link", { name: /CESTA DE LIVROS 1/ })).toBeVisible();
  }

  async addBooksToBasket(titles: string[]): Promise<void> {
    for (const [index, title] of titles.entries()) {
      await this.searchBookByTitle(title);
      await this.addVisibleBookToBasket(title, index + 1);
      await this.page.getByRole("button", { name: /Remover todos/ }).click();
    }
  }

  async filterByCategory(category: string, expectedBookTitle: string): Promise<void> {
    const filterResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/books") &&
        response.url().includes(`category=${encodeURIComponent(category)}`) &&
        response.request().method() === "GET" &&
        response.ok()
    );

    await this.page.locator("#category-filter").selectOption(category);
    await filterResponse;

    await expect(this.page.getByText(`Categoria: ${category}`)).toBeVisible();
    await expect(
      this.page.getByRole("heading", { name: expectedBookTitle })
    ).toBeVisible();
  }

  async filterByUnavailableBooks(): Promise<void> {
    const filterResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/books") &&
        response.url().includes("available=false") &&
        response.request().method() === "GET" &&
        response.ok()
    );

    await this.page.locator("#availability-filter").selectOption("false");
    await filterResponse;

    await expect(this.page.getByText(/Disponibilidade: Indispon/)).toBeVisible();
    await expect(
      this.page.getByRole("heading", { name: /Nenhum livro encontrado/ })
    ).toBeVisible();
  }

  async clearFiltersAndRestoreCatalog(): Promise<void> {
    const clearResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/books?page=1") &&
        !response.url().includes("search=") &&
        !response.url().includes("category=") &&
        response.request().method() === "GET" &&
        response.ok()
    );

    await this.page.getByRole("button", { name: /Remover todos/ }).click();
    await clearResponse;

    await expect(this.page.locator("#filter-status")).toHaveClass(/d-none/);
    await this.expectInitialBookList();
  }

  async goToNextPage(): Promise<void> {
    const nextPageResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/books?page=2") &&
        response.request().method() === "GET" &&
        response.ok()
    );

    await this.page.getByRole("link", { name: /Pr.ximo/ }).click();
    await nextPageResponse;

    await expect(this.page.getByText(/Exibindo 23 de 23 livros/)).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "O Hobbit" })).toBeVisible();
  }

  private async waitForBooksResponse(): Promise<void> {
    await this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/books") &&
        response.request().method() === "GET" &&
        response.ok()
    );
  }
}
