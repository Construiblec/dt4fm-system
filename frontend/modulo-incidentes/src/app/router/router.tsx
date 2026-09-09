import { Navigate, createBrowserRouter } from "react-router-dom";
import { RequireRole } from "@/app/router/RequireRole";
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
import { AsistenteSLDashboardPage } from "@/modules/asistente-sl/pages/AsistenteSLDashboardPage";
import { AsistenteSLTaskDetailPage } from "@/modules/asistente-sl/pages/AsistenteSLTaskDetailPage";
import { MaintenanceSupervisorDashboardPage } from "@/modules/supervisor-mantenimiento/pages/MaintenanceSupervisorDashboardPage";
import { MaintenanceSupervisorDetailPage } from "@/modules/supervisor-mantenimiento/pages/MaintenanceSupervisorDetailPage";
import { AuthorizationsListPage } from "@/modules/supervisor-cav/pages/AuthorizationsListPage";
import { AuthorizationDetailPage } from "@/modules/supervisor-cav/pages/AuthorizationDetailPage";
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
  {
    path: "/supervisor",
    element: (
      <RequireRole roles={["SupervisorLimpieza", "SuperUser"]}>
        <SupervisorDashboardPage />
      </RequireRole>
    ),
  },
  {
    path: "/supervisor/tasks/:id",
    element: (
      <RequireRole roles={["SupervisorLimpieza", "SuperUser"]}>
        <SupervisorTaskDetailPage />
      </RequireRole>
    ),
  },
  // ── Asistente de Supervisión de Limpiezas ─────────────────────────────────
  {
    path: "/asistente-sl",
    element: (
      <RequireRole roles={["AsistenteSL", "SuperUser"]}>
        <AsistenteSLDashboardPage />
      </RequireRole>
    ),
  },
  {
    path: "/asistente-sl/tasks/:id",
    element: (
      <RequireRole roles={["AsistenteSL", "SuperUser"]}>
        <AsistenteSLTaskDetailPage />
      </RequireRole>
    ),
  },
  // ── Supervisión de mantenimiento ──────────────────────────────────────────
  {
    path: "/supervisor-mantenimiento",
    element: (
      <RequireRole roles={["SupervisorMantenimiento", "SuperUser"]}>
        <MaintenanceSupervisorDashboardPage />
      </RequireRole>
    ),
  },
  {
    path: "/supervisor-mantenimiento/:kind/:id",
    element: (
      <RequireRole roles={["SupervisorMantenimiento", "SuperUser"]}>
        <MaintenanceSupervisorDetailPage />
      </RequireRole>
    ),
  },
  // ── Supervisor CAV (Accesos) ────────────────────────────────────────────────
  // Solo Autorizaciones por ahora; Disuasión, Acceso remoto y Eventos quedan
  // fuera de este alcance.
  {
    path: "/supervisor-cav/autorizaciones",
    element: (
      <RequireRole roles={["SupervisorCAV", "SuperUser"]}>
        <AuthorizationsListPage />
      </RequireRole>
    ),
  },
  {
    path: "/supervisor-cav/autorizaciones/:id",
    element: (
      <RequireRole roles={["SupervisorCAV", "SuperUser"]}>
        <AuthorizationDetailPage />
      </RequireRole>
    ),
  },
  // ── Propietarios ──────────────────────────────────────────────────────────
  // El login de residentes se unificó en /login; queda la redirección para los
  // enlaces antiguos y el acceso directo al alta.
  { path: "/owner/auth", element: <Navigate to="/login" replace /> },
  { path: "/owner/register", element: <OwnerRegisterPage /> },
  {
    path: "/owner/dashboard",
    element: (
      <RequireRole roles={["Propietarios", "SuperUser"]}>
        <OwnerDashboardPage />
      </RequireRole>
    ),
  },
  {
    path: "/owner/payments",
    element: (
      <RequireRole roles={["Propietarios", "SuperUser"]}>
        <OwnerPaymentsPage />
      </RequireRole>
    ),
  },
  {
    path: "/owner/reservations",
    element: (
      <RequireRole roles={["Propietarios", "SuperUser"]}>
        <OwnerReservationsPage />
      </RequireRole>
    ),
  },
  {
    path: "/owner/reservations/:areaId",
    element: (
      <RequireRole roles={["Propietarios", "SuperUser"]}>
        <OwnerReservationDetailPage />
      </RequireRole>
    ),
  },
  {
    path: "/owner/profile",
    element: (
      <RequireRole roles={["Propietarios", "SuperUser"]}>
        <OwnerProfilePage />
      </RequireRole>
    ),
  },
]);
