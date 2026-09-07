/**
 * Mock de la API de Hostaway
 * Simula checkouts para pruebas locales (HOSTAWAY_USE_MOCK=true).
 * El camino real vive en HostawayService.getCheckouts.
 */

export interface HostawayReservation {
  reservationId: string;
  guestName: string;
  listingName: string;
  listingId: string;
  checkoutDate: string;
  /**
   * Hostaway devuelve la hora como número entero (11) en /v1/reservations,
   * mientras que el mock la expresa como texto ('11:00'). Ambas formas son
   * válidas y los consumidores deben tolerarlas.
   */
  checkoutTime: string | number;
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

/** Unidades ficticias reutilizadas para cada día del rango simulado. */
const MOCK_UNITS = [
  {
    guestName: 'Carlos Perezzz',
    listingName: 'Apto 101 - Torre A',
    listingId: 'UNIT-101',
    checkoutTime: '11:00',
  },
  {
    guestName: 'María Fernández',
    listingName: 'Apto 205 - Torre B',
    listingId: 'UNIT-205',
    checkoutTime: '10:00',
  },
  {
    guestName: 'John Smith',
    listingName: 'Apto 310 - Torre A',
    listingId: 'UNIT-310',
    checkoutTime: '12:00',
  },
  {
    guestName: 'Ana López',
    listingName: 'Apto 402 - Torre C',
    listingId: 'UNIT-402',
    checkoutTime: '11:30',
  },
];

/** Recorre [dateFrom, dateTo] inclusive en UTC para no depender de la zona local. */
function eachDate(dateFrom: string, dateTo: string): string[] {
  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return [dateFrom];
  }

  const days: string[] = [];
  for (
    let cursor = start;
    cursor <= end;
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    days.push(cursor.toISOString().split('T')[0]);
  }
  return days;
}

/**
 * Genera checkouts simulados para cada día del rango.
 * Si se omite dateTo, simula un único día (comportamiento anterior).
 */
export function getMockCheckouts(
  dateFrom: string,
  dateTo?: string,
): HostawayCheckoutsResponse {
  const days = eachDate(dateFrom, dateTo ?? dateFrom);

  const reservations: HostawayReservation[] = days.flatMap((day, dayIndex) => {
    // Varía el volumen por día (3 o 4 unidades) para que las pruebas no vean
    // siempre exactamente el mismo número de filas en cada fecha.
    const unitsForDay = MOCK_UNITS.slice(0, dayIndex % 3 === 2 ? 3 : 4);

    return unitsForDay.map((unit, unitIndex) => ({
      reservationId: `HW-MOCK-${day}-${String(unitIndex + 1).padStart(3, '0')}`,
      guestName: unit.guestName,
      listingName: unit.listingName,
      listingId: unit.listingId,
      checkoutDate: day,
      checkoutTime: unit.checkoutTime,
    }));
  });

  return {
    result: reservations,
    count: reservations.length,
  };
}

/**
 * Reserva vista desde el acceso del huésped. A diferencia de
 * `HostawayBillingReservation`, la clave es el `id` **interno** de Hostaway,
 * que es el que acepta `GET /v1/reservations/{id}`: `hostawayReservationId` es
 * el identificador del canal (Airbnb, Booking) y no sirve para consultar.
 */
export interface HostawayGuestReservation {
  id: number;
  status: string;
  guestName: string;
  guestEmail: string | null;
  listingName: string;
  listingMapId: string;
  arrivalDate: string;
  departureDate: string;
  confirmationCode: string;
  nights: number;
}

/**
 * Reserva simulada para desarrollo local con `HOSTAWAY_USE_MOCK=true`. Las
 * fechas son relativas a hoy —llegó ayer, se va en tres días— para que el
 * enlace generado esté siempre dentro de su ventana de validez y se pueda
 * probar el flujo completo sin depender de la API real.
 */
export function getMockGuestReservation(
  id: number,
): HostawayGuestReservation | null {
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const isoDate = (offsetDays: number): string =>
    new Date(Date.now() + offsetDays * 86_400_000).toISOString().split('T')[0];

  return {
    id,
    status: 'confirmed',
    guestName: 'Carlos Perezzz',
    guestEmail: 'huesped.prueba@example.com',
    listingName: 'Apto 101 - Torre A',
    listingMapId: 'UNIT-101',
    arrivalDate: isoDate(-1),
    departureDate: isoDate(3),
    confirmationCode: `HW-MOCK-${id}`,
    nights: 4,
  };
}
