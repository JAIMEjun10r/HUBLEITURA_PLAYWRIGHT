import { authFiles } from "../support/auth";
import { test } from "../support";

test.use({ storageState: authFiles.admin });

test("should load admin reservations list", async ({ page }) => {
  await page.goto("/admin-dashboard.html");
  await page.adminDashboardPage.expectLoaded();
  await page.adminDashboardPage.openReservations();
  await page.adminReservationsPage.expectLoaded();
});

test("should filter admin reservations by active status", async ({ page }) => {
  await page.goto("/admin-dashboard.html");
  await page.adminDashboardPage.expectLoaded();
  await page.adminDashboardPage.openReservations();
  await page.adminReservationsPage.expectLoaded();
  await page.adminReservationsPage.filterByActiveStatus();
});

test("should show empty state when admin reservation user filter has no matches", async ({
  page,
}) => {
  await page.goto("/admin-dashboard.html");
  await page.adminDashboardPage.expectLoaded();
  await page.adminDashboardPage.openReservations();
  await page.adminReservationsPage.expectLoaded();
  await page.adminReservationsPage.filterByUnknownUserShowsEmptyState("usuario-inexistente-qa");
});
