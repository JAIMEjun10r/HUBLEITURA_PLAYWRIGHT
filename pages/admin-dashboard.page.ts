import { expect, Page } from "@playwright/test";

export class AdminDashboardPage {
  constructor(private readonly page: Page) {}

  async expectLoaded(): Promise<void> {
    await expect(
      this.page.getByRole("heading", { name: /Painel Administrativo/ })
    ).toBeVisible();
    await expect(this.page.getByText("Acesso restrito a administradores")).toBeVisible();
  }

  async dismissEducationalModalIfVisible(): Promise<void> {
    const modalButton = this.page.getByRole("button", { name: /Entendi! Vamos testar/ });

    if (await modalButton.isVisible()) {
      await modalButton.click();
      await expect(modalButton).toBeHidden();
    }
  }

  async openReservations(): Promise<void> {
    await this.dismissEducationalModalIfVisible();

    const reservationsResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/reservations") &&
        response.request().method() === "GET" &&
        response.ok()
    );

    await this.page.getByRole("button", { name: /Ver Reservas/ }).click();
    await reservationsResponse;

    await expect(this.page).toHaveURL(/\/admin-reservations\.html$/);
  }

  async expectRegularUserAccessDenied(): Promise<void> {
    this.page.once("dialog", async (dialog) => {
      await expect(dialog.message()).toContain("Acesso negado");
      await dialog.accept();
    });

    await this.page.goto("/admin-dashboard.html");
    await expect(this.page).toHaveURL(/\/login\.html$/);
  }
}
