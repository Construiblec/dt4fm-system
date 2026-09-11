import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getGuestApiErrorMessage,
  getGuestPortalData,
  type GuestPortalData,
} from "@/modules/guest/services/guestPortalService";

/**
 * Portal del huésped, versión de prueba: texto plano, sin estilos.
 *
 * No es una maqueta a medio hacer — es deliberado. Su valor ahora mismo es de
 * **diagnóstico**: al mostrar los campos crudos deja ver cosas que hoy no se
 * ven en ninguna pantalla, como qué listings de Hostaway no están mapeados a
 * una unidad de openMAINT, o qué credenciales existen en el sistema pero no
 * llegaron a la puerta (`syncState: failed`).
 *
 * El diseño de verdad viene después, cuando esté claro qué información merece
 * estar aquí.
 */
export const GuestDashboardPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const debug = searchParams.get("debug") === "1";

  const [data, setData] = useState<GuestPortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Sin token no hay nada que pedir, así que tampoco hay carga que esperar.
  const [cargando, setCargando] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelado = false;

    getGuestPortalData(token)
      .then((respuesta) => {
        if (!cancelado) setData(respuesta);
      })
      .catch((err: unknown) => {
        if (!cancelado) {
          setError(
            getGuestApiErrorMessage(
              err,
              "No se pudo abrir tu portal. Inténtalo de nuevo más tarde.",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [token]);

  if (!token) {
    return <pre>Falta el enlace de acceso.</pre>;
  }

  if (cargando) {
    return <pre>Cargando...</pre>;
  }

  if (error || !data) {
    return <pre>{error ?? "No se pudo abrir tu portal."}</pre>;
  }

  return <pre>{render(data, debug)}</pre>;
};

/** Hora local de la propiedad, que es la que le importa al huésped. */
const hora = (iso: string): string =>
  new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil" });

const bloquePin = (data: GuestPortalData): string => {
  switch (data.pinState) {
    case "disponible":
      return [
        `  Tu PIN: ${data.pin ?? "(no disponible)"}`,
        data.syncState !== "synced"
          ? "  Aviso: se está terminando de activar en la puerta."
          : null,
      ]
        .filter(Boolean)
        .join("\n");

    case "antes-del-checkin":
      return (
        "  Tu PIN se mostrará a la hora de tu check-in,\n" +
        `  el ${hora(data.accessValidFrom)}.`
      );

    case "finalizado":
      return "  Tu estadía terminó y el PIN ya no está activo.";

    case "sin-cobertura":
      return "  Este edificio no usa PIN de acceso.";
  }
};

const render = (data: GuestPortalData, debug: boolean): string => {
  const lineas = [
    "PORTAL DEL HUÉSPED",
    "==================",
    "",
    data.guestName,
    `Reserva ${data.reservationId}`,
    "",
    "ESTADÍA",
    `  Llegada    ${data.arrivalDate}`,
    `  Salida     ${data.departureDate}`,
    `  Estado     ${data.stayStatus}`,
    "",
    "ACCESO",
    `  Desde      ${hora(data.accessValidFrom)}`,
    `  Hasta      ${hora(data.accessValidTo)}`,
    "",
    "TU PIN",
    bloquePin(data),
  ];

  if (debug) {
    lineas.push(
      "",
      "DIAGNÓSTICO",
      `  Estancia         ${data.stayId}`,
      `  Listing Hostaway ${data.listingId}`,
      `  Unidad openMAINT ${data.openmaintUnitId ?? "(listing sin mapear)"}`,
      `  Edificio         ${data.buildingId ?? "(sin resolver)"}`,
      `  Credencial       ${data.credentialId ?? "(ninguna)"}`,
      `  Sincronización   ${data.syncState ?? "(no aplica)"}`,
      "",
      JSON.stringify(data, null, 2),
    );
  }

  return lineas.join("\n");
};
