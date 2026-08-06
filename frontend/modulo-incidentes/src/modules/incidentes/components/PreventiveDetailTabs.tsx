export type PreventiveDetailTab = "checklist" | "documents";

type Props = {
  value: PreventiveDetailTab;
  onChange: (tab: PreventiveDetailTab) => void;
};

const TABS: { id: PreventiveDetailTab; label: string }[] = [
  { id: "checklist", label: "Lista de operación" },
  { id: "documents", label: "Informes y documentos" },
];

export const PreventiveDetailTabs = ({ value, onChange }: Props) => (
  <div
    role="tablist"
    aria-label="Secciones del mantenimiento"
    className="flex gap-1 rounded-full bg-white p-1 shadow-sm"
  >
    {TABS.map((tab) => {
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
