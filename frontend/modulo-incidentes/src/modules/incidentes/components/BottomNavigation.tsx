export const BottomNavigation = () => {
  return (
    <nav className="fixed bottom-0 left-0 z-40 flex w-full justify-center">
      <div className="w-full max-w-md border-t border-slate-200 bg-white">
        <div className="mx-auto flex items-center justify-around px-4 py-3">
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Mis tareas
        </button>
        <button
          type="button"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500"
        >
          Ubicaciones
        </button>
        </div>
      </div>
    </nav>
  );
};
