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
 * Portal del huésped. En escritorio, dos columnas: estadía y accesos a la
 * izquierda, ubicación e incidencias a la derecha. En el celular las columnas
 * se apilan en ese mismo orden.
 */
export const GuestDashboardPage = () => {
  const { token, debug } = useGuestToken();
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

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <StayCard data={data} />
          <PinCard data={data} />
          {data.hasVehicularAccess ? <VehicularGateCard /> : null}
        </div>

        {address || data.canReportIncident ? (
          <div className="flex flex-col gap-6">
            {address ? (
              <LocationCard address={address} buildingName={data.buildingName} />
            ) : null}
            {data.canReportIncident ? (
              <ActionRow
                to="/guest/incidencia"
                icon={TriangleAlert}
                tone="danger"
                title="Reportar una incidencia"
                subtitle="¿Algo no funciona en tu alojamiento? Avísanos y lo revisamos."
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {debug ? <GuestDebugPanel data={data} /> : null}
    </GuestPageShell>
  );
};
