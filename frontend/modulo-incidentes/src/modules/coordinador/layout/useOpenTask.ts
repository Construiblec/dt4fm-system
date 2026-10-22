import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export type TaskPanelMode = "ver" | "editar";

/**
 * La ficha de una limpieza se abre como panel lateral, y su estado vive en la
 * URL (`?limpieza=123&modo=editar`): se puede enlazar, el botón Atrás la cierra
 * y la pantalla de atrás no se pierde.
 */
export const useOpenTask = () => {
  const [params, setParams] = useSearchParams();

  const open = useCallback(
    (id: number, mode: TaskPanelMode = "ver") => {
      const next = new URLSearchParams(params);
      next.set("limpieza", String(id));
      if (mode === "editar") next.set("modo", "editar");
      else next.delete("modo");
      setParams(next);
    },
    [params, setParams],
  );

  const close = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("limpieza");
    next.delete("modo");
    setParams(next);
  }, [params, setParams]);

  const id = Number(params.get("limpieza"));

  return {
    open,
    close,
    openId: Number.isInteger(id) && id > 0 ? id : null,
    mode: (params.get("modo") === "editar" ? "editar" : "ver") as TaskPanelMode,
  };
};
