import { useCallback, useState } from "react";
import {
  createChecklistTemplate,
  fetchChecklistTemplates,
} from "@/modules/coordinador/services/coordinadorService";
import type {
  ChecklistTemplate,
  CreateChecklistTemplatePayload,
} from "@/modules/coordinador/types/Coordinador";

export const useChecklists = () => {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTemplates(await fetchChecklistTemplates());
    } catch {
      setError("No se pudieron cargar los checklists");
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(
    async (payload: CreateChecklistTemplatePayload) => {
      try {
        setCreating(true);
        await createChecklistTemplate(payload);
        await load();
        return true;
      } catch {
        setError("No se pudo crear la plantilla de checklist");
        return false;
      } finally {
        setCreating(false);
      }
    },
    [load],
  );

  return { templates, loading, error, creating, load, create };
};
