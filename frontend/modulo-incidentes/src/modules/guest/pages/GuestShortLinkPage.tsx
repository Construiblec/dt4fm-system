import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GuestSkeleton } from "../components/GuestSkeleton";
import { GuestStateScreen } from "../components/GuestStateScreen";
import {
  isGuestLinkInvalid,
  redeemGuestShortLink,
} from "../services/guestPortalService";
import { storeGuestToken } from "../services/guestToken";

/** Entrada del enlace corto: canjea el código, guarda el token y abre el portal. */
export const GuestShortLinkPage = () => {
  const { code = "" } = useParams();
  const navigate = useNavigate();

  const redeem = useQuery({
    queryKey: ["guest", "short-link", code],
    queryFn: () => redeemGuestShortLink(code),
    enabled: Boolean(code),
    staleTime: Infinity,
    gcTime: 0,
    retry: (failureCount, error) =>
      !isGuestLinkInvalid(error) && failureCount < 2,
  });

  useEffect(() => {
    if (!redeem.data) return;

    storeGuestToken(redeem.data);
    navigate("/guest/dashboard", { replace: true });
  }, [redeem.data, navigate]);

  if (!code) return <GuestStateScreen variant="missing" />;
  if (redeem.isError) {
    return (
      <GuestStateScreen
        variant="error"
        error={redeem.error}
        onRetry={() => void redeem.refetch()}
      />
    );
  }

  return <GuestSkeleton />;
};
