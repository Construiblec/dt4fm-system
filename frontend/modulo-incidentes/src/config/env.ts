import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.string().url("VITE_API_URL debe ser una URL válida"),
  /**
   * "true" hace que Autorizaciones (Accesos → CAV) use datos quemados en vez
   * de llamar al backend. Mismo propósito que `HOSTAWAY_USE_MOCK` del backend:
   * ni Hostaway ni el sistema de control de acceso están integrados todavía.
   */
  VITE_CAV_MOCK: z.string().optional(),
});

const _env = envSchema.safeParse(import.meta.env);

if (!_env.success) {
  console.error("Variables de entorno inválidas", _env.error.format());
  throw new Error("Variables de entorno inválidas");
}

export const env = _env.data;
