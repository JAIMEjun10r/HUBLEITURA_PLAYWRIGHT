import { expect, Page } from "@playwright/test";

export class AdminReservationsPage {
  constructor(private readonly page: Page) {}

  async expectLoaded(): Promise<void> {
    await expect(
      this.page.getByRole("heading", { name: /Gerenciar Reservas/ })
    ).toBeVisible();
    await expect(this.page.getByRole("table")).toBeVisible();
    await expect(this.page.getByRole("columnheader", { name: "Livro" })).toBeVisible();
    await expect(this.page.getByRole("columnheader", { name: /Usu.rio|Usuario/ })).toBeVisible();
  }

  async filterByActiveStatus(): Promise<void> {
    await this.page.getByLabel(/Status/).selectOption("active");

    await expect(this.page.getByText("Aguardando Retirada").first()).toBeVisible();
    await expect(this.page.getByText("completed")).toBeHidden();
  }

  async filterByUnknownUserShowsEmptyState(userName: string): Promise<void> {
    await this.page.getByLabel(/Usu.rio|Usuario/).fill(userName);

    await expect(this.page.locator("#emptyState")).toBeVisible();
    await expect(this.page.getByRole("table")).toBeHidden();
  }
}
