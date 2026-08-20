import { createBrowserRouter } from "react-router-dom";
import { LoginPage } from "@/modules/auth/pages/LoginPage";
import { ForgotPasswordPage } from "@/modules/auth/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/modules/auth/pages/ResetPasswordPage";
import { VisitorFormPage } from "@/modules/auth/pages/VisitorFormPage";
import { CleaningTaskExecutionPage } from "@/modules/incidentes/pages/CleaningTaskExecutionPage";
import { DashboardPage } from "@/modules/incidentes/pages/DashboardPage";
import { IncidentDetailPage } from "@/modules/incidentes/pages/IncidentDetailPage";
import { PastPreventiveMaintenancePage } from "@/modules/incidentes/pages/PastPreventiveMaintenancePage";
import { PreventiveMaintenanceDetailPage } from "@/modules/incidentes/pages/PreventiveMaintenanceDetailPage";
import { ReportIncidentPage } from "@/modules/incidentes/pages/ReportIncidentPage";
import { SupervisorDashboardPage } from "@/modules/supervisor/pages/SupervisorDashboardPage";
import { SupervisorTaskDetailPage } from "@/modules/supervisor/pages/SupervisorTaskDetailPage";
import { MaintenanceSupervisorDashboardPage } from "@/modules/supervisor-mantenimiento/pages/MaintenanceSupervisorDashboardPage";
import { MaintenanceSupervisorDetailPage } from "@/modules/supervisor-mantenimiento/pages/MaintenanceSupervisorDetailPage";
import { OwnerAuthPage } from "@/modules/owners/pages/OwnerAuthPage";
import { OwnerDashboardPage } from "@/modules/owners/pages/OwnerDashboardPage";
import { OwnerPaymentsPage } from "@/modules/owners/pages/OwnerPaymentsPage";
import { OwnerReservationsPage } from "@/modules/owners/pages/OwnerReservationsPage";
import { OwnerProfilePage } from "@/modules/owners/pages/OwnerProfilePage";
import { OwnerReservationDetailPage } from "@/modules/owners/pages/reservation/OwnerReservationDetailPage";

export const router = createBrowserRouter([
  { path: "/", element: <LoginPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/dashboard", element: <DashboardPage /> },
  { path: "/cleaning-tasks/:id/execute", element: <CleaningTaskExecutionPage /> },
  { path: "/visitor-form", element: <VisitorFormPage /> },
  { path: "/report-incident", element: <ReportIncidentPage /> },
  { path: "/incidents/:id", element: <IncidentDetailPage /> },
  {
    path: "/preventive-maintenance/:id",
    element: <PreventiveMaintenanceDetailPage />,
  },
  {
    path: "/preventive-maintenance/historial/:id",
    element: <PastPreventiveMaintenancePage />,
  },
  { path: "/reportar-incidente", element: <ReportIncidentPage /> },
  { path: "/supervisor", element: <SupervisorDashboardPage /> },
  { path: "/supervisor/tasks/:id", element: <SupervisorTaskDetailPage /> },
  // ── Supervisión de mantenimiento ──────────────────────────────────────────
  {
    path: "/supervisor-mantenimiento",
    element: <MaintenanceSupervisorDashboardPage />,
  },
  {
    path: "/supervisor-mantenimiento/:kind/:id",
    element: <MaintenanceSupervisorDetailPage />,
  },
  // ── Propietarios ──────────────────────────────────────────────────────────
  { path: "/owner/auth", element: <OwnerAuthPage /> },
  { path: "/owner/dashboard", element: <OwnerDashboardPage /> },
  { path: "/owner/payments", element: <OwnerPaymentsPage /> },
  { path: "/owner/reservations", element: <OwnerReservationsPage /> },
  { path: "/owner/reservations/:areaId", element: <OwnerReservationDetailPage /> },
  { path: "/owner/profile", element: <OwnerProfilePage /> },
]);
