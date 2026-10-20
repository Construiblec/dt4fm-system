type Tab<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
};

/** Pestañas en píldora; la activa en negro. */
export const DetailTabs = <T extends string>({
  tabs,
  value,
  onChange,
  label,
}: Props<T>) => (
  <div
    role="tablist"
    aria-label={label}
    className="flex gap-1 rounded-full bg-white p-1 shadow-sm"
  >
    {tabs.map((tab) => {
      const isActive = tab.value === value;

      return (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(tab.value)}
          className={`min-h-11 flex-1 rounded-full px-3 text-sm transition focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20 ${
            isActive
              ? "bg-slate-900 font-bold text-white shadow-sm"
              : "font-medium text-slate-600 hover:bg-slate-50"
          }`}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);
