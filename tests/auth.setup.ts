import { adminUserCredentials, regularUserCredentials } from "../data/users.data";
import { authFiles, ensureAuthDir } from "../support/auth";
import { test } from "../support";

test("authenticate regular user", async ({ page }) => {
  ensureAuthDir();

  await page.loginPage.open();
  await page.loginPage.loginSuccessfully(regularUserCredentials(), /\/dashboard\.html$/);
  await page.context().storageState({ path: authFiles.user });
});

test("authenticate admin user", async ({ page }) => {
  ensureAuthDir();

  await page.loginPage.open();
  await page.loginPage.loginSuccessfully(adminUserCredentials(), /\/admin-dashboard\.html$/);
  await page.context().storageState({ path: authFiles.admin });
});
