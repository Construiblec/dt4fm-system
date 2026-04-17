import { z } from "zod";

export const observationsSchema = z.string().max(1000, "Las observaciones no pueden superar 1000 caracteres");

export const completeTaskSchema = z.object({
  observations: observationsSchema.optional().default(""),
  checklistComplete: z.boolean().refine((value) => value === true, {
    message: "Debes completar todas las actividades del checklist",
  }),
  photoUploaded: z.boolean().refine((value) => value === true, {
    message: "Debes subir al menos una fotografia de evidencia",
  }),
});

export const photoUploadSchema = z.object({
  file: z
    .instanceof(File, { message: "Selecciona una imagen valida" })
    .refine((file) => file.type.startsWith("image/"), {
      message: "Solo se permiten archivos de imagen",
    })
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "La imagen no puede superar los 5MB",
    }),
});
