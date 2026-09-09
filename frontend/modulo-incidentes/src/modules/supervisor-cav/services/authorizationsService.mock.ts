import type {
  Authorization,
  AuthorizationResponse,
  ListAuthorizationsResponse,
} from "@/modules/supervisor-cav/types/Authorization";

/**
 * Datos quemados para Autorizaciones. Se activan con `VITE_CAV_MOCK=true`
 * (ver `authorizationsService.ts`) porque ni Hostaway ni el sistema de
 * control de acceso están integrados todavía — sin esto no hay forma de ver
 * la pantalla con contenido real.
 *
 * Las fechas se calculan relativas a hoy para que la reserva siempre caiga
 * dentro del rango "próximos 7 días" que trae `useAuthorizations` por
 * defecto, sin importar cuándo se ejecute.
 */
const daysFromNow = (days: number, time = "15:00:00"): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.toISOString().slice(0, 10)}T${time}`;
};

/** Vive en memoria del módulo: sobrevive a la navegación, no a un refresco. */
let authorizations: Authorization[] = [
  {
    id: 1,
    guestName: "Marta Ruiz",
    unitLabel: "Torre A · UI R302",
    checkIn: daysFromNow(1),
    checkOut: daysFromNow(4, "11:00:00"),
    pinStatus: "ready",
    lastSentAt: daysFromNow(-2, "09:12:00"),
  },
  {
    id: 2,
    guestName: "Carlos Medina",
    unitLabel: "Torre B · UI I41",
    checkIn: daysFromNow(2),
    checkOut: daysFromNow(5, "11:00:00"),
    pinStatus: "pending",
    lastSentAt: null,
  },
  {
    id: 3,
    guestName: "Ana Torres",
    unitLabel: "Torre A · UI P02",
    checkIn: daysFromNow(3),
    checkOut: daysFromNow(6, "11:00:00"),
    pinStatus: "ready",
    lastSentAt: null,
  },
];

/** Una API real tarda; sin esto los estados de carga nunca se ven. */
const delay = () => new Promise((resolve) => setTimeout(resolve, 400));

const findOrThrow = (id: number): Authorization => {
  const found = authorizations.find((item) => item.id === id);
  if (!found) throw new Error(`[mock] No existe la autorización ${id}`);
  return found;
};

export const mockListAuthorizations =
  async (): Promise<ListAuthorizationsResponse> => {
    await delay();
    return { data: authorizations };
  };

export const mockGetAuthorization = async (
  id: number,
): Promise<AuthorizationResponse> => {
  await delay();
  return { data: findOrThrow(id) };
};

export const mockRegeneratePin = async (
  id: number,
): Promise<AuthorizationResponse> => {
  await delay();
  authorizations = authorizations.map((item) =>
    item.id === id ? { ...item, pinStatus: "pending" } : item,
  );
  return { data: findOrThrow(id) };
};

export const mockSendPin = async (
  id: number,
): Promise<AuthorizationResponse> => {
  await delay();
  authorizations = authorizations.map((item) =>
    item.id === id
      ? { ...item, pinStatus: "ready", lastSentAt: new Date().toISOString() }
      : item,
  );
  return { data: findOrThrow(id) };
};
