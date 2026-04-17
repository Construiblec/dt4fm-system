import { useState, useEffect, useCallback } from "react";
import {
  fetchTaskDetail,
  fetchTaskAttachments,
} from "@/modules/supervisor/services/supervisorService";
import type {
  CleaningTaskDetail,
  TaskAttachment,
} from "@/modules/supervisor/types/SupervisorTask";

type UseTaskDetailReturn = {
  detail: CleaningTaskDetail | null;
  attachments: TaskAttachment[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export const useTaskDetail = (taskId: number): UseTaskDetailReturn => {
  const [detail, setDetail] = useState<CleaningTaskDetail | null>(null);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      setError(null);

      // Cargamos detalle y attachments en paralelo
      const [detailRes, attachmentsRes] = await Promise.all([
        fetchTaskDetail(taskId),
        fetchTaskAttachments(taskId),
      ]);

      setDetail(detailRes.data);
      setAttachments(attachmentsRes.data);
    } catch {
      setError("No se pudo cargar el detalle de la tarea");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { detail, attachments, loading, error, reload: load };
};
