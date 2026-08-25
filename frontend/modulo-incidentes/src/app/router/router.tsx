import { Navigate, createBrowserRouter } from "react-router-dom";
import { AccountPage } from "@/modules/auth/pages/AccountPage";
import { LoginPage } from "@/modules/auth/pages/LoginPage";
import { RoleSelectPage } from "@/modules/auth/pages/RoleSelectPage";
import { ForgotPasswordPage } from "@/modules/auth/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/modules/auth/pages/ResetPasswordPage";
import { VisitorFormPage } from "@/modules/auth/pages/VisitorFormPage";
import { NotificationsPage } from "@/modules/notificaciones/pages/NotificationsPage";
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
import { OwnerRegisterPage } from "@/modules/owners/pages/OwnerRegisterPage";
import { OwnerDashboardPage } from "@/modules/owners/pages/OwnerDashboardPage";
import { OwnerPaymentsPage } from "@/modules/owners/pages/OwnerPaymentsPage";
import { OwnerReservationsPage } from "@/modules/owners/pages/OwnerReservationsPage";
import { OwnerProfilePage } from "@/modules/owners/pages/OwnerProfilePage";
import { OwnerReservationDetailPage } from "@/modules/owners/pages/reservation/OwnerReservationDetailPage";

export const router = createBrowserRouter([
  { path: "/", element: <LoginPage /> },
  { path: "/login", element: <LoginPage /> },
  // Solo aparece si la cuenta tiene más de una vista disponible.
  { path: "/seleccionar-rol", element: <RoleSelectPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/dashboard", element: <DashboardPage /> },
  { path: "/cuenta", element: <AccountPage /> },
  { path: "/notificaciones", element: <NotificationsPage /> },
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
  // El login de residentes se unificó en /login; queda la redirección para los
  // enlaces antiguos y el acceso directo al alta.
  { path: "/owner/auth", element: <Navigate to="/login" replace /> },
  { path: "/owner/register", element: <OwnerRegisterPage /> },
  { path: "/owner/dashboard", element: <OwnerDashboardPage /> },
  { path: "/owner/payments", element: <OwnerPaymentsPage /> },
  { path: "/owner/reservations", element: <OwnerReservationsPage /> },
  { path: "/owner/reservations/:areaId", element: <OwnerReservationDetailPage /> },
  { path: "/owner/profile", element: <OwnerProfilePage /> },
]);
