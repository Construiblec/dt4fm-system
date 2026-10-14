import { useMemo, useState, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Download,
  FileSpreadsheet,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import type { Checklist } from "../types/Coordinador";
import {
  describeApiError,
  downloadChecklistTemplate,
  fetchChecklist,
  saveBlob,
  saveChecklist,
} from "../services/coordinadorService";
import {
  COORD_KEY,
  useChecklists,
  useInvalidateCoord,
} from "../hooks/useCoordData";
import {
  describeChecklistMinutes,
  detalleToRows,
  ENCODING_LABELS,
  EXAMPLE_CSV,
  formatBytes,
  lintChecklist,
  summarizeChecklist,
  type ChecklistSummary,
} from "../domain/checklist";
import {
  describeCsvError,
  MAX_TEMPLATE_BYTES,
  readCsvTemplate,
  type CsvEncoding,
} from "../domain/csvTemplate";
import { ChecklistPreview, ChecklistSummaryLine } from "../components/pickers";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  InlineAlert,
  PageHeader,
  Skeleton,
  TD,
  TH,
} from "../components/ui";
import { cx, inputClass } from "../components/uiUtils";
import { useCoordFlash } from "../layout/flash";

const MinutesCell = ({ summary }: { summary: ChecklistSummary }) => {
  if (summary.minutes === null) {
    return (
      <Chip title="El asistente de voz no hará recordatorios con este checklist.">
        Sin minutos · sin recordatorios
      </Chip>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="tabular-nums text-slate-900">
        {describeChecklistMinutes(summary)}
      </span>
      {summary.isPartial ? <Chip tone="amber">Minutos parciales</Chip> : null}
    </span>
  );
};

const downloadExample = () =>
  saveBlob(
    new Blob(["﻿", EXAMPLE_CSV], { type: "text/csv;charset=utf-8" }),
    "ejemplo-checklist.csv",
  );

// ─── Lista ──────────────────────────────────────────────────────────────────

export const ChecklistsPage = () => {
  const navigate = useNavigate();
  const checklistsQ = useChecklists();

  const items = useMemo(
    () =>
      (checklistsQ.data ?? []).map((c) => ({
        checklist: c,
        summary: summarizeChecklist(c.activities),
      })),
    [checklistsQ.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Checklists"
        subtitle="Las actividades que el equipo sigue en cada limpieza. Cada limpieza lleva un checklist como un campo más."
        actions={
          <>
            <Button icon={FileSpreadsheet} onClick={downloadExample}>
              Descargar ejemplo de CSV
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => navigate("/coordinador/checklists/nuevo")}
            >
              Nuevo checklist
            </Button>
          </>
        }
      />

      <Card bodyClass="">
        {checklistsQ.isError && !checklistsQ.data ? (
          <ErrorState
            message={describeApiError(checklistsQ.error, "Intenta de nuevo.")}
            onRetry={() => void checklistsQ.refetch()}
          />
        ) : !checklistsQ.data ? (
          <Skeleton rows={3} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Aún no hay checklists."
            action={
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => navigate("/coordinador/checklists/nuevo")}
              >
                Nuevo checklist
              </Button>
            }
          >
            Crea el primero subiendo el CSV que ya usan los supervisores
            (Titulo, Actividad, Minutos) o escribiendo el Detalle.
          </EmptyState>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className={TH}>
                    Nombre de checklist
                  </th>
                  <th scope="col" className={cx(TH, "text-right")}>
                    Secciones
                  </th>
                  <th scope="col" className={cx(TH, "text-right")}>
                    Actividades
                  </th>
                  <th scope="col" className={TH}>
                    Tiempo estimado
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ checklist: c, summary }) => {
                  return (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() =>
                        navigate(`/coordinador/checklists/${c.id}`)
                      }
                    >
                      <td className={TD}>
                        <p className="font-semibold text-slate-900">
                          {c.templateName ??
                            c.description ??
                            `Checklist ${c.id}`}
                        </p>
                        {c.description && c.description !== c.templateName ? (
                          <p
                            className="max-w-xs truncate text-xs text-slate-500"
                            title={c.description}
                          >
                            {c.description}
                          </p>
                        ) : null}
                      </td>
                      <td className={cx(TD, "text-right tabular-nums")}>
                        {summary.sectionCount}
                      </td>
                      <td className={cx(TD, "text-right tabular-nums")}>
                        {summary.activityCount}
                      </td>
                      <td className={TD}>
                        <MinutesCell summary={summary} />
                      </td>
                      <td className={cx(TD, "text-right")}>
                        <Button
                          size="sm"
                          icon={Pencil}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/coordinador/checklists/${c.id}`);
                          }}
                        >
                          Editar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InlineAlert tone="neutral" title="Minutos y recordatorios">
        El asistente de voz del empleado avisa cuando se cumplen los minutos de
        cada actividad. Si una actividad no tiene minutos, no hay recordatorio
        para ella.
      </InlineAlert>
    </div>
  );
};

// ─── Ficha (crear / editar) ─────────────────────────────────────────────────

type Upload = {
  file: File;
  size: number;
  encoding: CsvEncoding;
  rows: string[];
};

const ChecklistForm = ({ initial }: { initial: Checklist | null }) => {
  const navigate = useNavigate();
  const invalidate = useInvalidateCoord();
  const flash = useCoordFlash((s) => s.show);
  const existing = initial?.plantilla ?? null;

  const [templateName, setTemplateName] = useState(initial?.templateName ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [detalle, setDetalle] = useState(initial?.detalle ?? "");
  const [upload, setUpload] = useState<Upload | null>(null);
  const [keepExisting, setKeepExisting] = useState(true);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<{
    templateName?: string;
    content?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const usingExisting =
    !upload &&
    keepExisting &&
    Boolean(existing?.readable) &&
    initial?.source === "archivo";
  const hasFile = Boolean(upload) || (keepExisting && Boolean(existing));
  const rows = useMemo(
    () =>
      upload
        ? upload.rows
        : usingExisting
          ? (initial?.activities ?? [])
          : detalleToRows(detalle),
    [upload, usingExisting, initial, detalle],
  );
  const summary = useMemo(() => summarizeChecklist(rows), [rows]);
  const lint = useMemo(() => lintChecklist(rows), [rows]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_TEMPLATE_BYTES) {
      setFileError("El archivo pesa más de 1 MB.");
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const read = readCsvTemplate(bytes);
    if (!read.ok) {
      setFileError(describeCsvError(read));
      return;
    }
    setFileError(null);
    setUpload({
      file,
      size: bytes.length,
      encoding: read.encoding,
      rows: read.rows,
    });
    setErrors((e) => ({ ...e, content: undefined }));
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    void onFile(event.dataTransfer.files[0]);
  };

  const mutation = useMutation({
    mutationFn: () =>
      saveChecklist(initial?.id ?? null, {
        templateName,
        description,
        code,
        detalle,
        file: upload?.file ?? null,
        removeTemplate: !upload && Boolean(existing) && !keepExisting,
      }),
    onSuccess: async (result) => {
      await invalidate();
      flash(
        "success",
        `${result.created ? "Checklist creado" : "Checklist guardado"}: ${templateName.trim()}.`,
      );
      navigate("/coordinador/checklists");
    },
    onError: (e) => setSubmitError(describeApiError(e, "Intenta de nuevo.")),
  });

  const save = () => {
    setSubmitError(null);
    const next: typeof errors = {};
    if (!templateName.trim())
      next.templateName = "Escribe el nombre del checklist.";
    if (summary.activityCount === 0) {
      next.content =
        "Agrega actividades en el Detalle o sube el archivo de la plantilla.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    mutation.mutate();
  };

  const download = async () => {
    if (!initial || !existing) return;
    try {
      await downloadChecklistTemplate(
        initial.id,
        existing.fileName ?? "plantilla.csv",
      );
    } catch (e) {
      setFileError(describeApiError(e, "No se pudo descargar la plantilla."));
    }
  };

  const fileName =
    upload?.file.name ?? existing?.fileName ?? "Archivo perdido en openMAINT";
  const fileSize = upload ? upload.size : (existing?.size ?? null);
  const fileEncoding = upload ? upload.encoding : (existing?.encoding ?? null);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-5">
          <Card
            title="Ficha del checklist"
            subtitle="Los mismos campos que CleaningActivity en openMAINT."
          >
            <div className="space-y-4">
              <Field
                label="Nombre de checklist"
                htmlFor="chk-nombre"
                required
                error={errors.templateName}
              >
                <input
                  id="chk-nombre"
                  className={inputClass(errors.templateName)}
                  value={templateName}
                  maxLength={120}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Código"
                  htmlFor="chk-codigo"
                  hint="Opcional. Ejemplo: CHK-STD."
                >
                  <input
                    id="chk-codigo"
                    className={inputClass(false, "font-mono")}
                    value={code}
                    maxLength={40}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </Field>
                <Field
                  label="Descripción"
                  htmlFor="chk-descripcion"
                  hint="Opcional."
                >
                  <input
                    id="chk-descripcion"
                    className={inputClass(false)}
                    value={description}
                    maxLength={200}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </Field>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-slate-700">
                  Plantilla (archivo CSV)
                </p>
                {hasFile ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <FileSpreadsheet
                      className="h-5 w-5 text-emerald-600"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-semibold text-slate-900">
                        {fileName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[
                          fileSize != null ? formatBytes(fileSize) : null,
                          fileEncoding ? ENCODING_LABELS[fileEncoding] : null,
                          upload || usingExisting
                            ? `separador «${lint.delimiter}» · ${rows.length} filas`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {!upload && existing?.fileName ? (
                      <Button
                        size="sm"
                        icon={Download}
                        onClick={() => void download()}
                      >
                        Descargar
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => {
                        if (upload) setUpload(null);
                        else setKeepExisting(false);
                      }}
                    >
                      Quitar
                    </Button>
                  </div>
                ) : null}
                {existing && keepExisting && !existing.readable ? (
                  <InlineAlert tone="warning">
                    El archivo guardado no se pudo leer
                    {existing.error ? ` (${existing.error})` : ""}: el equipo ve
                    el Detalle. Sube uno nuevo para corregirlo.
                  </InlineAlert>
                ) : null}
                <label
                  htmlFor="chk-archivo"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={cx(
                    "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition",
                    dragging
                      ? "border-brand bg-brand/5"
                      : "border-slate-300 bg-white hover:border-brand",
                  )}
                >
                  <Upload
                    className="h-5 w-5 text-slate-400"
                    aria-hidden="true"
                  />
                  <span className="font-semibold text-slate-700">
                    {hasFile
                      ? "Reemplazar archivo"
                      : "Arrastra aquí el archivo CSV o haz clic para elegirlo"}
                  </span>
                  <span className="text-xs text-slate-500">
                    Columnas Titulo, Actividad, Minutos · separador coma o punto
                    y coma · máximo 1 MB
                  </span>
                  <input
                    id="chk-archivo"
                    type="file"
                    accept=".csv,.txt,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      void onFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {fileError ? (
                  <InlineAlert tone="error">{fileError}</InlineAlert>
                ) : null}
              </div>

              <Field
                label="Detalle (solo si no hay un CSV cargado)"
                htmlFor="chk-detalle"
                error={errors.content}
                hint={
                  hasFile
                    ? "Hay archivo: el equipo verá el archivo y este texto se ignora."
                    : "Una actividad por línea: Titulo,Actividad,Minutos."
                }
              >
                <textarea
                  id="chk-detalle"
                  rows={8}
                  className={inputClass(
                    errors.content,
                    cx(
                      "font-mono text-xs leading-relaxed",
                      hasFile && "opacity-60",
                    ),
                  )}
                  value={detalle}
                  placeholder={
                    "Titulo,Actividad,Minutos\nDormitorio,Tender la cama con juego limpio,8"
                  }
                  onChange={(e) => setDetalle(e.target.value)}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <div className="space-y-4 lg:sticky lg:top-20">
            <Card
              title="Así lo verá el equipo de limpieza"
              subtitle={
                <>
                  <ChecklistSummaryLine rows={rows} /> ·{" "}
                  {upload || usingExisting
                    ? "desde el archivo"
                    : "desde el Detalle"}
                </>
              }
            >
              <div className="space-y-3">
                {lint.warnings.map((w, i) => (
                  <InlineAlert
                    key={i}
                    tone={
                      w.level === "error"
                        ? "error"
                        : w.level === "warn"
                          ? "warning"
                          : "info"
                    }
                  >
                    {w.row ? `Fila ${w.row}: ` : ""}
                    {w.text}
                  </InlineAlert>
                ))}
                <div className="max-h-[60vh] overflow-y-auto pr-1">
                  <ChecklistPreview rows={rows} />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {submitError ? (
        <InlineAlert tone="error" title="No se pudo guardar.">
          {submitError}
        </InlineAlert>
      ) : null}

      <div className="sticky bottom-4 z-10 mr-20 flex flex-wrap items-center justify-end gap-3 rounded-2xl bg-white px-5 py-3 shadow-lg ring-1 ring-slate-200">
        <Button
          onClick={() => navigate("/coordinador/checklists")}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
        <Button
          variant="primary"
          icon={Save}
          loading={mutation.isPending}
          disabled={mutation.isPending}
          onClick={save}
        >
          {mutation.isPending ? "Guardando…" : "Guardar checklist"}
        </Button>
      </div>
    </>
  );
};

export const ChecklistEditorPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = id === undefined || id === "nuevo";
  const numericId = Number(id);

  const detailQ = useQuery({
    queryKey: [...COORD_KEY, "checklist", numericId],
    queryFn: () => fetchChecklist(numericId),
    enabled: !isNew && Number.isInteger(numericId),
  });

  const back = (
    <Button
      variant="ghost"
      size="sm"
      icon={ChevronLeft}
      onClick={() => navigate("/coordinador/checklists")}
    >
      Checklists
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {back}
        <PageHeader
          title={
            isNew
              ? "Nuevo checklist"
              : (detailQ.data?.templateName ?? "Checklist")
          }
          subtitle={
            isNew
              ? "Sube el CSV que ya usan los supervisores o escribe el Detalle."
              : "Los cambios se ven en todas las limpiezas que usan este checklist."
          }
        />
      </div>

      {isNew ? (
        <ChecklistForm initial={null} />
      ) : detailQ.isError ? (
        <Card bodyClass="">
          <ErrorState
            message={describeApiError(detailQ.error, "Intenta de nuevo.")}
            onRetry={() => void detailQ.refetch()}
          />
        </Card>
      ) : !detailQ.data ? (
        <Card bodyClass="">
          <Skeleton rows={6} />
        </Card>
      ) : (
        <ChecklistForm key={detailQ.data.id} initial={detailQ.data} />
      )}
    </div>
  );
};
