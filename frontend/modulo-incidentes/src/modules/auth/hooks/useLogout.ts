import { useNavigate } from "react-router-dom";
import { clearSession } from "@/shared/auth/session";

export const useLogout = () => {
  const navigate = useNavigate();

  return () => {
    clearSession();
    navigate("/login");
  };
};
