import { useSearchParams } from "react-router-dom";
import { readGuestToken } from "../services/guestToken";

/** El token lo guarda `/g/<código>` al canjear el enlace corto; nunca viaja en la URL. */
export const useGuestToken = () => {
  const [searchParams] = useSearchParams();

  return {
    token: readGuestToken(),
    debug: searchParams.get("debug") === "1",
  };
};
