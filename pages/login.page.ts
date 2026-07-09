import { expect, Page } from "@playwright/test";
import { LoginData } from "../types/auth.types";

export class LoginPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/login.html");
    await expect(
      this.page.getByRole("heading", { name: "Entre com sua conta" })
    ).toBeVisible();
  }

  async loginSuccessfully(data: LoginData, expectedUrl: RegExp): Promise<void> {
    const loginResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/login") &&
        response.request().method() === "POST" &&
        response.status() === 200
    );

    await this.fillCredentials(data);
    await this.page.getByRole("button", { name: /Entrar/ }).click();
    await loginResponse;

    await expect(this.page).toHaveURL(expectedUrl);
  }

  async loginWithInvalidCredentials(data: LoginData): Promise<void> {
    const loginResponse = this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/login") &&
        response.request().method() === "POST" &&
        response.status() === 401
    );

    await this.fillCredentials(data);
    await this.page.getByRole("button", { name: /Entrar/ }).click();
    await loginResponse;

    await expect(this.page.getByText("Email ou senha incorretos.")).toBeVisible();
    await expect(this.page).toHaveURL(/\/login\.html$/);
  }

  async submitWithMissingEmail(): Promise<void> {
    await this.page.getByPlaceholder("Sua senha").fill("user123");
    await this.page.getByRole("button", { name: /Entrar/ }).click();

    await expect(this.page.getByPlaceholder("seu@email.com")).toHaveClass(/is-invalid/);
    await expect(this.page.getByText(/Por favor, insira um email/)).toBeVisible();
    await expect(this.page).toHaveURL(/\/login\.html$/);
  }

  async submitWithMissingPassword(): Promise<void> {
    await this.page.getByPlaceholder("seu@email.com").fill("usuario@teste.com");
    await this.page.getByRole("button", { name: /Entrar/ }).click();

    await expect(this.page.getByPlaceholder("Sua senha")).toHaveClass(/is-invalid/);
    await expect(this.page).toHaveURL(/\/login\.html$/);
  }

  private async fillCredentials(data: LoginData): Promise<void> {
    await this.page.getByPlaceholder("seu@email.com").fill(data.email);
    await this.page.getByPlaceholder("Sua senha").fill(data.password);
  }
}
