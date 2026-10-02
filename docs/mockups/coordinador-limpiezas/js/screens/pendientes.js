/*
 * Pendientes por asignar: lo que dejó la sincronización (o una limpieza manual
 * sin empleado) y todavía no tiene empleado u horario.
 */
(() => {
  "use strict";

  const Coord = window.Coord;
  const { html, useState, useMemo } = window.htmPreact;
  const D = Coord.domain;
  const U = Coord.ui;
  const api = Coord.api;
  const cx = U.cx;

  const fold = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  const matchesSearch = (task, q) => {
    if (!q) return true;
    const haystack = fold(
      [task.taskNumber, task.description, task.unit && task.unit.description, task.unit && task.unit.building, task.unit && task.unit.code, task.listingName, task.hostawayReservation, task.hostawayListingId].join(" ")
    );
    return fold(q)
      .split(/\s+/)
      .filter(Boolean)
      .every((word) => haystack.indexOf(word) !== -1);
  };

  const RANGES = [
    { value: "todas", label: "Todas" },
    { value: "hasta-hoy", label: "Hasta hoy" },
    { value: "manana", label: "Mañana" },
    { value: "semana", label: "Próximos 7 días" },
  ];

  const inRange = (task, range, today) => {
    const date = D.taskDate(task);
    if (range === "hasta-hoy") return date <= today;
    if (range === "manana") return date === D.addDays(today, 1);
    if (range === "semana") return date >= today && date <= D.addDays(today, 7);
    return true;
  };

  function Missing({ task }) {
    return html`<span class="flex flex-wrap gap-1.5">
      ${!task.employee ? html`<${U.Chip} tone="amber">Empleado</${U.Chip}>` : null}
      ${!task.plannedStartTime ? html`<${U.Chip} tone="amber">Horario</${U.Chip}>` : null}
    </span>`;
  }

  function PendientesScreen() {
    const today = Coord.clock.today;
    const tasksQ = U.useApi(() => api.getAllTasks(), []);
    const [q, setQ] = useState("");
    const [range, setRange] = useState("todas");
    const [sort, onSort] = U.useSort({ key: "creada", dir: "desc" });

    const pending = useMemo(() => (tasksQ.data ? tasksQ.data.data.filter(D.isPending) : []), [tasksQ.data]);
    const counts = {};
    RANGES.forEach((r) => {
      counts[r.value] = pending.filter((t) => inRange(t, r.value, today)).length;
    });

    const visible = pending
      .filter((t) => inRange(t, range, today) && matchesSearch(t, q))
      .sort(
        U.compareBy(sort, {
          creada: (t) => t.id,
          checkout: (t) => D.taskDate(t),
          limpieza: (t) => t.taskNumber,
        })
      );

    return html`<div class="space-y-6">
      <${U.PageHeader}
        title=${html`Pendientes por asignar ${tasksQ.data ? html`<span class="ml-1 align-middle text-lg font-semibold text-slate-400 tabular-nums">${pending.length}</span>` : null}`}
        subtitle="Limpiezas sin empleado o sin horario. Las recién creadas aparecen primero."
        actions=${html`<${U.Button} icon="Plus" onClick=${() => U.navigate("nueva")}>Nueva limpieza</${U.Button}>
`}
      />

      <${U.Ann} tag="supuesto" note="Pendiente = fase Asignada, sin empezar, sin pausa, y sin empleado o sin horario. La unidad no cuenta: la limpieza puede no tener unidad.">
        <div class="flex flex-wrap items-center gap-3">
          <label class="relative block w-full max-w-sm" for="buscar-pendientes">
            <span class="sr-only">Buscar</span>
            <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400"><${U.Icon} name="Search" /></span>
            <input
              id="buscar-pendientes"
              type="search"
              class=${U.inputClass(false, "pl-9")}
              placeholder="Buscar por número, unidad, listing o reserva"
              value=${q}
              onInput=${(e) => setQ(e.target.value)}
            />
          </label>
          <${U.Segmented}
            label="Filtrar por fecha de checkout"
            value=${range}
            onChange=${setRange}
            options=${RANGES.map((r) => ({ value: r.value, label: r.label, count: tasksQ.data ? counts[r.value] : null }))}
          />
        </div>
      </${U.Ann}>

      <${U.Card}
        bodyClass=""
        annotation=${{ tag: "ajuste", note: "GET /cleaning-tasks/all existe, pero solo para supervisión y con 50 por página. El filtro de pendientes se hace en la pantalla; convendría un filtro en el servidor." }}
      >
        ${tasksQ.error && !tasksQ.data
          ? html`<${U.ErrorState} error=${tasksQ.error} onRetry=${tasksQ.reload} title="No se pudieron cargar las limpiezas pendientes." />`
          : !tasksQ.data
            ? html`<${U.Skeleton} rows=${7} />`
            : pending.length === 0
              ? html`<${U.EmptyState}
                  icon="CircleCheck"
                  title="No hay limpiezas pendientes por asignar."
                  action=${html`<${U.Button} icon="RefreshCw" onClick=${() => U.navigate("sincronizacion")}>Ir a sincronización</${U.Button}>`}
                >
                  Aparecen aquí las que crea la sincronización y las manuales sin empleado.
                </${U.EmptyState}>`
              : visible.length === 0
                ? html`<${U.EmptyState} icon="Search" title="Ninguna limpieza coincide con la búsqueda." />`
                : html`<div class="relative overflow-x-auto">
                    <table class="min-w-full text-sm">
                      <thead class="bg-slate-50">
                        <tr>
                          <${U.SortHeader} label="Creada" sortKey="creada" sort=${sort} onSort=${onSort} />
                          <${U.SortHeader} label="Checkout" sortKey="checkout" sort=${sort} onSort=${onSort} />
                          <${U.SortHeader} label="Limpieza" sortKey="limpieza" sort=${sort} onSort=${onSort} />
                          <th scope="col" class=${U.TH}>Unidad</th>
                          <th scope="col" class=${U.TH}>Falta</th>
                          <th scope="col" class=${U.TH}><span class="sr-only">Acción</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        ${visible.map((t) => {
                          const date = D.taskDate(t);
                          return html`<tr key=${t.id} class="border-t border-slate-100 hover:bg-slate-50">
                            <td class=${cx(U.TD, "whitespace-nowrap")}>
                              <p class="text-slate-900">${D.relativeDay(t.generatedDate, today)}</p>
                              <p class="text-xs tabular-nums text-slate-500">${D.formatDate(t.generatedDate)}</p>
                            </td>
                            <td class=${cx(U.TD, "whitespace-nowrap")}>
                              <p class="text-slate-900">${D.relativeDay(date, today)}${t.checkoutDate ? "" : " (planificada)"}</p>
                              ${date < today ? html`<${U.Chip} tone="red">Checkout pasado</${U.Chip}>` : html`<p class="text-xs tabular-nums text-slate-500">${D.formatDate(date)}</p>`}
                            </td>
                            <td class=${U.TD}>
                              <button type="button" class=${cx("font-mono font-semibold text-slate-900 hover:text-brand hover:underline", U.FOCUS)} onClick=${() => U.openTask(t.id)}>
                                ${t.taskNumber}
                              </button>
                              <p class="max-w-xs truncate text-slate-600" title=${t.description}>${t.description}</p>
                              <div class="mt-1"><${U.SourceBadge} source=${t.source} /></div>
                            </td>
                            <td class=${U.TD}>
                              ${t.unit
                                ? html`<p class="text-slate-900">${U.unitLabel(t.unit)}</p><p class="text-xs text-slate-500">${t.unit.code}</p>`
                                : html`<p class="text-slate-500">Sin unidad</p>${t.hostawayListingId ? html`<p class="font-mono text-xs text-slate-400">listing ${t.hostawayListingId}</p>` : null}`}
                            </td>
                            <td class=${U.TD}><${Missing} task=${t} /></td>
                            <td class=${cx(U.TD, "text-right")}>
                              <${U.Button} size="sm" variant="primary" onClick=${() => U.openTask(t.id, "editar")}>Completar</${U.Button}>
                            </td>
                          </tr>`;
                        })}
                      </tbody>
                    </table>
                  </div>`}
      </${U.Card}>

    </div>`;
  }

  Coord.screens = Coord.screens || {};
  Coord.screens.pendientes = {
    title: "Pendientes por asignar",
    calls: ["getAllTasks", "updateTask"],
    Component: PendientesScreen,
  };
})();
