import { createBrowserRouter } from "react-router-dom";
import { LoginPage } from "@/modules/auth/pages/LoginPage";
import { VisitorFormPage } from "@/modules/auth/pages/VisitorFormPage";
import { CleaningTaskExecutionPage } from "@/modules/incidentes/pages/CleaningTaskExecutionPage";
import { DashboardPage } from "@/modules/incidentes/pages/DashboardPage";
import { IncidentDetailPage } from "@/modules/incidentes/pages/IncidentDetailPage";
import { ReportIncidentPage } from "@/modules/incidentes/pages/ReportIncidentPage";
import { SupervisorDashboardPage } from "@/modules/supervisor/pages/SupervisorDashboardPage";
import { SupervisorTaskDetailPage } from "@/modules/supervisor/pages/SupervisorTaskDetailPage";

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
    path: "/cleaning-tasks/:id/execute",
    element: <CleaningTaskExecutionPage />,
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
  {
    path: "/supervisor",
    element: <SupervisorDashboardPage />,
  },
  {
    path: "/supervisor/tasks/:id",
    element: <SupervisorTaskDetailPage />,
  },
]);
