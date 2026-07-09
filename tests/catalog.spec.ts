import { test } from "../support";

test("should display initial catalog list", async ({ page }) => {
  await page.catalogPage.open();
  await page.catalogPage.expectInitialBookList();
});

test("should search books by title", async ({ page }) => {
  await page.catalogPage.open();
  await page.catalogPage.searchBookByTitle("Harry Potter e a Pedra Filosofal");
});

test("should display empty state when no books match the search", async ({ page }) => {
  await page.catalogPage.open();
  await page.catalogPage.searchBookWithNoResults("livro-inexistente-qa");
});

test("should filter books by category", async ({ page }) => {
  await page.catalogPage.open();
  await page.catalogPage.filterByCategory("Fantasia", "Harry Potter e a Pedra Filosofal");
});

test("should show empty state when filtering unavailable books", async ({ page }) => {
  await page.catalogPage.open();
  await page.catalogPage.filterByUnavailableBooks();
});

test("should clear active filters and restore the catalog", async ({ page }) => {
  await page.catalogPage.open();
  await page.catalogPage.searchBookWithNoResults("livro-inexistente-qa");
  await page.catalogPage.clearFiltersAndRestoreCatalog();
});

test("should navigate to the next catalog page", async ({ page }) => {
  await page.catalogPage.open();
  await page.catalogPage.goToNextPage();
});
