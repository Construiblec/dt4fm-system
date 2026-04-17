import { useEffect, type ChangeEvent } from "react";
import { Camera, LoaderCircle, RefreshCw } from "lucide-react";
import { usePhotoUpload } from "@/modules/incidentes/hooks/usePhotoUpload";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";

type CleaningTaskPhotoUploadProps = {
  taskId: number;
  onError: (message: string) => void;
};

export const CleaningTaskPhotoUpload = ({
  taskId,
  onError,
}: CleaningTaskPhotoUploadProps) => {
  const storedPhotoUrl = useCleaningTaskExecutionStore((state) => state.photoUrl);
  const photoUploaded = useCleaningTaskExecutionStore((state) => state.photoUploaded);
  const setPhotoUploaded = useCleaningTaskExecutionStore((state) => state.setPhotoUploaded);
  const uploadMutation = usePhotoUpload(taskId);
  const previewUrl = storedPhotoUrl ?? null;

  useEffect(() => {
    if (!uploadMutation.error) {
      return;
    }

    onError(
      uploadMutation.error instanceof Error
        ? uploadMutation.error.message
        : "No se pudo subir la fotografia",
    );
  }, [onError, uploadMutation.error]);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada"));
      reader.readAsDataURL(file);
    });

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const localPreviewUrl = await readFileAsDataUrl(file);
      setPhotoUploaded(false, localPreviewUrl);
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo preparar la imagen");
      return;
    }

    uploadMutation.mutate(file);
  };

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Fotografia de evidencia
          </h2>
          <p className="mt-1 text-sm text-slate-500">Obligatoria para finalizar la tarea</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            photoUploaded ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {photoUploaded ? "Subida" : "Pendiente"}
        </span>
      </div>

      <label className="mt-4 block cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Vista previa de evidencia de limpieza"
            className="mx-auto h-48 w-full rounded-2xl object-cover"
          />
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center text-slate-500">
            <Camera className="h-8 w-8" />
            <p className="mt-3 text-sm font-semibold">Seleccionar imagen</p>
            <p className="mt-1 text-xs text-slate-400">JPG, PNG o WEBP. Maximo 5MB.</p>
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploadMutation.isPending}
        />
      </label>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          {uploadMutation.isPending ? (
            <span className="inline-flex items-center gap-2 text-cyan-700">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Subiendo fotografia...
            </span>
          ) : photoUploaded ? (
            <span className="text-emerald-700">Foto subida exitosamente</span>
          ) : (
            <span>Sube una fotografia para habilitar la finalizacion</span>
          )}
        </div>

        {previewUrl ? (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
            <RefreshCw className="h-3.5 w-3.5" />
            Reemplazar
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploadMutation.isPending}
            />
          </label>
        ) : null}
      </div>
    </section>
  );
};
