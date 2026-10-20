import { useEffect, useRef, useState } from "react";
import {
  getCorrectiveAttachments,
  getCorrectiveEquipmentDocuments,
  getCorrectiveEquipmentHistory,
} from "@/modules/incidentes/services/correctiveDocumentationService";
import type {
  CorrectiveEquipment,
  EquipmentHistoryEntry,
  MaintenanceAttachment,
} from "@/modules/incidentes/types/CorrectiveDocumentation";

type Section<T> = { data: T; loading: boolean; error: string | null };

const initial = <T>(data: T): Section<T> => ({
  data,
  loading: true,
  error: null,
});

/**
 * Adjuntos, documentos del equipo e historial de un correctivo. Se piden una
 * sola vez, cuando la pestaña de documentación se abre por primera vez.
 */
export const useCorrectiveDocumentation = (id: string, enabled: boolean) => {
  const [attachments, setAttachments] = useState(
    initial<MaintenanceAttachment[]>([]),
  );
  const [documents, setDocuments] = useState(
    initial<{
      documents: MaintenanceAttachment[];
      equipment: CorrectiveEquipment | null;
    }>({ documents: [], equipment: null }),
  );
  const [history, setHistory] = useState(initial<EquipmentHistoryEntry[]>([]));
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !id || loadedFor.current === id) return;
    loadedFor.current = id;

    // Sin guarda de desmontaje: en StrictMode cortaría la única carga.
    const settle = <T>(
      promise: Promise<T>,
      set: (section: Section<T>) => void,
      fallback: T,
      message: string,
    ) =>
      promise
        .then((data) => set({ data, loading: false, error: null }))
        .catch(() => set({ data: fallback, loading: false, error: message }));

    void settle(
      getCorrectiveAttachments(id),
      setAttachments,
      [],
      "No se pudieron cargar los archivos del correctivo",
    );
    void settle(
      getCorrectiveEquipmentDocuments(id),
      setDocuments,
      { documents: [], equipment: null },
      "No se pudieron cargar los documentos del equipo",
    );
    void settle(
      getCorrectiveEquipmentHistory(id),
      setHistory,
      [],
      "No se pudo cargar el historial del equipo",
    );
  }, [enabled, id]);

  return {
    attachments,
    documents,
    history,
    replaceAttachments: (data: MaintenanceAttachment[]) =>
      setAttachments({ data, loading: false, error: null }),
  };
};
