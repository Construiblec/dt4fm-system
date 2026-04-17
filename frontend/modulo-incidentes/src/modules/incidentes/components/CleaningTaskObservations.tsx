import { useEffect, useState } from "react";
import { observationsSchema } from "@/modules/incidentes/schemas/cleaningTaskExecutionSchema";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";

const MAX_CHARACTERS = 1000;

export const CleaningTaskObservations = () => {
  const savedObservations = useCleaningTaskExecutionStore((state) => state.observations);
  const setObservations = useCleaningTaskExecutionStore((state) => state.setObservations);
  const [value, setValue] = useState(savedObservations);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(savedObservations);
  }, [savedObservations]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const parsed = observationsSchema.safeParse(value);

      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Las observaciones no son validas");
        return;
      }

      setError(null);
      setObservations(parsed.data);
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [setObservations, value]);

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Observaciones</h2>
          <p className="mt-1 text-sm text-slate-500">Campo opcional para notas de cierre</p>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {value.length}/{MAX_CHARACTERS}
        </span>
      </div>

      <textarea
        value={value}
        rows={5}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Agrega comentarios relevantes sobre la limpieza realizada"
        className="mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
      />

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
};
