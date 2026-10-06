import { useEffect, useState } from "react";
import { ListChecks, Plus } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { AppHeader } from "@/shared/components/AppHeader";
import { useChecklists } from "@/modules/coordinador/hooks/useChecklists";
import { ChecklistTemplateFormModal } from "@/modules/coordinador/components/ChecklistTemplateFormModal";

export const CoordinadorChecklistsPage = () => {
  const { templates, loading, error, creating, load, create } = useChecklists();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen flex flex-col bg-gray-100">
        <AppHeader />

        <section className="flex-1 px-4 pb-20">
          <div className="mx-auto w-full max-w-sm space-y-5">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-slate-900">Checklists</h1>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                aria-label="Nueva plantilla"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            {loading ? (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                Cargando checklists...
              </div>
            ) : null}

            {!loading && error ? (
              <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 shadow-sm">
                {error}
              </div>
            ) : null}

            {!loading && !error && templates.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-8 text-center shadow-sm">
                <ListChecks className="h-10 w-10 text-slate-300" />
                <p className="text-sm text-slate-400">
                  Todavía no hay plantillas de checklist
                </p>
              </div>
            ) : null}

            {!loading && !error && templates.length > 0 ? (
              <div className="space-y-3">
                {templates.map((template) => (
                  <div key={template.id} className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-sm font-bold text-slate-900">
                      {template.templateName}
                      {template.code ? ` (${template.code})` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {template.activities.length} pasos
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <ChecklistTemplateFormModal
        open={modalOpen}
        submitting={creating}
        onClose={() => setModalOpen(false)}
        onSubmit={(payload) => {
          void create(payload).then((ok) => {
            if (ok) setModalOpen(false);
          });
        }}
      />
    </AppLayout>
  );
};
