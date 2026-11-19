import { photoUploadSchema } from "@/modules/incidentes/schemas/cleaningTaskExecutionSchema";
import { prepareImage } from "@/shared/utils/prepareImage";

/**
 * Deja las fotos listas para subir: en memoria, reducidas y validadas.
 *
 * Se hace al elegirlas y no al subirlas: en el móvil, el archivo elegido puede
 * dejar de leerse un rato después (ver `prepareImage`), y una foto de cámara
 * actual pasa de los 5 MB hasta que se reduce.
 */
export const preparePhotos = async (files: File[]): Promise<File[]> => {
  const prepared = await Promise.all(files.map((file) => prepareImage(file)));
  for (const file of prepared) {
    const parsed = photoUploadSchema.safeParse({ file });
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "No se pudo validar la imagen",
      );
    }
  }
  return prepared;
};
