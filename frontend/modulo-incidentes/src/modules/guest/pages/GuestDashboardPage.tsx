import { TriangleAlert } from "lucide-react";
import { ActionRow } from "../components/ActionRow";
import { GuestDebugPanel } from "../components/GuestDebugPanel";
import { GuestHeader } from "../components/GuestHeader";
import { GuestPageShell } from "../components/GuestPageShell";
import { GuestSkeleton } from "../components/GuestSkeleton";
import { GuestStateScreen } from "../components/GuestStateScreen";
import { LocationCard } from "../components/LocationCard";
import { PinCard } from "../components/PinCard";
import { StayCard } from "../components/StayCard";
import { VehicularGateCard } from "../components/VehicularGateCard";
import { useGuestPortal } from "../hooks/useGuestPortal";
import { useGuestToken } from "../hooks/useGuestToken";

/**
 * Portal del huésped. En el celular es una sola columna en el orden del diseño;
 * en escritorio, dos columnas: accesos a la izquierda, estadía y mapa a la
 * derecha. Los contenedores de columna son `contents` en móvil para que el
 * orden (`order-*`) atraviese las dos columnas.
 */
export const GuestDashboardPage = () => {
  const { token, debug, urlClean } = useGuestToken();
  const portal = useGuestPortal(token);

  if (!token) return <GuestStateScreen variant="missing" />;
  if (portal.isPending) return <GuestSkeleton />;
  if (portal.isError) {
    return (
      <GuestStateScreen
        variant="error"
        error={portal.error}
        onRetry={() => void portal.refetch()}
      />
    );
  }

  const data = portal.data;
  const address = data.buildingAddress;

  return (
    <GuestPageShell>
      <GuestHeader data={data} />

      <div className="mt-6 flex flex-col gap-6 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <div className="order-1 lg:order-none">
            <PinCard data={data} />
          </div>
          {data.hasVehicularAccess ? (
            <div className="order-2 lg:order-none">
              <VehicularGateCard />
            </div>
          ) : null}
          {data.canReportIncident ? (
            <div className="order-5 lg:order-none">
              <ActionRow
                to="/guest/incidencia"
                icon={TriangleAlert}
                tone="danger"
                title="Reportar una incidencia"
                subtitle="Se registra como invitado, sin crear una cuenta."
              />
            </div>
          ) : null}
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <div className="order-3 lg:order-none">
            <StayCard data={data} />
          </div>
          {address && urlClean ? (
            <div className="order-4 lg:order-none">
              <LocationCard
                address={address}
                buildingName={data.buildingName}
              />
            </div>
          ) : null}
        </div>
      </div>

      {debug ? <GuestDebugPanel data={data} /> : null}
    </GuestPageShell>
  );
};
