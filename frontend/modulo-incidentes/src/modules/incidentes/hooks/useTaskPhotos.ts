import { useMutation, useQueryClient } from "@tanstack/react-query";
import { photoUploadSchema } from "@/modules/incidentes/schemas/cleaningTaskExecutionSchema";
import {
  deleteCleaningTaskAttachment,
  uploadCleaningTaskPhoto,
} from "@/modules/incidentes/services/cleaningTaskExecutionService";
import { prepareImage } from "@/shared/utils/prepareImage";

/**
 * Alta y baja de fotos de evidencia.
 *
 * La lista vive en OpenMAINT, no en el store: por eso ambas mutaciones invalidan
 * el detalle de la tarea y la galería se repinta con lo que hay en el servidor.
 * Así las fotos siguen ahí al reanudar una pausa, al reabrir la tarea o al abrir
 * la app en otro dispositivo.
 */
export const useTaskPhotos = (taskId: number) => {
  const queryClient = useQueryClient();

  const refreshDetail = () =>
    queryClient.invalidateQueries({
      queryKey: ["cleaning-task-detail", taskId],
    });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      // Todas a memoria y reducidas ya, a la vez: se suben de una en una, y para
      // la última el archivo del móvil podría haber dejado de leerse (ver
      // `prepareImage`). Reducir antes de validar: una foto de cámara de un
      // móvil actual pasa de los 5 MB.
      const prepared = await Promise.all(
        files.map((file) => prepareImage(file)),
      );

      // De una en una: OpenMAINT valida el tope de adjuntos en cada subida, y en
      // paralelo dos peticiones podrían pasarlo a la vez.
      for (const file of prepared) {
        const parsed = photoUploadSchema.safeParse({ file });

        if (!parsed.success) {
          throw new Error(
            parsed.error.issues[0]?.message ?? "No se pudo validar la imagen",
          );
        }

        await uploadCleaningTaskPhoto(taskId, file);
      }
    },
    onSettled: refreshDetail,
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: number | string) =>
      deleteCleaningTaskAttachment(taskId, attachmentId),
    onSettled: refreshDetail,
  });

  return { uploadMutation, deleteMutation };
};
