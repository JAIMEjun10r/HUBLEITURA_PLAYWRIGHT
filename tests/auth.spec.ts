import {
  adminUserCredentials,
  invalidUserCredentials,
  regularUserCredentials,
} from "../data/users.data";
import { test } from "../support";

test("should login successfully as regular user", async ({ page }) => {
  await page.loginPage.open();
  await page.loginPage.loginSuccessfully(regularUserCredentials(), /\/dashboard\.html$/);
});

test("should show error message when login credentials are invalid", async ({ page }) => {
  await page.loginPage.open();
  await page.loginPage.loginWithInvalidCredentials(invalidUserCredentials());
});

test("should validate missing email on login form", async ({ page }) => {
  await page.loginPage.open();
  await page.loginPage.submitWithMissingEmail();
});

test("should validate missing password on login form", async ({ page }) => {
  await page.loginPage.open();
  await page.loginPage.submitWithMissingPassword();
});

test("should login successfully as admin", async ({ page }) => {
  await page.loginPage.open();
  await page.loginPage.loginSuccessfully(adminUserCredentials(), /\/admin-dashboard\.html$/);
  await page.adminDashboardPage.expectLoaded();
});
