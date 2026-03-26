import { createBrowserRouter } from "react-router-dom";
import { LoginPage } from "@/modules/auth/pages/LoginPage";
import { VisitorFormPage } from "@/modules/auth/pages/VisitorFormPage";
import { DashboardPage } from "@/modules/incidentes/pages/DashboardPage";
import { IncidentDetailPage } from "@/modules/incidentes/pages/IncidentDetailPage";
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
    path: "/visitor-form",
    element: <VisitorFormPage />,
  },
  {
    path: "/report-incident",
    element: <ReportIncidentPage />,
  },
  {
    path: "/incidents/:id",
    element: <IncidentDetailPage />,
  },
  {
    path: "/reportar-incidente",
    element: <ReportIncidentPage />,
  },
]);
