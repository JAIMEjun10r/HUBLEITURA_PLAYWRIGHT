import { BasketReservationData } from "../types/reservation.types";

export function generateBasketReservationData(): BasketReservationData {
  const uniqueId = crypto.randomUUID();

  return {
    bookTitle: "Harry Potter e a Pedra Filosofal",
    bookNotes: `Book note ${uniqueId}`,
    generalNotes: `Reservation note ${uniqueId}`,
  };
}
