import { createBrowserRouter } from "react-router-dom";
import { LoginPage } from "@/modules/auth/pages/LoginPage";
import { DashboardPage } from "@/modules/incidentes/pages/DashboardPage";
import { ReportIncidentPage } from "@/modules/incidentes/pages/ReportIncidentPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <LoginPage />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/dashboard",
    element: <DashboardPage />,
  },
  {
    path: "/reportar-incidente",
    element: <ReportIncidentPage />,
  },
]);
