/*
 * Panel del día: qué salió de Hostaway hoy, qué falta asignar y qué pide atención.
 */
(() => {
  "use strict";

  const Coord = window.Coord;
  const { html } = window.htmPreact;
  const D = Coord.domain;
  const U = Coord.ui;
  const api = Coord.api;
  const cx = U.cx;

  const TILE_TONE = {
    default: "text-slate-900",
    warn: "text-amber-700",
    bad: "text-red-700",
  };

  function Tile({ label, value, sub, tone, icon, onClick }) {
    return html`<button
      type="button"
      onClick=${onClick}
      class=${cx("flex w-full flex-col items-start gap-1 rounded-2xl bg-white p-4 text-left shadow-sm transition hover:shadow-md", U.FOCUS)}
    >
      <span class="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        ${label}<${U.Icon} name=${icon} class="h-4 w-4 text-slate-400" />
      </span>
      <span class=${cx("text-3xl font-bold tabular-nums", TILE_TONE[tone || "default"])}>${value}</span>
      <span class="text-xs text-slate-500">${sub}</span>
    </button>`;
  }

  function PanelScreen() {
    const today = Coord.clock.today;
    const tasksQ = U.useApi(() => api.getAllTasks(), []);
    const weekQ = U.useApi(() => api.getCheckouts({ dateFrom: today, dateTo: D.addDays(today, 7) }), []);

    const tasks = tasksQ.data ? tasksQ.data.data : [];
    const now = Coord.clock.nowMs;
    const pending = tasks.filter(D.isPending);
    const pendingSoon = pending.filter((t) => D.taskDate(t) <= D.addDays(today, 1));
    const plannedToday = tasks.filter((t) => t.phase !== "Cancelled" && t.plannedStartTime && D.ymdOf(t.plannedStartTime) === today);
    const notStartedToday = plannedToday.filter((t) => t.phase === "Assigned" && !t.actualStartTime && !t.isPaused);
    const inExecution = tasks.filter((t) => t.phase === "InExecution");
    const paused = tasks.filter((t) => t.isPaused);
    const overdue = tasks.filter((t) => D.isOverdue(t, now));
    const oldestOverdue = overdue.reduce((max, t) => Math.max(max, D.overdueMinutes(t, now)), 0);

    const rows = weekQ.data ? weekQ.data.rows : [];
    const todayRows = rows
      .filter((r) => (r.hostawayCheckoutDate || r.checkoutDate) === today)
      .sort((a, b) => a.listingName.localeCompare(b.listingName));
    const syncToday = () => {
      U.store.set({ intent: "sync-today" });
      U.navigate("sincronizacion");
    };

    const loadingAll = !tasksQ.data && tasksQ.loading;

    return html`<div class="space-y-6">
      <${U.PageHeader}
        title="Panel del día"
        subtitle=${D.formatLongDate(today).replace(/^./, (c) => c.toUpperCase())}
        actions=${html`<${U.Button} icon="RefreshCw" onClick=${syncToday}>Sincronizar hoy</${U.Button}>
          <${U.Button} variant="primary" icon="Plus" onClick=${() => U.navigate("nueva")}>Nueva limpieza</${U.Button}>`}
      />

      <${U.Ann} tag="ui" note="Los indicadores se calculan en la pantalla con el listado de limpiezas (GET /cleaning-tasks/all).">
        ${loadingAll
          ? html`<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
              ${[0, 1, 2, 3].map((i) => html`<div key=${i} class="h-28 animate-pulse rounded-2xl bg-white shadow-sm motion-reduce:animate-none"></div>`)}
            </div>`
          : html`<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <${Tile}
                label="Por asignar"
                icon="Inbox"
                value=${pending.length}
                tone=${pending.length ? "warn" : "default"}
                sub=${pendingSoon.length + " con checkout hasta mañana"}
                onClick=${() => U.navigate("pendientes")}
              />
              <${Tile}
                label="Programadas hoy"
                icon="CalendarDays"
                value=${plannedToday.length}
                sub=${notStartedToday.length + " sin empezar"}
                onClick=${() => U.navigate("agenda")}
              />
              <${Tile}
                label="En ejecución"
                icon="Play"
                value=${inExecution.length}
                sub=${paused.length ? "+" + paused.length + " en pausa" : "ninguna en pausa"}
                onClick=${() => U.navigate("agenda")}
              />
              <${Tile}
                label="Atrasadas"
                icon="Clock"
                value=${overdue.length}
                tone=${overdue.length ? "bad" : "default"}
                sub=${overdue.length ? "la más antigua: " + D.formatDuration(oldestOverdue) : "todo a tiempo"}
                onClick=${() => U.navigate("agenda")}
              />
            </div>`}
      </${U.Ann}>

      <div class="min-w-0">
          <${U.Card}
            title="Checkouts de hoy"
            subtitle=${weekQ.data ? todayRows.length + " reservas de Hostaway salen hoy" : "Reservas de Hostaway que salen hoy"}
            actions=${html`<${U.Button} size="sm" variant="ghost" iconRight="ChevronRight" onClick=${() => U.navigate("sincronizacion")}>Sincronización</${U.Button}>`}
            bodyClass=""
            annotation=${{
              tag: "existe",
              note: "GET /cleaning-tasks/checkouts ya existe. La columna Limpieza (si la reserva ya tiene tarjeta) es propuesta: hoy el endpoint no la cruza.",
            }}
          >
            ${weekQ.error && !weekQ.data
              ? html`<${U.ErrorState} error=${weekQ.error} onRetry=${weekQ.reload} title="No se pudo consultar Hostaway." />`
              : !weekQ.data
                ? html`<${U.Skeleton} rows=${5} />`
                : todayRows.length === 0
                  ? html`<${U.EmptyState} icon="CalendarCheck" title="Hoy no sale ninguna reserva.">No hay limpiezas de checkout para hoy.</${U.EmptyState}>`
                  : html`<div class="relative overflow-x-auto">
                      <table class="min-w-full text-sm">
                        <thead class="bg-slate-50">
                          <tr>
                            <th scope="col" class=${U.TH}>Listing</th>
                            <th scope="col" class=${U.TH}>Limpieza</th>
                            <th scope="col" class=${U.TH}>Estado</th>
                            <th scope="col" class=${U.TH}>Empleado</th>
                            <th scope="col" class=${U.TH}><span class="sr-only">Acción</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          ${todayRows.map(
                            (r) => html`<tr key=${r.reservationId} class="border-t border-slate-100">
                              <td class=${U.TD}>
                                <p class="whitespace-nowrap font-medium text-slate-900">${r.listingName}</p>
                                <p class="text-xs text-slate-500">
                                  ${r.task && r.task.unit ? r.task.unit.code : r.unitMatch === "ok" ? "" : r.unitMatch === "none" ? "Sin unidad en openMAINT" : "Listing en 2 unidades"}
                                </p>
                              </td>
                              <td class=${U.TD}>
                                ${r.task
                                  ? html`<button type="button" class=${cx("font-mono font-semibold text-brand hover:underline", U.FOCUS)} onClick=${() => U.openTask(r.task.id)}>
                                      ${r.task.taskNumber}
                                    </button>`
                                  : html`<${U.Chip} tone="blue">Sin crear</${U.Chip}>`}
                              </td>
                              <td class=${U.TD}>${r.task ? html`<${U.StatusBadges} task=${r.task} />` : html`<span class="text-slate-400">—</span>`}</td>
                              <td class=${cx(U.TD, "whitespace-nowrap text-slate-700")}>${r.task ? U.employeeName(r.task.employee) : html`<span class="text-slate-400">—</span>`}</td>
                              <td class=${cx(U.TD, "text-right")}>
                                ${!r.task
                                  ? html`<${U.Button} size="sm" onClick=${syncToday}>Sincronizar</${U.Button}>`
                                  : D.isPending(r.task)
                                    ? html`<${U.Button} size="sm" variant="primary" onClick=${() => U.openTask(r.task.id, "editar")}>Completar</${U.Button}>`
                                    : null}
                              </td>
                            </tr>`
                          )}
                        </tbody>
                      </table>
                    </div>`}
          </${U.Card}>
      </div>
    </div>`;
  }

  Coord.screens = Coord.screens || {};
  Coord.screens.panel = {
    title: "Panel del día",
    calls: ["getAllTasks", "getCheckouts"],
    Component: PanelScreen,
  };
})();
