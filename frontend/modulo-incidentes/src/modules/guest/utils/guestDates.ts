import type { GuestPortalData } from "../services/guestPortalService";

/** Hora de la propiedad, no la del dispositivo: el huésped puede venir de otra zona. */
const TIME_ZONE = "America/Guayaquil";
const LOCALE = "es-EC";

const clean = (text: string) => text.replace(/\./g, "").replace(",", "");

/** `2026-09-14` → «lun 14 sept». Se lee como día civil, sin desfase de zona. */
export const formatStayDate = (ymd: string): string => {
  const [year, month, day] = ymd.split("-").map(Number);

  if (!year || !month || !day) return ymd;

  return clean(
    new Intl.DateTimeFormat(LOCALE, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day, 12))),
  );
};

export const formatInstantDate = (iso: string): string =>
  clean(
    new Intl.DateTimeFormat(LOCALE, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: TIME_ZONE,
    }).format(new Date(iso)),
  );

export const formatInstantTime = (iso: string): string =>
  new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(new Date(iso));

export const formatInstantDateTime = (iso: string): string =>
  `${formatInstantDate(iso)}, ${formatInstantTime(iso)}`;

export const firstName = (fullName: string): string =>
  fullName.trim().split(/\s+/)[0] || "Huésped";

export const stayPhase = (
  data: Pick<GuestPortalData, "checkInAt">,
  now: Date = new Date(),
): "proxima" | "en-curso" =>
  now < new Date(data.checkInAt) ? "proxima" : "en-curso";
