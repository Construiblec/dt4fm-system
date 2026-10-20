import { useState } from "react";
import { BookOpen, Box, Info, Paperclip } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AttachmentListSection } from "@/modules/incidentes/components/AttachmentListSection";
import { AttachmentRow } from "@/modules/incidentes/components/AttachmentRow";
import { AttachSheet } from "@/modules/incidentes/components/corrective/AttachSheet";
import { EquipmentHistorySection } from "@/modules/incidentes/components/corrective/EquipmentHistorySection";
import { useCorrectiveDocumentation } from "@/modules/incidentes/hooks/useCorrectiveDocumentation";
import {
  deleteCorrectiveAttachment,
  uploadCorrectiveAttachment,
} from "@/modules/incidentes/services/correctiveDocumentationService";
import type {
  EquipmentHistoryEntry,
  MaintenanceAttachment,
} from "@/modules/incidentes/types/CorrectiveDocumentation";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { UploadFab } from "@/shared/components/UploadFab";
import { equipmentLabel } from "@/shared/utils/equipmentLabel";
import { describeImageError, prepareImage } from "@/shared/utils/prepareImage";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Props = {
  id: string;
  /** Se monta oculta para no perder lo cargado al cambiar de pestaña */
  active: boolean;
  /** Con el correctivo cerrado ya no se sube ni se borra nada */
  canManage: boolean;
  /** Para que la evidencia del reporte refleje las fotos subidas o borradas */
  onAttachmentsChange?: () => void;
};

/** Pestaña «Documentación»: archivos del correctivo, del equipo e historial. */
export const CorrectiveDocumentationTab = ({
  id,
  active,
  canManage,
  onAttachmentsChange,
}: Props) => {
  const navigate = useNavigate();
  const { attachments, documents, history, replaceAttachments } =
    useCorrectiveDocumentation(id, active);
  const [showSheet, setShowSheet] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toDelete, setToDelete] = useState<MaintenanceAttachment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const equipment = documents.data.equipment;

  const handleSelect = async (file: File) => {
    setIsUploading(true);

    try {
      let ready = file;

      try {
        // Las fotos se copian a memoria al elegirlas (ver `prepareImage`)
        if (file.type.startsWith("image/")) ready = await prepareImage(file);
      } catch (imageError) {
        setError(describeImageError(imageError));
        return;
      }

      if (ready.size > MAX_FILE_BYTES) {
        setError("El archivo supera el límite de 10 MB.");
        return;
      }

      replaceAttachments(await uploadCorrectiveAttachment(id, ready));
      onAttachmentsChange?.();
      setShowSheet(false);
    } catch {
      setError("No se pudo subir el archivo. Inténtalo de nuevo.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);

    try {
      setDeletingId(target.id);
      replaceAttachments(await deleteCorrectiveAttachment(id, target.id));
      onAttachmentsChange?.();
    } catch {
      setError(`No se pudo eliminar «${target.fileName}».`);
    } finally {
      setDeletingId(null);
    }
  };

  const openHistory = (entry: EquipmentHistoryEntry) =>
    navigate(
      entry.kind === "preventive"
        ? `/preventive-maintenance/historial/${entry.id}`
        : `/corrective-maintenance/historial/${entry.id}`,
    );

  return (
    <div className={active ? "space-y-5" : "hidden"}>
      <AttachmentListSection
        icon={Paperclip}
        title="Documentos de este correctivo"
        subtitle="Fotos, cotizaciones e informes adjuntados a este trabajo. Toca uno para abrirlo."
        attachments={attachments.data}
        emptyMessage={
          canManage
            ? "Aún no hay archivos. Usa el botón + para subir el primero."
            : "Este correctivo no tiene archivos adjuntos."
        }
        loading={attachments.loading}
        error={attachments.error}
        onDelete={canManage ? setToDelete : undefined}
        canDelete={(attachment) => !attachment.isReport}
        deletingId={deletingId}
      />

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-slate-500" aria-hidden />
            <h2 className="text-base font-semibold text-slate-900">
              Documentos del equipo
            </h2>
          </div>
          {documents.data.documents.length > 0 ? (
            <span className="text-xs text-slate-600">
              {documents.data.documents.length} archivo
              {documents.data.documents.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {documents.loading ? (
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            Cargando documentos...
          </p>
        ) : documents.error ? (
          <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-5 text-center text-sm text-red-700">
            {documents.error}
          </p>
        ) : !equipment ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Info
              className="mt-0.5 h-5 w-5 shrink-0 text-slate-600"
              aria-hidden
            />
            <div>
              <p className="text-sm font-bold text-slate-900">
                Este correctivo no tiene un equipo asociado
              </p>
              <p className="text-sm text-slate-600">
                Cuando se le asigne un equipo verás aquí sus manuales y fichas
                técnicas.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Box className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-slate-900">
                  {equipmentLabel(equipment.code, equipment.description)}
                </p>
                {equipment.place ? (
                  <p className="text-sm text-slate-600">{equipment.place}</p>
                ) : null}
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-600">
              Manuales y fichas técnicas del equipo intervenido.
            </p>

            {documents.data.documents.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-600">
                Este equipo aún no tiene documentos.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {documents.data.documents.map((document) => (
                  <AttachmentRow key={document.id} attachment={document} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <EquipmentHistorySection
        entries={history.data}
        loading={history.loading}
        error={history.error}
        hasEquipment={Boolean(equipment) || documents.loading}
        onOpen={openHistory}
      />

      {active && canManage ? (
        <UploadFab onClick={() => setShowSheet(true)} />
      ) : null}

      <AttachSheet
        open={showSheet}
        isUploading={isUploading}
        onSelect={(file) => void handleSelect(file)}
        onClose={() => setShowSheet(false)}
      />

      <ConfirmModal
        open={toDelete !== null}
        title="Eliminar archivo"
        message={`¿Eliminar «${toDelete?.fileName ?? ""}» de este correctivo?`}
        onConfirm={() => void handleDelete()}
        onCancel={() => setToDelete(null)}
      />

      <ErrorModal
        open={error !== null}
        title="No se pudo completar la acción"
        message={error ?? ""}
        onClose={() => setError(null)}
      />
    </div>
  );
};
