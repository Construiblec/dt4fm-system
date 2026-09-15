import { MapPin } from "lucide-react";
import { mapsEmbedUrl, mapsLinkUrl } from "../utils/guestMaps";
import { GuestSection } from "./GuestSection";

type LocationCardProps = {
  address: string;
  buildingName: string | null;
};

/**
 * Mapa y dirección en una sola tarjeta. El mapa no se manipula dentro de la
 * página: tocarlo abre Google Maps (la app, en el celular). `no-referrer` evita
 * que Google reciba la URL del portal.
 */
export const LocationCard = ({ address, buildingName }: LocationCardProps) => {
  const label = buildingName ? `Edificio ${buildingName}` : "el edificio";

  return (
    <GuestSection icon={MapPin} title="Cómo llegar">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative aspect-[16/10] bg-slate-100">
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
            className="absolute inset-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand/40"
          />
        </div>
        <div className="flex items-start gap-3 border-t border-slate-100 p-4">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="space-y-0.5">
            {buildingName ? (
              <p className="text-[15px] font-semibold text-slate-900">
                Edificio {buildingName}
              </p>
            ) : null}
            <p className="text-sm text-slate-500">{address}</p>
          </div>
        </div>
      </div>
    </GuestSection>
  );
};
