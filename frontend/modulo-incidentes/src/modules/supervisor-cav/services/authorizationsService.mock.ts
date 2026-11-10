import type {
  AccessLevelChoice,
  Authorization,
  AuthorizationResponse,
  ListAuthorizationsResponse,
} from "@/modules/supervisor-cav/types/Authorization";

/**
 * Datos quemados para Autorizaciones. Se activan con `VITE_CAV_MOCK=true`
 * (ver `authorizationsService.ts`). Ya existe backend real, así que esto queda
 * solo para trabajar la pantalla sin levantar el entorno completo.
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
    id: "6b1f2c80-0d2a-4f1e-9a33-1c7e5b204a01",
    guestName: "Marta Ruiz",
    unitLabel: "Inglaterra · UI R302",
    checkIn: daysFromNow(1),
    checkOut: daysFromNow(4, "11:00:00"),
    pinValidFrom: daysFromNow(1, "13:00:00"),
    pinValidTo: daysFromNow(4, "16:00:00"),
    accessLevel: "both",
    accessRevoked: null,
  },
  {
    id: "6b1f2c80-0d2a-4f1e-9a33-1c7e5b204a02",
    guestName: "Carlos Medina",
    unitLabel: "Pradera · UI I41",
    checkIn: daysFromNow(2),
    checkOut: daysFromNow(5, "11:00:00"),
    pinValidFrom: daysFromNow(2, "13:00:00"),
    pinValidTo: daysFromNow(5, "16:00:00"),
    accessLevel: "pedestrian",
    accessRevoked: null,
  },
  {
    id: "6b1f2c80-0d2a-4f1e-9a33-1c7e5b204a03",
    guestName: "Ana Torres",
    unitLabel: "Inglaterra · UI P02",
    checkIn: daysFromNow(3),
    checkOut: daysFromNow(6, "11:00:00"),
    pinValidFrom: daysFromNow(3, "13:00:00"),
    pinValidTo: daysFromNow(6, "16:00:00"),
    accessLevel: null,
    accessRevoked: { at: daysFromNow(-1, "15:40:00"), by: "jperez" },
  },
];

/** Una API real tarda; sin esto los estados de carga nunca se ven. */
const delay = () => new Promise((resolve) => setTimeout(resolve, 400));

const findOrThrow = (id: string): Authorization => {
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
  id: string,
): Promise<AuthorizationResponse> => {
  await delay();
  return { data: findOrThrow(id) };
};

/** El PIN no viaja al frontend ni siquiera aquí: renovar no cambia nada visible. */
export const mockRegeneratePin = async (
  id: string,
): Promise<AuthorizationResponse> => {
  await delay();
  return { data: findOrThrow(id) };
};

export const mockUpdateAccessLevel = async (
  id: string,
  accessLevel: AccessLevelChoice,
): Promise<AuthorizationResponse> => {
  await delay();
  authorizations = authorizations.map((item) => {
    if (item.id !== id) return item;
    if (accessLevel !== "none") {
      return { ...item, accessLevel, accessRevoked: null };
    }
    return {
      ...item,
      accessLevel: null,
      accessRevoked: item.accessRevoked ?? {
        at: new Date().toISOString(),
        by: "mock",
      },
    };
  });
  return { data: findOrThrow(id) };
};
