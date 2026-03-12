import { useNavigate } from "react-router-dom";

export const useLogout = () => {
  const navigate = useNavigate();

  return () => {
    localStorage.removeItem("session");
    localStorage.removeItem("sessionId");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    navigate("/login");
  };
};
