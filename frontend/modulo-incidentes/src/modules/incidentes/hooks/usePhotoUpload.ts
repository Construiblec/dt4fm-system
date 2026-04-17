import { useMutation } from "@tanstack/react-query";
import { photoUploadSchema } from "@/modules/incidentes/schemas/cleaningTaskExecutionSchema";
import { uploadCleaningTaskPhoto } from "@/modules/incidentes/services/cleaningTaskExecutionService";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";

export const usePhotoUpload = (taskId: number) => {
  const setPhotoUploaded = useCleaningTaskExecutionStore((state) => state.setPhotoUploaded);

  return useMutation({
    mutationFn: async (file: File) => {
      const parsed = photoUploadSchema.safeParse({ file });

      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "No se pudo validar la imagen");
      }

      return uploadCleaningTaskPhoto(taskId, file);
    },
    onSuccess: (photoUrl) => {
      setPhotoUploaded(true, photoUrl);
    },
  });
};
