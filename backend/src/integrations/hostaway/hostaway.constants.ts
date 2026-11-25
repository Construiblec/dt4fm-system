/** Solo estos statuses generan tarea de limpieza. */
export const VALID_RESERVATION_STATUSES = ['new', 'modified', 'confirmed'];

/** Cancelación explícita. Cualquier otro estado no es motivo para anular nada. */
export const CANCELLED_STATUSES = [
  'cancelled',
  'declined',
  'expired',
  'inquirydenied',
  'inquirytimedout',
  'inquirynotpossible',
];
