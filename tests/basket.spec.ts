import { authFiles } from "../support/auth";
import { test } from "../support";

test.use({ storageState: authFiles.user });

test("should display empty basket state when no books were selected", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("bookCart"));
  await page.basketPage.openEmpty();
});

test("should redirect checkout to empty basket when no books were selected", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("bookCart"));
  await page.basketPage.openCheckoutWithEmptyBasket();
});

test("should remove a selected book from basket", async ({ page }) => {
  const bookTitle = "Harry Potter e a Pedra Filosofal";

  await page.catalogPage.open();
  await page.catalogPage.searchBookByTitle(bookTitle);
  await page.catalogPage.addVisibleBookToBasket(bookTitle);

  await page.basketPage.openWithExpectedBook(bookTitle);
  await page.basketPage.removeBookFromBasket(bookTitle);
});

test("should keep selected book when removal is cancelled", async ({ page }) => {
  const bookTitle = "Harry Potter e a Pedra Filosofal";

  await page.catalogPage.open();
  await page.catalogPage.searchBookByTitle(bookTitle);
  await page.catalogPage.addVisibleBookToBasket(bookTitle);

  await page.basketPage.openWithExpectedBook(bookTitle);
  await page.basketPage.cancelBookRemoval(bookTitle);
});

test("should warn when adding the same book twice", async ({ page }) => {
  const bookTitle = "Harry Potter e a Pedra Filosofal";

  await page.catalogPage.open();
  await page.catalogPage.searchBookByTitle(bookTitle);
  await page.catalogPage.addVisibleBookToBasket(bookTitle);
  await page.catalogPage.tryToAddSameBookAgain(bookTitle);
});

test("should clear all selected books from basket", async ({ page }) => {
  await page.catalogPage.open();
  await page.catalogPage.addBooksToBasket([
    "Harry Potter e a Pedra Filosofal",
    "A Arte da Guerra",
  ]);

  await page.basketPage.openWithExpectedBook("Harry Potter e a Pedra Filosofal");
  await page.basketPage.clearBasketSuccessfully();
});

test("should keep selected books when clear basket is cancelled", async ({ page }) => {
  await page.catalogPage.open();
  await page.catalogPage.addBooksToBasket([
    "Harry Potter e a Pedra Filosofal",
    "A Arte da Guerra",
  ]);

  await page.basketPage.openWithExpectedBook("Harry Potter e a Pedra Filosofal");
  await page.basketPage.cancelClearBasket();
});
