import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "@/modules/supervisor-cav/services/cavApi";
import { listCameras } from "@/modules/supervisor-cav/services/camerasService";
import type { CamerasOverview } from "@/modules/supervisor-cav/types/Camera";

export const useCameras = () => {
  const [overview, setOverview] = useState<CamerasOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setOverview(await listCameras());
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar las cámaras"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { overview, loading, error, reload: load };
};
