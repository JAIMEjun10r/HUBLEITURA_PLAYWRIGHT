import { generateBasketReservationData } from "../data/reservation.data";
import { authFiles } from "../support/auth";
import { test } from "../support";

test.use({ storageState: authFiles.user });

test("should search a book and confirm a reservation from checkout", async ({ page }) => {
  const reservationData = generateBasketReservationData();

  await page.catalogPage.open();
  await page.catalogPage.searchBookByTitle(reservationData.bookTitle);
  await page.catalogPage.addVisibleBookToBasket(reservationData.bookTitle);

  await page.basketPage.openWithExpectedBook(reservationData.bookTitle);
  await page.basketPage.continueToCheckout(
    reservationData.bookNotes,
    reservationData.generalNotes
  );

  await page.checkoutPage.expectConfirmButtonDisabledUntilTermsAreAccepted();
  await page.checkoutPage.confirmReservationSuccessfully();
});

test("should keep reservation confirmation disabled when terms are not accepted", async ({
  page,
}) => {
  const reservationData = generateBasketReservationData();

  await page.catalogPage.open();
  await page.catalogPage.searchBookByTitle(reservationData.bookTitle);
  await page.catalogPage.addVisibleBookToBasket(reservationData.bookTitle);

  await page.basketPage.openWithExpectedBook(reservationData.bookTitle);
  await page.basketPage.continueToCheckout(
    reservationData.bookNotes,
    reservationData.generalNotes
  );

  await page.checkoutPage.expectConfirmButtonDisabledWhenTermsAreNotAccepted();
});
