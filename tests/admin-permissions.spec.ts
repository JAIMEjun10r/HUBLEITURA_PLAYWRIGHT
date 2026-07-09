import { authFiles } from "../support/auth";
import { test } from "../support";

test.use({ storageState: authFiles.user });

test("should deny admin dashboard access for regular user", async ({ page }) => {
  await page.adminDashboardPage.expectRegularUserAccessDenied();
});
