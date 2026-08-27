import axios from "axios";
import { env } from "@/config/env";

export type LoginResponse = {
  sessionId: string;
  /**
   * El backend resuelve el Employee por `LoginUser`; es `null` cuando el
   * usuario de openMAINT no tiene tarjeta de empleado asociada.
   */
  employeeId: string | number | null;
  username: string;
  userId: number | null;
  /** Grupo activo. Es el Code de openMAINT, no la Description. */
  role: string;
  /**
   * Todos los grupos de la cuenta. openMAINT los devuelve en el propio login,
   * así que saber si alguien es multi-rol no cuesta ninguna llamada extra.
   */
  availableRoles: string[];
  /**
   * Code → Description de cada grupo en openMAINT (`MaintOffice` →
   * "TPM Equipment"). Es lo que se enseña en pantalla: el Code es interno.
   */
  roleLabels: Record<string, string>;
  /** Nombre legible del usuario, para el saludo de la cabecera. */
  name: string | null;
  /** Solo lo tienen los residentes. */
  tenantId: number | null;
  cleaningEmployeeId?: string | number | null;
};

export type Building = {
  id: number;
  code: string;
  name: string;
  description: string;
};

export type VerifyOwnerResponse = {
  found: boolean;
  tenantId: number;
  name: string;
  idNumber: number;
  phone: number | null;
  email: string | null;
  suggestedUsername: string;
};

export type RegisterOwnerResponse = {
  success: boolean;
  username: string;
  userId: number;
  tenantId: number;
  name: string;
};

export type OwnerLoginResponse = {
  sessionId: string;
  username: string;
  role: string;
  tenantId: number | null;
  userId: number | null;
  name: string;
};

export type OwnerUnit = {
  nombre: string;
  alicuotaUnidad: number;
  alicuotaParqueadero: number;
  alicuotaBodega: number;
  alicuotaTotal: number;
  valorExpensa: number;
};

export type OwnerPago = {
  id: number;
  unidad: string;
  monto: number;
  periodo: string;
  estado: string;
  estadoCodigo: string;
  fechaPago: string | null;
  tipo: string;
};

export type OwnerPaymentsResponse = {
  alDia: boolean;
  totalPendiente: number;
  pagos: OwnerPago[];
};

export type PayPaymentPayload = {
  paymentIds: number[];
  method: "transfer" | "card";
  paymentDate: string;
  notes?: string;
};

export type PayPaymentResponse = {
  success: boolean;
  message: string;
  results: { id: number; success: boolean; error?: string }[];
};

export type OwnerProfile = {
  userId: number;
  username: string;
  name: string;
  email: string | null;
};

export type CommonArea = {
  id: number;
  code: string;
  name: string;
  notes: string | null;
  estado: string;
  estadoCodigo: string | null;
  condicion: string | null;
  edificio: string | null;
  edificioId: number | null;
  piso: string | null;
  areaNeta: number | null;
  precio: number | null;
  fechaReservaInicio: string | null;
  fechaReservaFin: string | null;
};

export type CreateReservationPayload = {
  commonAreaId: string;
  fechaInicio: string;
  fechaFin: string;
  notes?: string;
};

export type CreateReservationResponse = {
  success: boolean;
  message: string;
  areaId: number;
  fechaInicio: string;
  fechaFin: string;
  precio: number;
};

const backendBaseUrl = env.VITE_API_URL.replace(/\/api\/?$/, "");

