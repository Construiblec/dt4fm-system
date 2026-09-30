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

  const runWho = (run) => (run.user ? run.user : "Página de openMAINT (sin usuario)");
  const runRange = (run) =>
    run.dateFrom === run.dateTo
      ? "Checkouts del " + D.formatDate(run.dateFrom)
      : "Checkouts del " + D.formatDate(run.dateFrom) + " al " + D.formatDate(run.dateTo);

  function PanelScreen() {
    const today = Coord.clock.today;
    const tasksQ = U.useApi(() => api.getAllTasks(), []);
    const weekQ = U.useApi(() => api.getCheckouts({ dateFrom: today, dateTo: D.addDays(today, 7) }), []);
    const runsQ = U.useApi(() => api.getSyncRuns(), []);

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

    const overlaps = D.findOverlaps(plannedToday);
    const overlapByEmployee = new Map();
    plannedToday.forEach((t) => {
      if (overlaps.has(t.id)) {
        const key = t.employee.id;
        overlapByEmployee.set(key, (overlapByEmployee.get(key) || []).concat(t));
      }
    });

    const rows = weekQ.data ? weekQ.data.rows : [];
    const todayRows = rows
      .filter((r) => (r.hostawayCheckoutDate || r.checkoutDate) === today)
      .sort((a, b) => String(a.checkoutTime).localeCompare(String(b.checkoutTime)));
    const notCreated = rows.filter((r) => r.status === "por-crear");
    const changed = rows.filter((r) => r.status === "cambio");
    const orphans = rows.filter((r) => r.status === "huerfana");
    const runs = runsQ.data ? runsQ.data.data : [];
    const lastRun = runs[0] || null;

    const attention = [];
    if (pendingSoon.length) {
      attention.push({
        key: "pendientes",
        icon: "Inbox",
        tone: "text-amber-600",
        text: html`<strong>${pendingSoon.length} ${pendingSoon.length === 1 ? "limpieza" : "limpiezas"}</strong> con checkout hasta mañana ${pendingSoon.length === 1 ? "sigue" : "siguen"} sin empleado u horario.`,
        action: html`<${U.Button} size="sm" variant="primary" onClick=${() => U.navigate("pendientes")}>Asignar</${U.Button}>`,
      });
    }
    if (weekQ.error) {
      attention.push({
        key: "hostaway",
        icon: "CircleAlert",
        tone: "text-red-600",
        text: html`Hostaway no responde: no se pueden revisar los checkouts ni sincronizar. Las limpiezas ya creadas siguen disponibles.`,
        action: html`<${U.Button} size="sm" icon="RotateCcw" onClick=${weekQ.reload}>Reintentar</${U.Button}>`,
      });
    }
    if (notCreated.length) {
      attention.push({
        key: "por-crear",
        icon: "RefreshCw",
        tone: "text-blue-600",
        annotation: "Necesita el estado por fila de los checkouts (propuesta).",
        text: html`<strong>${notCreated.length} ${notCreated.length === 1 ? "checkout" : "checkouts"}</strong> de Hostaway de aquí a 7 días todavía no ${notCreated.length === 1 ? "tiene" : "tienen"} limpieza.`,
        action: html`<${U.Button} size="sm" onClick=${() => U.navigate("sincronizacion")}>Sincronizar</${U.Button}>`,
      });
    }
    changed.forEach((r) =>
      attention.push({
        key: "cambio-" + r.reservationId,
        icon: "CalendarClock",
        tone: "text-amber-600",
        annotation: "Necesita el estado por fila de los checkouts (propuesta) y poder escribir CheckoutDate por PUT (propuesta).",
        text: html`La reserva <span class="font-mono">${r.reservationId}</span> ahora sale el <strong>${D.formatDayShort(r.hostawayCheckoutDate)}</strong>, pero ${r.task.taskNumber} dice ${D.formatDayShort(r.task.checkoutDate)}.`,
        action: html`<${U.Button} size="sm" onClick=${() => U.openTask(r.task.id, "editar")}>Corregir</${U.Button}>`,
      })
    );
    orphans.forEach((r) =>
      attention.push({
        key: "huerfana-" + r.reservationId,
        icon: "Link2Off",
        tone: "text-red-600",
        annotation: "Necesita el estado por fila de los checkouts (propuesta).",
        text: html`${r.task.taskNumber} es de una reserva que ya no está en Hostaway. Probablemente se canceló.`,
        action: html`<${U.Button} size="sm" onClick=${() => U.openTask(r.task.id)}>Revisar</${U.Button}>`,
      })
    );
    overlapByEmployee.forEach((list) =>
      attention.push({
        key: "superposicion-" + list[0].employee.id,
        icon: "TriangleAlert",
        tone: "text-amber-600",
        text: html`${U.employeeName(list[0].employee)} tiene ${list.length} limpiezas que se superponen hoy (${list.map((t) => t.taskNumber).join(" y ")}).`,
        action: html`<${U.Button} size="sm" onClick=${() => U.navigate("agenda")}>Ver agenda</${U.Button}>`,
      })
    );
    if (lastRun && (lastRun.failed > 0 || lastRun.status === "error")) {
      attention.push({
        key: "sync-errores",
        icon: "CircleAlert",
        tone: "text-red-600",
        annotation: "Necesita el historial de sincronizaciones (propuesta).",
        text:
          "La última sincronización (" +
          D.relativeDay(D.ymdOf(lastRun.startedAt), today) +
          ", " +
          D.formatTime(lastRun.startedAt) +
          ") terminó " +
          (lastRun.status === "error" ? "sin conectar con Hostaway" : "con " + lastRun.failed + (lastRun.failed === 1 ? " error" : " errores")) +
          ".",
        action: html`<${U.Button} size="sm" onClick=${() => U.navigate("sincronizacion")}>Ver</${U.Button}>`,
      });
    }

    const syncToday = () => {
      U.store.set({ intent: "sync-today" });
      U.navigate("sincronizacion");
    };

    const loadingAll = !tasksQ.data && tasksQ.loading;

    return html`<div class="space-y-6">
      <${U.PageHeader}
        title="Panel del día"
        subtitle=${D.formatLongDate(today).replace(/^./, (c) => c.toUpperCase()) + " · " + Coord.clock.nowHm + " (hora simulada)"}
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

      <div class="grid gap-6 xl:grid-cols-3">
        <div class="min-w-0 xl:col-span-2">
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
                            <th scope="col" class=${U.TH}>Hora</th>
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
                              <td class=${cx(U.TD, "font-semibold tabular-nums text-slate-900")}>${r.checkoutTime || "—"}</td>
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

        <div class="min-w-0 space-y-6">
          <${U.Card} title="Atención" bodyClass="">
            ${!tasksQ.data || (!weekQ.data && !weekQ.error)
              ? html`<${U.Skeleton} rows=${3} />`
              : attention.length === 0
                ? html`<div class="px-5 py-4">
                    <${U.InlineAlert} tone="success">Todo en orden: no hay nada pendiente para hoy.</${U.InlineAlert}>
                  </div>`
                : html`<div role="list" class="divide-y divide-slate-100">
                    ${attention.map((item) => {
                      const row = html`<div role="listitem" class="flex items-start gap-3 px-5 py-3">
                        <${U.Icon} name=${item.icon} class=${cx("mt-0.5 h-4 w-4 shrink-0", item.tone)} />
                        <p class="min-w-0 flex-1 text-sm text-slate-700">${item.text}</p>
                        <div class="shrink-0">${item.action}</div>
                      </div>`;
                      return item.annotation
                        ? html`<${U.Ann} key=${item.key} tag="propuesta" note=${item.annotation}>${row}</${U.Ann}>`
                        : html`<div key=${item.key}>${row}</div>`;
                    })}
                  </div>`}
          </${U.Card}>

          <${U.Card}
            title="Última sincronización"
            annotation=${{ tag: "propuesta", note: "Hoy no se guarda el historial: la página de openMAINT solo muestra el resultado en pantalla. Haría falta GET /cleaning-tasks/sync/runs." }}
            actions=${html`<${U.Button} size="sm" variant="ghost" iconRight="ChevronRight" onClick=${() => U.navigate("sincronizacion")}>Historial</${U.Button}>`}
          >
            ${!runsQ.data
              ? html`<div class="h-20 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none"></div>`
              : !lastRun
                ? html`<p class="text-sm text-slate-500">Todavía no hay sincronizaciones registradas.</p>`
                : html`<div class="space-y-3">
                    <div>
                      <p class="text-sm font-semibold text-slate-900">
                        ${D.relativeDay(D.ymdOf(lastRun.startedAt), today).replace(/^./, (c) => c.toUpperCase())}, ${D.formatTime(lastRun.startedAt)}
                      </p>
                      <p class="text-xs text-slate-500">${runWho(lastRun)} · ${runRange(lastRun)}</p>
                    </div>
                    <dl class="grid grid-cols-4 gap-2 text-center">
                      ${[
                        ["Procesados", lastRun.total, "text-slate-900"],
                        ["Creadas", lastRun.created, "text-emerald-700"],
                        ["Duplicadas", lastRun.skipped, "text-slate-700"],
                        ["Errores", lastRun.failed, lastRun.failed ? "text-red-700" : "text-slate-700"],
                      ].map(
                        ([label, value, tone]) => html`<div key=${label} class="rounded-xl bg-slate-50 px-1 py-2">
                          <dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">${label}</dt>
                          <dd class=${cx("text-lg font-bold tabular-nums", tone)}>${value}</dd>
                        </div>`
                      )}
                    </dl>
                  </div>`}
          </${U.Card}>
        </div>
      </div>
    </div>`;
  }

  Coord.screens = Coord.screens || {};
  Coord.screens.panel = {
    title: "Panel del día",
    calls: ["getAllTasks", "getCheckouts", "getSyncRuns"],
    Component: PanelScreen,
  };
})();
