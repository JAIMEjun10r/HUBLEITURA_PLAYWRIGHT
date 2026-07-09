import { expect, Page, test as base } from "@playwright/test";
import { AdminDashboardPage } from "../pages/admin-dashboard.page";
import { AdminReservationsPage } from "../pages/admin-reservations.page";
import { BasketPage } from "../pages/basket.page";
import { CatalogPage } from "../pages/catalog.page";
import { CheckoutPage } from "../pages/checkout.page";
import { LoginPage } from "../pages/login.page";

type Fixtures = {
  page: HubPage;
};

export type HubPage = Page & {
  adminDashboardPage: AdminDashboardPage;
  adminReservationsPage: AdminReservationsPage;
  basketPage: BasketPage;
  catalogPage: CatalogPage;
  checkoutPage: CheckoutPage;
  loginPage: LoginPage;
};

const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    const hubPage = page as HubPage;

    hubPage.adminDashboardPage = new AdminDashboardPage(page);
    hubPage.adminReservationsPage = new AdminReservationsPage(page);
    hubPage.basketPage = new BasketPage(page);
    hubPage.catalogPage = new CatalogPage(page);
    hubPage.checkoutPage = new CheckoutPage(page);
    hubPage.loginPage = new LoginPage(page);

    await use(hubPage);
  },
});

export { expect, test };
