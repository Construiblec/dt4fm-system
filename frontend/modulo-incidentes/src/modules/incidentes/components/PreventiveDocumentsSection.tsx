import { FileText } from "lucide-react";

/**
 * Documentación del equipo intervenido (manuales, fichas técnicas), no los
 * informes que genera el propio mantenimiento. Se muestra vacía mientras no
 * esté definido dónde vive esa documentación en OpenMAINT.
 */
export const PreventiveDocumentsSection = () => (
  <section className="rounded-3xl bg-white p-5 shadow-sm">
    <div className="flex items-center gap-2">
      <FileText className="h-5 w-5 text-slate-500" />
      <h2 className="text-base font-semibold text-slate-900">
        Documentos del equipo
      </h2>
    </div>

    <p className="mt-1 text-sm text-slate-500">
      Manuales y fichas técnicas del equipo intervenido.
    </p>

    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-600">
        Todavía no hay documentos disponibles
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Aquí aparecerán los manuales y fichas técnicas del equipo.
      </p>
    </div>
  </section>
);
