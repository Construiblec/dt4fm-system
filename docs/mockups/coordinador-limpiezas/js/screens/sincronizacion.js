/*
 * Sincronización con Hostaway. Reemplaza la página ExtJS de openMAINT
 * ("Sincronización de hoy" + "Seleccionar rango de fechas") y agrega lo que
 * esa página no hace: sincronizar un rango, ver qué ya tiene limpieza y el
 * historial.
 */
(() => {
  "use strict";

  const Coord = window.Coord;
  const { html, useState, useEffect } = window.htmPreact;
  const D = Coord.domain;
  const U = Coord.ui;
  const api = Coord.api;
  const cx = U.cx;

  const STATUS_CHIP = {
    "por-crear": { tone: "blue", label: "Por crear" },
    creada: { tone: "slate", label: "Ya creada" },
    cambio: { tone: "amber", label: "Checkout cambió" },
    huerfana: { tone: "red", label: "Ya no está en Hostaway" },
  };

  const rangeProblem = (from, to) => {
    if (!from || !to) return "Rango incompleto: selecciona la fecha de inicio y la de fin.";
    if (to < from) return "Rango inválido: la fecha de fin es anterior a la de inicio.";
    if (D.diffDays(from, to) + 1 > 92) return "Rango demasiado amplio: el máximo es de 92 días.";
    return null;
  };

  const resultMessage = (result, single) => {
    if (result.failed > 0) return { tone: "error", text: "Sincronización completada con errores." };
    if (result.total === 0) return { tone: "neutral", text: single ? "No hay checkouts para esta fecha." : "No hay checkouts en este rango." };
    if (result.created === 0) return { tone: "neutral", text: "Sin tareas nuevas: todas ya existían." };
    return { tone: "success", text: "Sincronización completada correctamente." };
  };

  function SyncResult({ state, single }) {
    if (state.error) {
      return html`<${U.InlineAlert} tone="error" title="No se pudo sincronizar.">${state.error.message}</${U.InlineAlert}>`;
    }
    if (!state.result) return null;
    const r = state.result;
    const message = resultMessage(r, single);
    return html`<div class="space-y-3">
      <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        ${[
          ["Procesados", r.total, "text-slate-900"],
          ["Creadas", r.created, r.created ? "text-emerald-700" : "text-slate-700"],
          ["Duplicadas", r.skipped, "text-slate-700"],
          ["Errores", r.failed, r.failed ? "text-red-700" : "text-slate-700"],
        ].map(
          ([label, value, tone]) => html`<div key=${label} class="rounded-xl bg-slate-50 px-3 py-2">
            <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">${label}</dt>
            <dd class=${cx("text-2xl font-bold tabular-nums", tone)}>${value}</dd>
          </div>`
        )}
      </dl>
      <${U.InlineAlert}
        tone=${message.tone}
        action=${r.created > 0
          ? html`<${U.Button} size="sm" variant="primary" onClick=${() => U.navigate("pendientes")}>
              ${r.created === 1 ? "Asignar la nueva" : "Asignar las " + r.created + " nuevas"}
            </${U.Button}>`
          : null}
      >
        ${message.text}<span class="ml-2 text-xs opacity-75">${D.formatDate(Coord.clock.today)} ${Coord.clock.nowHm}</span>
      </${U.InlineAlert}>
      ${r.errors && r.errors.length
        ? html`<${U.Ann} tag="propuesta" note="Hoy la respuesta de la sincronización trae solo los contadores: no dice qué reservas fallaron.">
            <ul class="space-y-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm">
              ${r.errors.map(
                (e) => html`<li key=${e.reservationId} class="flex flex-wrap gap-x-2 text-slate-700">
                  <span class="font-mono text-slate-900">${e.reservationId}</span><span>·</span><span>${e.listingName}</span><span class="text-red-700">${e.message}</span>
                </li>`
              )}
            </ul>
          </${U.Ann}>`
        : null}
    </div>`;
  }

  function ConfirmModal({ kind, from, to, pendingCount, onCancel, onConfirm }) {
    const text =
      kind === "today"
        ? "¿Deseas generar las tareas de limpieza de los checkouts de hoy (" + D.formatDate(from) + ")? Las tareas duplicadas se omitirán automáticamente."
        : "¿Deseas generar las tareas de limpieza de los checkouts entre el " +
          D.formatDate(from) +
          " y el " +
          D.formatDate(to) +
          "?" +
          (pendingCount != null ? " Hay " + pendingCount + " por crear." : "") +
          " Las tareas duplicadas se omitirán automáticamente.";
    return html`<${U.Modal}
      title=${kind === "today" ? "Confirmar sincronización" : "Sincronizar rango"}
      onClose=${onCancel}
      footer=${html`<${U.Button} onClick=${onCancel}>Cancelar</${U.Button}><${U.Button} variant="primary" icon="RefreshCw" onClick=${onConfirm}>Sincronizar</${U.Button}>`}
    >
      <p>${text}</p>
    </${U.Modal}>`;
  }

  const CREATED_FIELDS = [
    ["Número", "TaskNumber", "CT.2026.NNNN", "existe"],
    ["Descripción", "Description", "Limpieza - {nombre del listing}", "existe"],
    ["Fase", "phase", "Asignada", "existe"],
    ["Fecha de checkout", "CheckoutDate", "Solo la fecha; la hora no se guarda", "existe"],
    ["Reserva", "HostawayReservation", "Evita duplicados", "existe"],
    ["Origen", "Source", "Hostaway", "existe"],
    ["Sincronizada el", "GeneratedDate", "Día de la sincronización", "existe"],
    ["Listing", "HostawayListingID", "listingMapId de la reserva", "propuesta"],
    ["Unidad", "Unit", "La vincula openMAINT por el listing; puede quedar vacía", "propuesta"],
  ];

  function CreatedFieldsCard() {
    return html`<${U.Card}
      title="Qué lleva cada limpieza creada"
      subtitle="Nace sin empleado, sin horario y sin checklist: por eso aparece en Pendientes."
    >
      <ul class="divide-y divide-slate-100 text-sm">
        ${CREATED_FIELDS.map(
          ([label, attr, value, tag]) => html`<li key=${attr} class="flex items-start justify-between gap-3 py-2">
            <div class="min-w-0">
              <p class="font-medium text-slate-900">${label}</p>
              <p class="text-xs text-slate-500">${value}</p>
            </div>
            <${U.Ann}
              tag=${tag}
              inline=${true}
              note=${tag === "propuesta"
                ? "Cambio de backend: al crear la tarjeta, enviar HostawayListingID = listingMapId; openMAINT se encarga de vincular la unidad."
                : "Ya lo escribe la sincronización hoy."}
            >
              <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">${attr}</code>
            </${U.Ann}>
          </li>`
        )}
      </ul>
    </${U.Card}>`;
  }

  function HistoryCard() {
    const runsQ = U.useApi(() => api.getSyncRuns(), []);
    const [open, setOpen] = useState(null);
    const runs = runsQ.data ? runsQ.data.data : [];
    const today = Coord.clock.today;

    return html`<${U.Card}
      id="historial"
      title="Historial de sincronizaciones"
      subtitle="Quién sincronizó, qué rango y qué pasó."
      bodyClass=""
      annotation=${{ tag: "propuesta", note: "No existe: hoy no se guarda el historial ni el detalle de errores (GET /cleaning-tasks/sync/runs)." }}
    >
      ${!runsQ.data
        ? html`<${U.Skeleton} rows=${4} />`
        : runs.length === 0
          ? html`<${U.EmptyState} icon="History" title="Aún no hay sincronizaciones registradas." />`
          : html`<div class="relative overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="bg-slate-50">
                  <tr>
                    <th scope="col" class=${U.TH}>Fecha y hora</th>
                    <th scope="col" class=${U.TH}>Quién</th>
                    <th scope="col" class=${U.TH}>Rango</th>
                    <th scope="col" class=${cx(U.TH, "text-right")}>Procesados</th>
                    <th scope="col" class=${cx(U.TH, "text-right")}>Creadas</th>
                    <th scope="col" class=${cx(U.TH, "text-right")}>Duplicadas</th>
                    <th scope="col" class=${cx(U.TH, "text-right")}>Errores</th>
                    <th scope="col" class=${U.TH}><span class="sr-only">Detalle</span></th>
                  </tr>
                </thead>
                <tbody>
                  ${runs.map((run) => {
                    const hasDetail = run.errors.length > 0 || run.status === "error";
                    const expanded = open === run.id;
                    return html`<tr key=${run.id} class="border-t border-slate-100">
                        <td class=${cx(U.TD, "whitespace-nowrap tabular-nums text-slate-900")}>
                          ${D.relativeDay(D.ymdOf(run.startedAt), today)}, ${D.formatTime(run.startedAt)}
                        </td>
                        <td class=${cx(U.TD, "text-slate-700")}>${run.user || html`<span class="text-slate-500">Página de openMAINT (sin usuario)</span>`}</td>
                        <td class=${cx(U.TD, "whitespace-nowrap text-slate-700")}>
                          ${run.dateFrom === run.dateTo ? D.formatDate(run.dateFrom) : D.formatDate(run.dateFrom) + " – " + D.formatDate(run.dateTo)}
                        </td>
                        <td class=${cx(U.TD, "text-right tabular-nums")}>${run.status === "error" ? "—" : run.total}</td>
                        <td class=${cx(U.TD, "text-right tabular-nums")}>${run.status === "error" ? "—" : run.created}</td>
                        <td class=${cx(U.TD, "text-right tabular-nums")}>${run.status === "error" ? "—" : run.skipped}</td>
                        <td class=${cx(U.TD, "text-right font-semibold tabular-nums", run.failed || run.status === "error" ? "text-red-700" : "text-slate-700")}>
                          ${run.status === "error" ? "Hostaway" : run.failed}
                        </td>
                        <td class=${cx(U.TD, "text-right")}>
                          ${hasDetail
                            ? html`<${U.Button} size="sm" variant="ghost" icon=${expanded ? "ChevronUp" : "ChevronDown"} onClick=${() => setOpen(expanded ? null : run.id)}>
                                ${expanded ? "Ocultar" : "Ver errores"}
                              </${U.Button}>`
                            : null}
                        </td>
                      </tr>
                      ${expanded
                        ? html`<tr class="bg-red-50/40">
                            <td colspan="8" class="px-4 pb-3">
                              ${run.status === "error"
                                ? html`<p class="text-sm text-red-800">${run.message}</p>`
                                : html`<ul class="space-y-1 text-sm">
                                    ${run.errors.map(
                                      (e) => html`<li key=${e.reservationId} class="flex flex-wrap gap-x-2 text-slate-700">
                                        <span class="font-mono text-slate-900">${e.reservationId}</span><span>·</span><span>${e.listingName}</span><span class="text-red-700">${e.message}</span>
                                      </li>`
                                    )}
                                  </ul>`}
                            </td>
                          </tr>`
                        : null}`;
                  })}
                </tbody>
              </table>
            </div>`}
    </${U.Card}>`;
  }

  function SincronizacionScreen() {
    const today = Coord.clock.today;
    const [todayState, setTodayState] = useState({ running: false, result: null, error: null });
    const [rangeState, setRangeState] = useState({ running: false, result: null, error: null });
    const [confirm, setConfirm] = useState(null);
    const [from, setFrom] = useState(today);
    const [to, setTo] = useState(D.addDays(today, 7));
    const [query, setQuery] = useState({ from: today, to: D.addDays(today, 7) });
    const [rangeError, setRangeError] = useState(null);
    const [filter, setFilter] = useState("todos");

    const previewQ = U.useApi(() => api.getCheckouts({ dateFrom: query.from, dateTo: query.to }), [query.from, query.to]);

    // "Sincronizar hoy" desde el panel abre directo la confirmación.
    useEffect(() => {
      if (U.store.state.intent === "sync-today") {
        U.store.set({ intent: null });
        setConfirm({ kind: "today" });
      }
    }, []);

    const rows = previewQ.data ? previewQ.data.rows : [];
    const counts = {
      todos: rows.length,
      "por-crear": rows.filter((r) => r.status === "por-crear").length,
      creada: rows.filter((r) => r.status === "creada").length,
      cambios: rows.filter((r) => r.status === "cambio" || r.status === "huerfana").length,
    };
    const visible = rows.filter((r) =>
      filter === "todos" ? true : filter === "cambios" ? r.status === "cambio" || r.status === "huerfana" : r.status === filter
    );

    const runSync = (kind) => {
      const body = kind === "today" ? { dateFrom: today, dateTo: today } : { dateFrom: from, dateTo: to };
      const setState = kind === "today" ? setTodayState : setRangeState;
      setConfirm(null);
      setState({ running: true, result: null, error: null });
      api
        .postSync(body)
        .then((result) => setState({ running: false, result, error: null }))
        .catch((error) => setState({ running: false, result: null, error }));
    };

    const showPreview = () => {
      const problem = rangeProblem(from, to);
      setRangeError(problem);
      if (!problem) setQuery({ from, to });
    };

    const askRangeSync = () => {
      const problem = rangeProblem(from, to);
      setRangeError(problem);
      if (problem) return;
      if (query.from !== from || query.to !== to) setQuery({ from, to });
      setConfirm({ kind: "range" });
    };

    const pastWarning = from && from < today && !rangeProblem(from, to);
    const previewMatches = query.from === from && query.to === to && previewQ.data;

    return html`<div class="space-y-6">
      <${U.PageHeader}
        title="Sincronización con Hostaway"
        subtitle="Crea las limpiezas a partir de los checkouts de Hostaway. Reemplaza la página de sincronización de openMAINT."
      />

      <div class="grid gap-6 xl:grid-cols-5">
        <div class="min-w-0 xl:col-span-3">
          <${U.Card}
            title="Sincronización de hoy"
            subtitle="Crea una limpieza por cada checkout de hoy. Las reservas que ya tienen limpieza se omiten."
            annotation=${{
              tag: "existe",
              note: "POST /cleaning-tasks/sync con dateFrom = dateTo = hoy en Guayaquil. La página de openMAINT usa /sync/today, que calcula 'hoy' en UTC (después de las 19:00 ya es mañana): así se evita sin tocar el backend.",
            }}
          >
            <div class="space-y-4">
              <div class="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha</p>
                  <p class="text-lg font-semibold tabular-nums text-slate-900">${D.formatDate(today)}</p>
                </div>
                <${U.Button}
                  variant="primary"
                  icon="RefreshCw"
                  loading=${todayState.running}
                  disabled=${todayState.running || rangeState.running}
                  onClick=${() => setConfirm({ kind: "today" })}
                >
                  ${todayState.running ? "Sincronizando…" : "Sincronizar ahora"}
                </${U.Button}>
              </div>
              <${SyncResult} state=${todayState} single=${true} />
            </div>
          </${U.Card}>
        </div>
        <div class="min-w-0 xl:col-span-2">
          <${CreatedFieldsCard} />
        </div>
      </div>

      <${U.Card}
        title="Próximas limpiezas"
        subtitle="Revisa los checkouts de un rango antes de sincronizarlo."
        bodyClass=""
        annotation=${{
          tag: "existe",
          note: "GET /cleaning-tasks/checkouts ya existe (máximo 92 días). Sincronizar un rango (POST /cleaning-tasks/sync) también existe, pero la página de openMAINT no lo ofrece.",
        }}
      >
        <div class="space-y-4 px-5 py-4">
          <div class="flex flex-wrap items-end gap-3">
            <${U.Field} label="Inicio" htmlFor="rango-inicio">
              <input id="rango-inicio" type="date" class=${U.inputClass(Boolean(rangeError))} value=${from} onInput=${(e) => setFrom(e.target.value)} />
            </${U.Field}>
            <${U.Field} label="Fin" htmlFor="rango-fin">
              <input id="rango-fin" type="date" class=${U.inputClass(Boolean(rangeError))} value=${to} onInput=${(e) => setTo(e.target.value)} />
            </${U.Field}>
            <${U.Button} icon="Search" onClick=${showPreview}>Ver próximas limpiezas</${U.Button}>
            <${U.Button}
              variant="primary"
              icon="RefreshCw"
              loading=${rangeState.running}
              disabled=${rangeState.running || todayState.running}
              onClick=${askRangeSync}
            >
              ${rangeState.running ? "Sincronizando…" : "Sincronizar rango"}
            </${U.Button}>
          </div>
          ${rangeError ? html`<p class="text-sm font-medium text-red-600" role="alert">${rangeError}</p>` : null}
          ${pastWarning
            ? html`<${U.InlineAlert} tone="warning">El rango incluye días pasados: se crearán limpiezas de checkouts que ya ocurrieron.</${U.InlineAlert}>`
            : null}
          <${SyncResult} state=${rangeState} single=${false} />
        </div>

        <div class="border-t border-slate-100 px-5 py-3">
          <${U.Ann} tag="propuesta" note="Hoy /checkouts devuelve solo la lista de Hostaway: no dice si la reserva ya tiene limpieza, si cambió de fecha o si desapareció. Hay que cruzarla con las tarjetas por HostawayReservation.">
            <${U.Segmented}
              label="Filtrar checkouts"
              value=${filter}
              onChange=${setFilter}
              options=${[
                { value: "todos", label: "Todos", count: counts.todos },
                { value: "por-crear", label: "Por crear", count: counts["por-crear"] },
                { value: "creada", label: "Ya creadas", count: counts.creada },
                { value: "cambios", label: "Con cambios", count: counts.cambios },
              ]}
            />
          </${U.Ann}>
        </div>

        ${previewQ.error && !previewQ.data
          ? html`<${U.ErrorState} error=${previewQ.error} onRetry=${previewQ.reload} title="No se pudo consultar Hostaway." />`
          : !previewQ.data
            ? html`<${U.Skeleton} rows=${6} />`
            : visible.length === 0
              ? html`<${U.EmptyState} icon="CalendarCheck" title=${rows.length ? "Nada que mostrar con este filtro." : "No hay checkouts en el rango seleccionado."} />`
              : html`<div class="relative overflow-x-auto">
                  <table class="min-w-full text-sm">
                    <thead class="bg-slate-50">
                      <tr>
                        <th scope="col" class=${U.TH}>Checkout</th>
                        <th scope="col" class=${U.TH}>Listing</th>
                        <th scope="col" class=${U.TH}>Reserva</th>
                        <th scope="col" class=${U.TH}>Estado</th>
                        <th scope="col" class=${U.TH}>Limpieza</th>
                        <th scope="col" class=${U.TH}><span class="sr-only">Acción</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${visible.map((r) => {
                        const chip = STATUS_CHIP[r.status];
                        const shownDate = r.hostawayCheckoutDate || r.checkoutDate;
                        return html`<tr key=${r.reservationId} class="border-t border-slate-100">
                          <td class=${cx(U.TD, "whitespace-nowrap")}>
                            <p class="font-medium tabular-nums text-slate-900">${D.formatDayShort(shownDate)} · ${r.checkoutTime || "—"}</p>
                            ${r.status === "cambio"
                              ? html`<p class="text-xs text-amber-700">La limpieza dice ${D.formatDayShort(r.task.checkoutDate)}</p>`
                              : r.status === "huerfana"
                                ? html`<p class="text-xs text-red-700">Limpieza del ${D.formatDayShort(r.checkoutDate)}</p>`
                                : null}
                          </td>
                          <td class=${U.TD}>
                            <p class="font-medium text-slate-900">${r.listingName}</p>
                            <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                              <span class="font-mono">listing ${r.listingId}</span>
                              ${r.unitMatch === "none"
                                ? html`<${U.Chip} icon="Link2Off" title="La limpieza se crea igual, sin unidad.">Sin unidad en openMAINT</${U.Chip}>`
                                : r.unitMatch === "ambiguous"
                                  ? html`<${U.Chip} tone="amber" title="Dos unidades tienen este HostawayListingID: la limpieza se crea sin unidad.">Listing en 2 unidades</${U.Chip}>`
                                  : null}
                            </div>
                          </td>
                          <td class=${cx(U.TD, "font-mono text-slate-700")}>${r.reservationId}</td>
                          <td class=${U.TD}><${U.Chip} tone=${chip.tone}>${chip.label}</${U.Chip}></td>
                          <td class=${U.TD}>
                            ${r.task
                              ? html`<div class="flex flex-col items-start gap-1">
                                  <button type="button" class=${cx("font-mono font-semibold text-brand hover:underline", U.FOCUS)} onClick=${() => U.openTask(r.task.id)}>
                                    ${r.task.taskNumber}
                                  </button>
                                  <${U.StatusBadges} task=${r.task} />
                                </div>`
                              : html`<span class="text-slate-400">—</span>`}
                          </td>
                          <td class=${cx(U.TD, "text-right")}>
                            ${r.status === "cambio" && D.canEdit(r.task)
                              ? html`<${U.Button} size="sm" onClick=${() => U.openTask(r.task.id, "editar")}>Corregir fecha</${U.Button}>`
                              : r.status === "huerfana"
                                ? html`<${U.Button} size="sm" onClick=${() => U.openTask(r.task.id)}>Revisar</${U.Button}>`
                                : null}
                          </td>
                        </tr>`;
                      })}
                    </tbody>
                  </table>
                </div>`}

        ${previewQ.data
          ? html`<p class="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
              ${previewQ.data.count
                ? previewQ.data.count +
                  (previewQ.data.count === 1 ? " checkout encontrado" : " checkouts encontrados") +
                  " entre el " +
                  D.formatDate(previewQ.data.dateFrom) +
                  " y el " +
                  D.formatDate(previewQ.data.dateTo)
                : "No hay checkouts en el rango seleccionado."}
            </p>`
          : null}
      </${U.Card}>

      <${HistoryCard} />

      ${confirm
        ? html`<${ConfirmModal}
            kind=${confirm.kind}
            from=${confirm.kind === "today" ? today : from}
            to=${confirm.kind === "today" ? today : to}
            pendingCount=${confirm.kind === "range" && previewMatches ? counts["por-crear"] : null}
            onCancel=${() => setConfirm(null)}
            onConfirm=${() => runSync(confirm.kind)}
          />`
        : null}
    </div>`;
  }

  Coord.screens = Coord.screens || {};
  Coord.screens.sincronizacion = {
    title: "Sincronización con Hostaway",
    calls: ["postSync", "getCheckouts", "getSyncRuns"],
    Component: SincronizacionScreen,
  };
})();
