import { expect, Page } from "@playwright/test";

export class CheckoutPage {
  constructor(private readonly page: Page) {}

  async expectConfirmButtonDisabledUntilTermsAreAccepted(): Promise<void> {
    const confirmButton = this.page.getByRole("button", { name: /Confirmar Reservas/ });

    await expect(confirmButton).toBeDisabled();

    await this.page
      .getByRole("checkbox", { name: /Li e concordo com os termos/ })
      .check();

    await expect(confirmButton).toBeEnabled();
  }

  async expectConfirmButtonDisabledWhenTermsAreNotAccepted(): Promise<void> {
    await expect(
      this.page.getByRole("button", { name: /Confirmar Reservas/ })
    ).toBeDisabled();
  }

  async confirmReservationSuccessfully(): Promise<void> {
    const reservationResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/reservations") &&
        response.request().method() === "POST" &&
        response.status() === 201
    );

    await this.page.getByRole("button", { name: /Confirmar Reservas/ }).click();
    await reservationResponse;

    await expect(
      this.page.getByRole("heading", { name: "Reservas Confirmadas!" })
    ).toBeVisible();
    await expect(this.page.getByText("Suas reservas foram criadas com sucesso.")).toBeVisible();
  }
}
