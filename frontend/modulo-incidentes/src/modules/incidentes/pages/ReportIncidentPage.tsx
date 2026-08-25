import { AppLayout } from "@/app/layout/AppLayout";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  getBuildingLocations,
  getBuildings,
} from "@/modules/incidentes/services/buildingsService";
import {
  createIncident,
  MissingEmployeeError,
  type CreateIncidentResponse,
} from "@/modules/incidentes/services/incidentsService";
import type { Building } from "@/modules/incidentes/types/Building";
import type { BuildingLocations } from "@/modules/incidentes/types/BuildingLocations";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/shared/components/SearchableSelect";
import { SuccessModal } from "@/shared/components/SuccessModal";
import {
  clearSession,
  getHomeRoute,
  isVisitorSession,
} from "@/shared/auth/session";
import { ArrowLeft } from "lucide-react";
import { PRIORITY_IDS, PRIORITY_LABELS } from "@/shared/constants/priority";
import { rememberReturnTo } from "@/shared/auth/returnTo";

/**
 * Etiquetas en masculino, igual que el resto de la app y que lo que devuelve
 * openMAINT. Antes aquí se decía «Alta/Media/Baja» y el usuario reportaba una
 * incidencia «Alta» para leer después «Prioridad Alto» en la tarjeta.
 *
 * Los IDs son los del lookup `COMMON - Priority`; `Crítico` (117) existe pero
 * no se ofrece al reportar, es de uso interno.
 */
const priorities = [
  {
    id: PRIORITY_IDS.Low,
    label: PRIORITY_LABELS.Low,
    baseClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300",
    activeClassName: "border-emerald-500 bg-emerald-500 text-white",
  },
  {
    id: PRIORITY_IDS.Medium,
    label: PRIORITY_LABELS.Medium,
    baseClassName:
      "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300",
    activeClassName: "border-amber-500 bg-amber-500 text-white",
  },
  {
    id: PRIORITY_IDS.High,
    label: PRIORITY_LABELS.High,
    baseClassName:
      "border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-300",
    activeClassName: "border-orange-500 bg-orange-500 text-white",
  },
] as const;

type FormValues = {
  building: string;
  /** "" | String(floor.id) */
  floorId: string;
  /** "" | "Unit:123" | "CommonArea:123" | OTHER_AREA_VALUE */
  areaId: string;
  /** Texto libre cuando areaId === OTHER_AREA_VALUE */
  areaOther: string;
  /** Texto libre del fallback para edificios sin plantas registradas */
  freeArea: string;
  description: string;
};

const MAX_IMAGES = 6;
const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024;

const OTHER_AREA_VALUE = "__other__";

const MAX_AREA_OTHER_LENGTH = 80;
const MAX_FREE_AREA_LENGTH = 120;
/** ShortDescr es una columna de 255 en CMDBuild; 200 deja margen y mantiene legible el asunto del correo */
const MAX_FLOOR_AREA_LENGTH = 200;

