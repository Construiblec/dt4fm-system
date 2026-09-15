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
 * Portal del huésped. En escritorio, dos columnas: accesos y estadía a la
 * izquierda, ubicación e incidencias a la derecha. En el celular las columnas
 * se apilan, y ese orden es justo el del diseño móvil.
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
  const showMap = Boolean(address) && urlClean;

  return (
    <GuestPageShell>
      <GuestHeader data={data} />

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <PinCard data={data} />
          {data.hasVehicularAccess ? <VehicularGateCard /> : null}
          <StayCard data={data} />
        </div>

        {showMap || data.canReportIncident ? (
          <div className="flex flex-col gap-6">
            {showMap && address ? (
              <LocationCard address={address} buildingName={data.buildingName} />
            ) : null}
            {data.canReportIncident ? (
              <ActionRow
                to="/guest/incidencia"
                icon={TriangleAlert}
                tone="danger"
                title="Reportar una incidencia"
                subtitle="Se registra como invitado, sin crear una cuenta."
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {debug ? <GuestDebugPanel data={data} /> : null}
    </GuestPageShell>
  );
};
