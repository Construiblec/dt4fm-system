import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { readGuestToken, storeGuestToken } from "../services/guestToken";

/**
 * Toma el token del enlace (`?token=`) o del almacenamiento, y lo saca de la URL
 * cuanto antes: en la barra de direcciones queda en el historial y viaja como
 * `Referer` a cualquier recurso de terceros, como el mapa.
 */
export const useGuestToken = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const urlToken = searchParams.get("token")?.trim() ?? "";
  const debug = searchParams.get("debug") === "1";

  const [token] = useState(() => urlToken || readGuestToken());

  useEffect(() => {
    if (!urlToken) return;

    storeGuestToken(urlToken);
    navigate({ pathname, search: debug ? "?debug=1" : "" }, { replace: true });
  }, [urlToken, debug, pathname, navigate]);

  return { token: urlToken || token, debug, urlClean: !urlToken };
};
