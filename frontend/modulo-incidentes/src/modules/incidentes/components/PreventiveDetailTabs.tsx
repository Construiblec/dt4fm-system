export type PreventiveDetailTab = "checklist" | "documents";

type Props = {
  value: PreventiveDetailTab;
  onChange: (tab: PreventiveDetailTab) => void;
  /** Antes de iniciar, la primera pestaña es un vistazo y no la lista para rellenar */
  checklistLabel?: string;
};

export const PreventiveDetailTabs = ({
  value,
  onChange,
  checklistLabel = "Lista de operación",
}: Props) => {
  const tabs: { id: PreventiveDetailTab; label: string }[] = [
    { id: "checklist", label: checklistLabel },
    { id: "documents", label: "Informes y documentos" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Secciones del mantenimiento"
      className="flex gap-1 rounded-full bg-white p-1 shadow-sm"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === value;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex-1 rounded-full px-3 py-2.5 text-sm font-bold transition ${
              isActive
                ? "bg-brand text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
