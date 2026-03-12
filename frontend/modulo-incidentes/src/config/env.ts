import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.string().url("VITE_API_URL debe ser una URL válida"),
});

const _env = envSchema.safeParse(import.meta.env);

if (!_env.success) {
  console.error("Variables de entorno inválidas", _env.error.format());
  throw new Error("Variables de entorno inválidas");
}

export const env = _env.data;
