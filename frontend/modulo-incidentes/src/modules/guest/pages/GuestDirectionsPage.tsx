import { Navigate } from "react-router-dom";
import { GuestBackHeader } from "../components/GuestBackHeader";
import { GuestPageShell } from "../components/GuestPageShell";
import { GuestSkeleton } from "../components/GuestSkeleton";
import { GuestStateScreen } from "../components/GuestStateScreen";
import { LocationCard } from "../components/LocationCard";
import { useGuestPortal } from "../hooks/useGuestPortal";
import { useGuestToken } from "../hooks/useGuestToken";

export const GuestDirectionsPage = () => {
  const { token, urlClean } = useGuestToken();
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

  const { buildingAddress, buildingName } = portal.data;

  if (!buildingAddress) return <Navigate to="/guest/dashboard" replace />;

  return (
    <GuestPageShell width="narrow">
      <GuestBackHeader title="Cómo llegar" />
      <div className="mt-5">
        {urlClean ? (
          <LocationCard address={buildingAddress} buildingName={buildingName} />
        ) : null}
      </div>
    </GuestPageShell>
  );
};
