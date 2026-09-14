import { MapPin, Navigation } from "lucide-react";
import { mapsEmbedUrl, mapsLinkUrl } from "../utils/guestMaps";
import { GuestCard, GuestSection } from "./GuestSection";

type LocationCardProps = {
  address: string;
  buildingName: string | null;
  withTitle?: boolean;
};

/**
 * El mapa no es interactivo dentro de la página: todo el recuadro es un enlace
 * que abre Google Maps (la app, en el celular). `no-referrer` evita que Google
 * reciba la URL del portal.
 */
const MapPreview = ({ address, label }: { address: string; label: string }) => (
  <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
    <iframe
      title={`Mapa de ${label}`}
      src={mapsEmbedUrl(address)}
      loading="lazy"
      referrerPolicy="no-referrer"
      tabIndex={-1}
      className="pointer-events-none absolute inset-0 h-full w-full border-0"
    />
    <a
      href={mapsLinkUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      aria-label={`Abrir ${label} en Google Maps`}
      className="absolute inset-0 flex items-start justify-end p-3 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/75 px-3 py-1.5 text-xs font-semibold text-white">
        <span className="lg:hidden">Toca para abrir en Google Maps</span>
        <span className="hidden lg:inline">Abrir en Google Maps</span>
      </span>
    </a>
  </div>
);

export const LocationCard = ({
  address,
  buildingName,
  withTitle = false,
}: LocationCardProps) => {
  const label = buildingName ? `Edificio ${buildingName}` : "el edificio";

  const body = (
    <div className="flex flex-col gap-4">
      <MapPreview address={address} label={label} />
      <GuestCard className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10">
            <MapPin className="h-5 w-5 text-brand" />
          </div>
          <div className="space-y-0.5">
            {buildingName ? (
              <p className="text-[15px] font-semibold text-slate-900">
                Edificio {buildingName}
              </p>
            ) : null}
            <p className="text-sm text-slate-500">{address}</p>
          </div>
        </div>
        <a
          href={mapsLinkUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
        >
          <Navigation className="h-[18px] w-[18px]" />
          Abrir en Google Maps
        </a>
        <p className="text-center text-xs text-slate-400">
          Se abre en la app de Google Maps si la tienes instalada.
        </p>
      </GuestCard>
    </div>
  );

  return withTitle ? (
    <GuestSection icon={MapPin} title="Cómo llegar">
      {body}
    </GuestSection>
  ) : (
    body
  );
};
