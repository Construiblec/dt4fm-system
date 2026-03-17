import { AppLayout } from "@/app/layout/AppLayout";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { getBuildings } from "@/modules/incidentes/services/buildingsService";
import {
  createIncident,
  type CreateIncidentResponse,
} from "@/modules/incidentes/services/incidentsService";
import type { Building } from "@/modules/incidentes/types/Building";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { SuccessModal } from "@/shared/components/SuccessModal";
import logo from "@/shared/assets/images/construiblec-logo.png";

const priorities = [
  {
    id: 120,
    label: "Baja",
    baseClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300",
    activeClassName: "border-emerald-500 bg-emerald-500 text-white",
  },
  {
    id: 119,
    label: "Media",
    baseClassName:
      "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300",
    activeClassName: "border-amber-500 bg-amber-500 text-slate-900",
  },
  {
    id: 118,
    label: "Alta",
    baseClassName: "border-red-200 bg-red-50 text-red-700 hover:border-red-300",
    activeClassName: "border-red-500 bg-red-500 text-white",
  },
] as const;

type FormValues = {
  building: string;
  area: string;
  description: string;
};

const MAX_IMAGES = 6;
const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024;

export const ReportIncidentPage = () => {
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<CreateIncidentResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<
    (typeof priorities)[number]
  >(priorities[1]);
  const [images, setImages] = useState<File[]>([]);
  const isVisitor = Boolean(localStorage.getItem("visitorName"));
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      building: "",
      area: "",
      description: "",
    },
  });

  const imagePreviews = useMemo(
    () =>
      images.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    [images],
  );

  useEffect(() => {
    return () => {
      imagePreviews.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [imagePreviews]);

  useEffect(() => {
    let isMounted = true;

    const loadBuildings = async () => {
      try {
        const data = await getBuildings();

        if (isMounted) {
          setBuildings(data);
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;

          if (status === 401) {
            navigate("/login");
            return;
          }

          if (status === 500) {
            console.error("Error loading buildings");
            return;
          }
        }

        console.error("Error loading buildings");
      }
    };

    void loadBuildings();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const remainingSlots = useMemo(
    () => MAX_IMAGES - images.length,
    [images.length],
  );

  const handleEvidenceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    const invalidFile = selectedFiles.find(
      (file) => file.size > MAX_IMAGE_SIZE_BYTES,
    );

    if (invalidFile) {
      setError("Cada imagen debe pesar m\u00e1ximo 5MB.");
      event.target.value = "";
      return;
    }

    if (images.length + selectedFiles.length > MAX_IMAGES) {
      setError("Solo puede adjuntar hasta 6 im\u00e1genes.");
    }

    const updatedImages = [...images, ...selectedFiles].slice(0, MAX_IMAGES);

    setImages(updatedImages);
    event.target.value = "";
  };

  const removeEvidence = (fileToRemove: File) => {
    setImages((current) => current.filter((file) => file !== fileToRemove));
  };

  const getSuccessMessage = (response: CreateIncidentResponse) => {
    if (isVisitor) {
      return "Incidente enviado correctamente. Será redirigido al inicio.";
    }

    if (response.attachmentsFailed === 0) {
      return `${response.attachmentsUploaded} fotograf\u00edas adjuntadas`;
    }

    return `Incidente creado\n${response.attachmentsUploaded} fotograf\u00edas adjuntadas\n${response.attachmentsFailed} fotograf\u00eda${response.attachmentsFailed > 1 ? "s" : ""} no pudo subirse`;
  };

  const handleConfirmSubmit = () => {
    setShowConfirmModal(false);
    void handleSubmit(onSubmit)();
  };

  const onSubmit = async (values: FormValues) => {
    const visitorName = localStorage.getItem("visitorName");
    const visitorPhone = localStorage.getItem("visitorPhone");
    const notes =
      visitorName && visitorPhone
        ? `${values.description}\n\n--- Datos del visitante ---\nNombre: ${visitorName}\nTeléfono: ${visitorPhone}`
        : values.description;

    if (!values.building) {
      setError("Debe seleccionar un edificio.");
      return;
    }

    if (!Number.isInteger(Number(selectedPriority.id))) {
      setError("La prioridad seleccionada no es v\u00e1lida.");
      return;
    }

    if (images.length > MAX_IMAGES) {
      setError("Solo puede adjuntar hasta 6 im\u00e1genes.");
      return;
    }

    if (images.some((image) => image.size > MAX_IMAGE_SIZE_BYTES)) {
      setError("Cada imagen debe pesar m\u00e1ximo 5MB.");
      return;
    }

    try {
      setError(null);
      setSuccessData(null);
      setIsSubmitting(true);

      const response = await createIncident({
        buildingId: values.building,
        floorArea: values.area,
        priority: Number(selectedPriority.id),
        notes,
        images,
      });

      setSuccessData(response);
      console.log("incidente enviado");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        navigate("/login");
        return;
      }

      setError("Intente nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout className="bg-[#f1f1f2]">
      <main className="min-h-screen bg-[#f1f1f2]">
        <div className="border-b border-slate-200 bg-white px-4 py-4">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700"
          >
            <span aria-hidden="true">&larr;</span>
            Reporte de novedad
          </button>
        </div>

        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img
              src={logo}
              alt="Construiblec"
              className="h-8 w-8 rounded-md border border-slate-200 bg-white p-0.5"
            />
            <span className="text-[15px] font-semibold text-slate-800">
              Construiblec
            </span>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setShowConfirmModal(true);
          }}
          className="space-y-5 px-4 py-5"
        >
          <section className="space-y-2">
            <label
              htmlFor="building"
              className="text-sm font-semibold text-slate-700"
            >
              Edificio
            </label>
            <select
              id="building"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...register("building")}
            >
              <option value="">Seleccionar edificio</option>
              {buildings.map((building) => (
                <option key={building.id} value={String(building.id)}>
                  {building.description ?? building.name}
                </option>
              ))}
            </select>
          </section>

          <section className="space-y-2">
            <label
              htmlFor="area"
              className="text-sm font-semibold text-slate-700"
            >
              Piso / {"\u00c1rea"}
            </label>
            <input
              id="area"
              type="text"
              placeholder="01 / 09"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...register("area")}
            />
          </section>

          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">
              Nivel de prioridad
            </p>
            <div className="grid grid-cols-3 gap-2">
              {priorities.map((priority) => {
                const isActive = selectedPriority.id === priority.id;

                return (
                  <button
                    key={priority.id}
                    type="button"
                    onClick={() => setSelectedPriority(priority)}
                    className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${isActive ? priority.activeClassName : priority.baseClassName}`}
                  >
                    {priority.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <label
              htmlFor="description"
              className="text-sm font-semibold text-slate-700"
            >
              Descripci{"\u00f3"}n
            </label>
            <textarea
              id="description"
              rows={5}
              placeholder={"Coloca una breve descripci\u00f3n del incidente"}
              className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...register("description")}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Evidencia</p>
              <span className="text-xs font-medium text-slate-400">
                {images.length}/{MAX_IMAGES} im{"\u00e1"}genes
              </span>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
              <span className="text-sm font-semibold text-slate-700">
                Seleccionar im{"\u00e1"}genes
              </span>
              <span className="mt-1 text-xs text-slate-400">
                JPG, PNG o WEBP. M{"\u00e1"}ximo 6 im{"\u00e1"}genes.
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleEvidenceChange}
                disabled={remainingSlots === 0}
              />
            </label>

            {imagePreviews.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {imagePreviews.map((item) => (
                  <div
                    key={item.previewUrl}
                    className="overflow-hidden rounded-2xl bg-white shadow-sm"
                  >
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-24 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeEvidence(item.file)}
                      className="w-full border-t border-slate-100 px-2 py-2 text-xs font-semibold text-red-500"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/30"
          >
            Reportar Novedad
          </button>
        </form>

        <LoadingModal open={isSubmitting} />
        <ConfirmModal
          open={showConfirmModal}
          title="Confirmar acción"
          message="¿Está seguro que desea reportar esta novedad?"
          onConfirm={handleConfirmSubmit}
          onCancel={() => setShowConfirmModal(false)}
        />
        <SuccessModal
          open={successData !== null}
          incidentId={successData?.incidentId ?? null}
          message={successData ? getSuccessMessage(successData) : ""}
          onClose={() => {
            const isVisitor = Boolean(localStorage.getItem("visitorName"));

            if (isVisitor) {
              localStorage.removeItem("visitorName");
              localStorage.removeItem("visitorPhone");
              localStorage.removeItem("sessionId");
              localStorage.removeItem("employeeId");
              localStorage.removeItem("username");
              localStorage.removeItem("role");
              navigate("/login");
              return;
            }

            navigate("/dashboard");
          }}
        />
        <ErrorModal
          open={error !== null}
          message={error ?? undefined}
          onClose={() => setError(null)}
        />
      </main>
    </AppLayout>
  );
};