const authApi = axios.create({
  baseURL: backendBaseUrl,
  headers: { "Content-Type": "application/json" },
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Login único para equipo y residentes. `role` es opcional: sirve para entrar
 * directamente con un grupo concreto cuando ya se eligió en el selector.
 */
export const login = async (
  username: string,
  password: string,
  role?: string,
): Promise<LoginResponse> => {
  const { data } = await authApi.post<LoginResponse>("/auth/login", {
    username,
    password,
    ...(role ? { role } : {}),
  });
  return data;
};

/**
 * Cambia el rol de la sesión viva. openMAINT recalcula los privilegios sobre el
 * mismo `sessionId`, así que el cambio es real y no solo de etiqueta: por eso
 * hay que reemplazar la sesión entera con lo que devuelve.
 */
export const switchRole = async (
  sessionId: string,
  role: string,
): Promise<LoginResponse> => {
  const { data } = await authApi.post<LoginResponse>(
    "/auth/role",
    { role },
    { headers: { Authorization: sessionId } },
  );
  return data;
};

/** Cambio de contraseña con sesión iniciada, para cualquier rol. */
export const changePassword = async (
  sessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; message: string }> => {
  const { data } = await authApi.put<{ success: boolean; message: string }>(
    "/auth/password",
    { currentPassword, newPassword },
    { headers: { Authorization: sessionId } },
  );
  return data;
};

export const getOwnerBuildings = async (): Promise<Building[]> => {
  const { data } = await authApi.get<Building[]>("/owners/buildings");
  return data;
};

export const verifyOwner = async (idNumber: string): Promise<VerifyOwnerResponse> => {
  const { data } = await authApi.post<VerifyOwnerResponse>("/owners/verify", { idNumber });
  return data;
};

export const registerOwner = async (
  idNumber: string, username: string, password: string,
): Promise<RegisterOwnerResponse> => {
  const { data } = await authApi.post<RegisterOwnerResponse>("/owners/register", {
    idNumber, username, password,
  });
  return data;
};

export const loginOwner = async (username: string, password: string): Promise<OwnerLoginResponse> => {
  const { data } = await authApi.post<OwnerLoginResponse>("/owners/login", { username, password });
  return data;
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const getOwnerUnits = async (tenantId: number): Promise<OwnerUnit[]> => {
  const { data } = await authApi.get<OwnerUnit[]>(`/owners/${tenantId}/units`);
  return data;
};

export const getOwnerPayments = async (tenantId: number): Promise<OwnerPaymentsResponse> => {
  const { data } = await authApi.get<OwnerPaymentsResponse>(`/owners/${tenantId}/payments`);
  return data;
};

// ─── Pagos ────────────────────────────────────────────────────────────────────

export const payPayments = async (
  tenantId: number,
  payload: PayPaymentPayload,
): Promise<PayPaymentResponse> => {
  const { data } = await authApi.post<PayPaymentResponse>(
    `/owners/${tenantId}/payments/pay`,
    payload,
  );
  return data;
};

export const uploadPaymentVoucher = async (
  paymentId: number,
  file: File,
): Promise<{ success: boolean; message: string }> => {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await axios.post<{ success: boolean; message: string }>(
    `${backendBaseUrl}/owners/payments/${paymentId}/voucher`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
};

// ─── Perfil ───────────────────────────────────────────────────────────────────

export const getOwnerProfile = async (userId: number): Promise<OwnerProfile> => {
  const { data } = await authApi.get<OwnerProfile>(`/owners/${userId}/profile`);
  return data;
};

export const changeOwnerPassword = async (
  userId: number, currentPassword: string, newPassword: string,
): Promise<{ success: boolean; message: string }> => {
  const { data } = await authApi.put<{ success: boolean; message: string }>(
    `/owners/${userId}/password`, { currentPassword, newPassword },
  );
  return data;
};

export const contactAdmin = async (
  tenantId: number, subject: string, message: string,
): Promise<{ success: boolean; message: string }> => {
  const { data } = await authApi.post<{ success: boolean; message: string }>(
    `/owners/${tenantId}/contact`, { subject, message },
  );
  return data;
};

// ─── Áreas comunales ─────────────────────────────────────────────────────────

export const getCommonAreas = async (buildingId?: number): Promise<CommonArea[]> => {
  const params = buildingId ? `?buildingId=${buildingId}` : "";
  const { data } = await authApi.get<CommonArea[]>(`/owners/common-areas${params}`);
  return data;
};

export const getCommonAreaById = async (areaId: number): Promise<CommonArea> => {
  const { data } = await authApi.get<CommonArea>(`/owners/common-areas/${areaId}`);
  return data;
};

export const createReservation = async (
  tenantId: number, payload: CreateReservationPayload,
): Promise<CreateReservationResponse> => {
  const { data } = await authApi.post<CreateReservationResponse>(
    `/owners/${tenantId}/reservations`, payload,
  );
  return data;
};