const FIELD_CLASSES =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20";

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
  const [locations, setLocations] = useState<BuildingLocations | null>(null);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState(false);
  const isVisitor = Boolean(localStorage.getItem("visitorName"));
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      building: "",
      floorId: "",
      areaId: "",
      areaOther: "",
      freeArea: "",
      description: "",
    },
  });

  const buildingId = watch("building");
  const floorId = watch("floorId");
  const areaId = watch("areaId");

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
            rememberReturnTo();
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

  // Un solo efecto: al cambiar de edificio limpia planta/área/texto libre y recarga
  useEffect(() => {
    setValue("floorId", "");
    setValue("areaId", "");
    setValue("areaOther", "");
    setValue("freeArea", "");
    setLocations(null);
    setLocationsError(false);

    if (!buildingId) {
      return;
    }

    let cancelled = false;

    setLocationsLoading(true);

    getBuildingLocations(Number(buildingId))
      .then((data) => {
        // La comprobación de id descarta respuestas de un edificio ya cambiado
        if (cancelled || data.buildingId !== Number(buildingId)) {
          return;
        }

        setLocations(data);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(error) && error.response?.status === 401) {
          rememberReturnTo();
          navigate("/login");
          return;
        }

        // Degradar al texto libre en vez de bloquear el reporte, pero
        // sin hacer pasar el fallo por "el edificio no tiene plantas"
        console.error("Error loading building locations");
        setLocationsError(true);
        setLocations({
          buildingId: Number(buildingId),
          floors: [],
          unassignedAreas: [],
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLocationsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [buildingId, setValue, navigate]);

  const hasFloors = (locations?.floors.length ?? 0) > 0;
  const isFallback =
    Boolean(buildingId) && !locationsLoading && locations !== null && !hasFloors;

  const floorOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (locations?.floors ?? []).map((floor) => ({
        value: String(floor.id),
        label: floor.label,
      })),
    [locations],
  );

  const selectedFloor = useMemo(
    () => locations?.floors.find((floor) => String(floor.id) === floorId) ?? null,
    [locations, floorId],
  );

  const areaOptions = useMemo<SearchableSelectOption[]>(() => {
    // Sin planta elegida solo se ofrecen las áreas que no pertenecen a
    // ninguna planta, más Otros (bodegas, parqueaderos y lo no registrado)
    const options: SearchableSelectOption[] = (selectedFloor?.areas ?? []).map(
      (area) => ({
        value: `${area.kind}:${area.id}`,
        label: area.label,
        group: area.kind === "Unit" ? "Unidades" : "Áreas comunes",
      }),
    );

    for (const area of locations?.unassignedAreas ?? []) {
      options.push({
        value: `${area.kind}:${area.id}`,
        label: area.label,
        group: "Sin planta asignada",
      });
    }

    options.push({
      value: OTHER_AREA_VALUE,
      label: "Otros",
      group: "Otros",
    });

    return options;
  }, [selectedFloor, locations]);

  // El valor del área es "Unit:<id>" o "CommonArea:<id>", que es lo que permite
  // distinguir una unidad inmobiliaria de un área común al guardarlas en OpenMAINT
  const parseAreaSelection = (
    value: string,
  ): { unitId?: number; commonAreaId?: number } => {
    if (!value || value === OTHER_AREA_VALUE) {
      return {};
    }

    const separatorIndex = value.indexOf(":");

    if (separatorIndex === -1) {
      return {};
    }

    const kind = value.slice(0, separatorIndex);
    const id = Number(value.slice(separatorIndex + 1));

    if (!Number.isInteger(id) || id <= 0) {
      return {};
    }

    if (kind === "Unit") {
      return { unitId: id };
    }

    if (kind === "CommonArea") {
      return { commonAreaId: id };
    }

    return {};
  };

  const composeFloorArea = (values: FormValues): string => {
    if (!hasFloors) {
      return values.freeArea.trim();
    }

    let areaLabel = "";

    if (values.areaId === OTHER_AREA_VALUE) {
      areaLabel = values.areaOther.trim();
    } else if (values.areaId) {
      const pool = [
        ...(selectedFloor?.areas ?? []),
        ...(locations?.unassignedAreas ?? []),
      ];

      areaLabel =
        pool
          .find((area) => `${area.kind}:${area.id}` === values.areaId)
          ?.label.trim() ?? "";
    }

    return [selectedFloor?.label.trim() ?? "", areaLabel]
      .filter(Boolean)
      .join(" - ")
      .replace(/\s+/g, " ")
      .slice(0, MAX_FLOOR_AREA_LENGTH);
  };

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

  /**
   * ProcessNotes reúne la descripción y todo el texto libre.
   *
   * "Otros" no corresponde a ninguna referencia de openMAINT (Unit y CommonArea
   * solo aceptan los ids de los desplegables), así que su texto se registra
   * aquí para que no se pierda.
   */
  const composeNotes = (values: FormValues): string => {
    const blocks: string[] = [values.description.trim()];

    if (values.areaId === OTHER_AREA_VALUE && values.areaOther.trim()) {
      blocks.push(`Área indicada: ${values.areaOther.trim()}`);
    }

    const visitorName = localStorage.getItem("visitorName");
    const visitorPhone = localStorage.getItem("visitorPhone");

    if (visitorName && visitorPhone) {
      blocks.push(
        `--- Datos del visitante ---\nNombre: ${visitorName}\nTeléfono: ${visitorPhone}`,
      );
    }

    return blocks.filter(Boolean).join("\n\n");
  };

  const onSubmit = async (values: FormValues) => {
    const notes = composeNotes(values);

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

      const { unitId, commonAreaId } = parseAreaSelection(values.areaId);
      const floorId = values.floorId ? Number(values.floorId) : undefined;

      const response = await createIncident({
        buildingId: values.building,
        floorArea: composeFloorArea(values),
        floorId,
        unitId,
        commonAreaId,
        priority: Number(selectedPriority.id),
        notes,
        images,
      });

      setSuccessData(response);
      console.log("incidente enviado");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        rememberReturnTo();
        navigate("/login");
        return;
      }

      if (error instanceof MissingEmployeeError) {
        setError(error.message);
        return;
      }

      setError("Intente nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * El invitado llega aquí desde /visitor-form sin ser un usuario real, así que
   * no puede volver al dashboard: se descarta la sesión prestada y regresa al
   * formulario de invitado.
   */
  const handleBack = () => {
    if (isVisitorSession()) {
      clearSession();
      navigate("/visitor-form");
      return;
    }

    navigate(getHomeRoute());
  };

  return (
    <AppLayout className="bg-[#f1f1f2]">
      <main className="min-h-screen bg-[#f1f1f2]">
        <div className="border-b border-slate-200 bg-white px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Regresar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <h1 className="text-base font-semibold text-slate-900">
              Reporte de novedad
            </h1>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            // Validar antes de confirmar: si no, los errores saldrían tras cerrar el modal
            void trigger().then((isValid) => {
              if (isValid) {
                setShowConfirmModal(true);
              }
            });
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

          {isFallback ? (
            <section className="space-y-2">
              <label
                htmlFor="freeArea"
                className="text-sm font-semibold text-slate-700"
              >
                Piso / {"\u00c1rea"}
              </label>
              <input
                id="freeArea"
                type="text"
                placeholder="01 / 09"
                maxLength={MAX_FREE_AREA_LENGTH}
                className={FIELD_CLASSES}
                {...register("freeArea")}
              />
              {locationsError ? (
                <p className="text-xs font-medium text-amber-600">
                  No se pudieron cargar las plantas de este edificio. Escriba
                  la ubicaci{"\u00f3"}n manualmente.
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  Este edificio no tiene plantas registradas. Escriba la
                  ubicaci{"\u00f3"}n manualmente.
                </p>
              )}
            </section>
          ) : (
            <>
              <section className="space-y-2">
                <label
                  htmlFor="floorId"
                  className="text-sm font-semibold text-slate-700"
                >
                  Planta{" "}
                  <span className="text-red-500" aria-hidden="true">
                    *
                  </span>
                </label>
                <Controller
                  control={control}
                  name="floorId"
                  rules={{
                    validate: (value) =>
                      !hasFloors ||
                      value !== "" ||
                      // "Otros" es texto libre: no depende de ninguna planta
                      areaId === OTHER_AREA_VALUE ||
                      "Seleccione la planta.",
                  }}
                  render={({ field, fieldState }) => (
                    <SearchableSelect
                      id="floorId"
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next);

                        // Conservar lo escrito en Otros al elegir planta después
                        if (areaId !== OTHER_AREA_VALUE) {
                          setValue("areaId", "");
                          setValue("areaOther", "");
                        }
                      }}
                      onBlur={field.onBlur}
                      options={floorOptions}
                      loading={locationsLoading}
                      loadingMessage="Cargando plantas..."
                      disabled={!buildingId}
                      required={hasFloors}
                      invalid={Boolean(fieldState.error)}
                      describedById={
                        fieldState.error ? "floorId-error" : undefined
                      }
                      placeholder={
                        buildingId
                          ? "Seleccionar planta"
                          : "Seleccione primero el edificio"
                      }
                      searchPlaceholder="Buscar planta..."
                      emptyMessage="Sin plantas"
                    />
                  )}
                />
                {errors.floorId ? (
                  <p
                    id="floorId-error"
                    role="alert"
                    className="text-xs font-medium text-red-500"
                  >
                    {errors.floorId.message}
                  </p>
                ) : null}
              </section>

              <section className="space-y-2">
                <label
                  htmlFor="areaId"
                  className="text-sm font-semibold text-slate-700"
                >
                  {"\u00c1rea"}
                </label>
                <Controller
                  control={control}
                  name="areaId"
                  render={({ field }) => (
                    <SearchableSelect
                      id="areaId"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      options={areaOptions}
                      disabled={!buildingId}
                      loading={locationsLoading}
                      loadingMessage="Cargando áreas..."
                      placeholder={
                        floorId
                          ? "Seleccionar \u00e1rea (opcional)"
                          : "Seleccionar \u00e1rea u Otros"
                      }
                      searchPlaceholder={"Buscar \u00e1rea..."}
                      emptyMessage={"Sin \u00e1reas"}
                    />
                  )}
                />

                {areaId === OTHER_AREA_VALUE ? (
                  <>
                    <input
                      id="areaOther"
                      type="text"
                      maxLength={MAX_AREA_OTHER_LENGTH}
                      placeholder={
                        "Describa el \u00e1rea (ej. Hall de entrada)"
                      }
                      aria-invalid={Boolean(errors.areaOther) || undefined}
                      aria-describedby={
                        errors.areaOther ? "areaOther-error" : undefined
                      }
                      className={FIELD_CLASSES}
                      {...register("areaOther", {
                        validate: (value) =>
                          areaId !== OTHER_AREA_VALUE ||
                          value.trim().length > 0 ||
                          "Describa el \u00e1rea.",
                      })}
                    />
                    {errors.areaOther ? (
                      <p
                        id="areaOther-error"
                        role="alert"
                        className="text-xs font-medium text-red-500"
                      >
                        {errors.areaOther.message}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </section>
            </>
          )}

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
            if (isVisitorSession()) {
              clearSession();
              navigate("/login");
              return;
            }

            navigate(getHomeRoute());
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
