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
