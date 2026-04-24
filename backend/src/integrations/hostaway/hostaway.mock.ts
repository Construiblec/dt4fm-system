/**
 * Mock de la API de Hostaway
 * Simula checkouts del día para pruebas
 * Para producción: reemplazar getMockCheckouts por llamadas reales a:
 * GET https://api.hostaway.com/v1/reservations?checkoutStartDate=YYYY-MM-DD&checkoutEndDate=YYYY-MM-DD
 * Header: Authorization: Bearer {HOSTAWAY_API_KEY}
 */

export interface HostawayReservation {
  reservationId: string;
  guestName: string;
  listingName: string;
  listingId: string;
  checkoutDate: string;
  checkoutTime: string;
}

export interface HostawayBillingReservation {
  hostawayReservationId: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  guestCountry: string | null;
  listingMapId: string;
  listingName: string;
  arrivalDate: string;
  departureDate: string;
  totalPrice: number;
  cleaningFee: number;
  currency: string;
  channelName: string;
  confirmationCode: string;
  nights: number;
}

export interface HostawayCheckoutsResponse {
  result: HostawayReservation[];
  count: number;
}

export function getMockCheckouts(date: string): HostawayCheckoutsResponse {
  const reservations: HostawayReservation[] = [
    {
      reservationId: 'HW-2026-001',
      guestName: 'Carlos Perezzz',
      listingName: 'Apto 101 - Torre A',
      listingId: 'UNIT-101',
      checkoutDate: date,
      checkoutTime: '11:00',
    },
    {
      reservationId: 'HW-2026-002',
      guestName: 'María Fernández',
      listingName: 'Apto 205 - Torre B',
      listingId: 'UNIT-205',
      checkoutDate: date,
      checkoutTime: '10:00',
    },
    {
      reservationId: 'HW-2026-003',
      guestName: 'John Smith',
      listingName: 'Apto 310 - Torre A',
      listingId: 'UNIT-310',
      checkoutDate: date,
      checkoutTime: '12:00',
    },
    {
      reservationId: 'HW-2026-004',
      guestName: 'Ana López',
      listingName: 'Apto 402 - Torre C',
      listingId: 'UNIT-402',
      checkoutDate: date,
      checkoutTime: '11:30',
    },
  ];

  return {
    result: reservations,
    count: reservations.length,
  };
}
