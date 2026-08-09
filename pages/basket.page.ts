import { expect, Page } from "@playwright/test";

export class BasketPage {
  constructor(private readonly page: Page) {}

  async openEmpty(): Promise<void> {
    await this.page.goto("/basket.html");
    await this.expectEmpty();
  }

  async openCheckoutWithEmptyBasket(): Promise<void> {
    await this.page.goto("/checkout.html");

    await expect(this.page).toHaveURL(/\/basket\.html$/);
    await this.expectEmpty();
  }

  async openWithExpectedBook(title: string): Promise<void> {
    const bookResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/books/") &&
        response.request().method() === "GET" &&
        response.ok()
    );

    await this.page.goto("/basket.html");
    await bookResponse;

    await expect(this.page.getByRole("heading", { name: "Sua Cesta de Livros" })).toBeVisible();
    await expect(this.page.getByRole("heading", { name: title })).toBeVisible();
  }

  async continueToCheckout(bookNotes: string, generalNotes: string): Promise<void> {
    await this.page
      .getByRole("textbox", { name: /Observa..es para este livro/ })
      .fill(bookNotes);
    await this.page.getByRole("textbox", { name: /Observa..es Gerais/ }).fill(generalNotes);
    await this.page.getByRole("button", { name: /Finalizar Reservas/ }).click();

    await expect(this.page).toHaveURL(/\/checkout\.html$/);
  }

  async removeBookFromBasket(title: string): Promise<void> {
    this.page.once("dialog", async (dialog) => {
      await expect(dialog.message()).toContain(title);
      await dialog.accept();
    });

    await this.page.locator(".remove-btn").click();

    await expect(this.page.getByText(`"${title}" foi removido da cesta`)).toBeVisible();
    await this.expectEmpty();
  }

  async cancelBookRemoval(title: string): Promise<void> {
    this.page.once("dialog", async (dialog) => {
      await expect(dialog.message()).toContain(title);
      await dialog.dismiss();
    });

    await this.page.locator(".remove-btn").click();

    await expect(this.page.getByRole("heading", { name: title })).toBeVisible();
    await expect(this.page.getByRole("link", { name: /CESTA DE LIVROS 1/ })).toBeVisible();
  }

  async clearBasketSuccessfully(): Promise<void> {
    this.page.once("dialog", async (dialog) => {
      await expect(dialog.message()).toContain("remover todos os livros");
      await dialog.accept();
    });

    await this.page.getByRole("button", { name: /Limpar Cesta/ }).click();

    await expect(this.page.getByText("Cesta limpa com sucesso!")).toBeVisible();
    await this.expectEmpty();
  }

  async cancelClearBasket(): Promise<void> {
    this.page.once("dialog", async (dialog) => {
      await expect(dialog.message()).toContain("remover todos os livros");
      await dialog.dismiss();
    });

    await this.page.getByRole("button", { name: /Limpar Cesta/ }).click();

    await expect(this.page.getByRole("heading", { name: "Sua Cesta de Livros" })).toBeVisible();
    await expect(this.page.getByRole("link", { name: /CESTA DE LIVROS/ })).toBeVisible();
  }

  async expectEmpty(): Promise<void> {
    await expect(
      this.page.getByRole("heading", { name: /Sua cesta est. vazia/ })
    ).toBeVisible();
    await expect(this.page.getByRole("link", { name: /Explorar Cat.logo/ })).toBeVisible();
    await expect(this.page.getByRole("link", { name: /CESTA DE LIVROS 0/ })).toBeVisible();
  }
}
