/*
 * Pendientes por asignar: lo que dejó la sincronización (o una limpieza manual
 * sin empleado) y todavía no tiene empleado u horario. Incluye la asignación
 * en lote.
 */
(() => {
  "use strict";

  const Coord = window.Coord;
  const { html, useState, useMemo, useEffect, useRef } = window.htmPreact;
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
    const selection = U.useStore((s) => s.selection);
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

    // La selección solo guarda pendientes que siguen visibles en la lista.
    const pendingIds = new Set(pending.map((t) => t.id));
    const selected = selection.filter((id) => pendingIds.has(id));
    const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.indexOf(t.id) !== -1);

    const toggle = (id) =>
      U.store.set((s) => ({
        selection: s.selection.indexOf(id) !== -1 ? s.selection.filter((x) => x !== id) : s.selection.concat(id),
      }));
    const toggleAll = () =>
      U.store.set((s) => {
        const ids = visible.map((t) => t.id);
        return {
          selection: allVisibleSelected ? s.selection.filter((id) => ids.indexOf(id) === -1) : Array.from(new Set(s.selection.concat(ids))),
        };
      });

    return html`<div class="space-y-6">
      <${U.PageHeader}
        title=${html`Pendientes por asignar ${tasksQ.data ? html`<span class="ml-1 align-middle text-lg font-semibold text-slate-400 tabular-nums">${pending.length}</span>` : null}`}
        subtitle="Limpiezas sin empleado o sin horario. Las recién creadas aparecen primero."
        actions=${html`<${U.Button} icon="Plus" onClick=${() => U.navigate("nueva")}>Nueva limpieza</${U.Button}>
          <${U.Button} variant="primary" icon="Users" disabled=${selected.length === 0} onClick=${() => U.openOverlay("lote")}>
            Asignar seleccionadas${selected.length ? " (" + selected.length + ")" : ""}
          </${U.Button}>`}
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
                          <th scope="col" class=${cx(U.TH, "w-10")}>
                            <input
                              id="seleccionar-todas"
                              type="checkbox"
                              class="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                              aria-label="Seleccionar todas las visibles"
                              checked=${allVisibleSelected}
                              onChange=${toggleAll}
                            />
                          </th>
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
                          const isSelected = selected.indexOf(t.id) !== -1;
                          return html`<tr key=${t.id} class=${cx("border-t border-slate-100", isSelected ? "bg-brand/5" : "hover:bg-slate-50")}>
                            <td class=${U.TD}>
                              <input
                                id=${"sel-" + t.id}
                                type="checkbox"
                                class="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                                aria-label=${"Seleccionar " + t.taskNumber}
                                checked=${isSelected}
                                onChange=${() => toggle(t.id)}
                              />
                            </td>
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

      ${selected.length
        ? html`<div class="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
            <span class="font-semibold tabular-nums">${selected.length} ${selected.length === 1 ? "seleccionada" : "seleccionadas"}</span>
            <${U.Button} size="sm" variant="primary" icon="Users" onClick=${() => U.openOverlay("lote")}>Asignar</${U.Button}>
            <button type="button" class=${cx("rounded-lg px-2 py-1 text-slate-300 hover:text-white", U.FOCUS)} onClick=${() => U.store.set({ selection: [] })}>
              Quitar selección
            </button>
          </div>`
        : null}
    </div>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Asignación en lote
  // ───────────────────────────────────────────────────────────────────────────

  function BulkDrawer() {
    const selection = U.useStore((s) => s.selection);
    const tasksQ = U.useApi(() => api.getAllTasks(), []);
    const employeesQ = U.useApi(() => api.listEmployees(), []);
    const checklistsQ = U.useApi(() => api.listChecklists(), []);

    const allTasks = tasksQ.data ? tasksQ.data.data : [];
    const employees = employeesQ.data ? employeesQ.data.data : [];
    const checklists = checklistsQ.data ? checklistsQ.data.data : [];

    // Se congela la lista al abrir: lo que se asigna deja de ser pendiente y no debe desaparecer del panel.
    const frozenRef = useRef(null);
    if (!frozenRef.current && tasksQ.data) {
      frozenRef.current = allTasks.filter((t) => selection.indexOf(t.id) !== -1 && D.isPending(t)).sort((a, b) => b.id - a.id);
    }
    const items = frozenRef.current || [];
    const ids = items.map((t) => t.id);

    const [employeeId, setEmployeeId] = useState(null);
    const [checklistId, setChecklistId] = useState(null);
    const [rows, setRows] = useState({});
    const [chainStart, setChainStart] = useState("10:00");
    const [chainGap, setChainGap] = useState(15);
    const [submitting, setSubmitting] = useState(false);
    const [progress, setProgress] = useState(null);
    const [results, setResults] = useState({});
    const [formError, setFormError] = useState(null);

    useEffect(() => {
      if (!items.length || Object.keys(rows).length) return;
      const initial = {};
      items.forEach((t) => {
        initial[t.id] = {
          date: t.plannedStartTime ? D.ymdOf(t.plannedStartTime) : D.taskDate(t),
          start: t.plannedStartTime ? D.hmOf(t.plannedStartTime) : "",
          end: t.plannedEndTime ? D.hmOf(t.plannedEndTime) : "",
          employeeId: t.employee ? t.employee.id : null,
        };
      });
      setRows(initial);
    }, [items.length]);

    const setRow = (id, patch) => setRows((r) => Object.assign({}, r, { [id]: Object.assign({}, r[id], patch) }));

    const applyEmployee = (value) => {
      setEmployeeId(value);
      setRows((r) => {
        const next = {};
        Object.keys(r).forEach((id) => {
          next[id] = Object.assign({}, r[id], { employeeId: value });
        });
        return next;
      });
    };

    const chosenChecklist = checklists.find((c) => c.id === checklistId) || null;
    const minutes = chosenChecklist ? D.summarizeChecklist(chosenChecklist.activities).minutes : null;
    const dates = Array.from(new Set(items.map((t) => (rows[t.id] ? rows[t.id].date : D.taskDate(t)))));
    const chainBlocked = dates.length > 1 ? "Solo si todas son del mismo día." : minutes === null ? "Elige un checklist con minutos." : null;

    const chain = () => {
      if (chainBlocked || !chainStart) return;
      let cursor = chainStart;
      const duration = Math.round(minutes);
      setRows((r) => {
        const next = Object.assign({}, r);
        items.forEach((t) => {
          const end = D.addMinutesToHm(cursor, duration);
          next[t.id] = Object.assign({}, r[t.id], { start: cursor, end });
          cursor = D.addMinutesToHm(end, Number(chainGap) || 0);
        });
        return next;
      });
    };

    const iso = (row, field) => (row && row.date && row[field] ? D.isoAt(row.date, row[field]) : null);

    const rowStatus = (t) => {
      const row = rows[t.id];
      if (results[t.id] && results[t.id].ok) return { tone: "emerald", text: "Asignada" };
      if (results[t.id] && !results[t.id].ok) return { tone: "red", text: results[t.id].message };
      if (!row || !row.date || !row.start || !row.end || !row.employeeId) return { tone: "amber", text: "Falta completar" };
      if (row.end <= row.start) return { tone: "red", text: "El fin es anterior al inicio" };
      const startIso = iso(row, "start");
      const endIso = iso(row, "end");
      const existing = D.conflictsFor(row.employeeId, startIso, endIso, allTasks, ids);
      const siblings = items.filter((other) => {
        if (other.id === t.id) return false;
        const o = rows[other.id];
        return o && o.employeeId === row.employeeId && o.start && o.end && o.date === row.date && o.start < row.end && row.start < o.end;
      });
      const clash = existing.concat(siblings);
      if (clash.length) return { tone: "red", text: "Se superpone con " + clash.map((x) => x.taskNumber).join(", "), overlap: true };
      return { tone: "emerald", text: "Lista" };
    };

    const statuses = items.map((t) => ({ task: t, status: rowStatus(t) }));
    const overlapCount = statuses.filter((s) => s.status.overlap).length;
    const notifyByEmployee = new Map();
    items.forEach((t) => {
      const row = rows[t.id];
      if (row && row.employeeId && !(results[t.id] && results[t.id].ok)) {
        notifyByEmployee.set(row.employeeId, (notifyByEmployee.get(row.employeeId) || 0) + 1);
      }
    });

    const submit = () => {
      setFormError(null);
      const todo = items.filter((t) => !(results[t.id] && results[t.id].ok));
      const incomplete = todo.filter((t) => {
        const row = rows[t.id];
        return !row || !row.date || !row.start || !row.end || !row.employeeId || row.end <= row.start;
      });
      if (incomplete.length) {
        setFormError("Completa fecha, inicio, fin y empleado en todas las filas (el fin debe ser posterior al inicio).");
        return;
      }
      setSubmitting(true);
      let done = 0;
      const outcome = Object.assign({}, results);
      const runNext = (index) => {
        if (index >= todo.length) {
          setSubmitting(false);
          setProgress(null);
          setResults(Object.assign({}, outcome));
          const failed = todo.filter((t) => !outcome[t.id].ok).length;
          if (!failed) {
            U.flash("success", todo.length === 1 ? "1 limpieza asignada." : todo.length + " limpiezas asignadas.");
            U.store.set((s) => ({ selection: s.selection.filter((id) => ids.indexOf(id) === -1) }));
            U.closeOverlay();
          }
          return;
        }
        const t = todo[index];
        const row = rows[t.id];
        setProgress({ done, total: todo.length });
        const patch = {
          plannedStartTime: iso(row, "start"),
          plannedEndTime: iso(row, "end"),
          employeeId: row.employeeId,
        };
        if (checklistId) patch.cleaningChecklistId = checklistId;
        api
          .updateTask(t.id, patch)
          .then(() => {
            outcome[t.id] = { ok: true };
          })
          .catch((error) => {
            outcome[t.id] = { ok: false, message: error.message };
          })
          .finally(() => {
            done += 1;
            setResults(Object.assign({}, outcome));
            runNext(index + 1);
          });
      };
      runNext(0);
    };

    const failedCount = items.filter((t) => results[t.id] && !results[t.id].ok).length;
    const loading = !tasksQ.data || !employeesQ.data || !checklistsQ.data;

    const footer = html`<div class="flex flex-wrap items-center justify-end gap-3">
      ${notifyByEmployee.size
        ? html`<${U.Ann} tag="existe" note="Cada PUT que asigna empleado le envía un aviso (push cleaning.assigned). Agruparlos sería propuesta." inline=${true} class="mr-auto">
            <span class="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <${U.Icon} name="Bell" class="h-3.5 w-3.5" />
              ${Array.from(notifyByEmployee.entries())
                .map(([id, n]) => {
                  const e = employees.find((x) => x.id === id);
                  return (e ? D.formatEmployeeName(e.name) : "Empleado") + " recibirá " + n + (n === 1 ? " notificación" : " notificaciones");
                })
                .join(" · ")}.
            </span>
          </${U.Ann}>`
        : null}
      <${U.Button} onClick=${U.closeOverlay} disabled=${submitting}>Cancelar</${U.Button}>
      <${U.Button} variant="primary" icon="Users" loading=${submitting} disabled=${submitting || !items.length} onClick=${submit}>
        ${submitting && progress
          ? "Asignando " + (progress.done + 1) + " de " + progress.total + "…"
          : failedCount
            ? "Reintentar las " + failedCount + " que fallaron"
            : "Asignar " + items.length + (items.length === 1 ? " limpieza" : " limpiezas")}
      </${U.Button}>
    </div>`;

    return html`<${U.Drawer}
      title=${"Asignar " + (items.length || "") + (items.length === 1 ? " limpieza" : " limpiezas")}
      eyebrow=${html`<span>Pendientes seleccionadas</span>`}
      width="max-w-[1040px]"
      onClose=${U.closeOverlay}
      footer=${footer}
    >
      ${loading
        ? html`<${U.Skeleton} rows=${6} />`
        : !items.length
          ? html`<${U.EmptyState} icon="Inbox" title="No hay pendientes seleccionadas.">Vuelve a Pendientes y marca las limpiezas que quieras asignar.</${U.EmptyState}>`
          : html`<div class="space-y-4">
              <${U.Ann} tag="ajuste" note="Se guarda con un PUT por limpieza (existe, con los ajustes de rol y campos). Un endpoint de asignación en lote sería propuesta.">
                <section class="grid gap-4 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-2">
                  <${U.Field} label="Empleado para todas" htmlFor="lote-empleado" hint="Después puedes cambiarlo fila por fila.">
                    <${U.EmployeeSelect}
                      id="lote-empleado"
                      value=${employeeId}
                      onChange=${applyEmployee}
                      employees=${employees}
                      tasks=${allTasks}
                      date=${dates.length === 1 ? dates[0] : null}
                      excludeIds=${ids}
                    />
                  </${U.Field}>
                  <${U.Field} label="Checklist para todas" htmlFor="lote-checklist" hint="Opcional.">
                    <${U.ChecklistSelect} id="lote-checklist" value=${checklistId} onChange=${setChecklistId} checklists=${checklists} />
                  </${U.Field}>
                  <${U.Ann} tag="ui" note="Ayuda de la pantalla: reparte los horarios con la duración del checklist. No requiere backend." class="md:col-span-2">
                    <div class="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3">
                      <${U.Field} label="Encadenar desde" htmlFor="lote-desde">
                        <input id="lote-desde" type="time" step="300" class=${U.inputClass(false, "w-32")} value=${chainStart} onInput=${(e) => setChainStart(e.target.value)} />
                      </${U.Field}>
                      <${U.Field} label="Minutos entre limpiezas" htmlFor="lote-separacion">
                        <input id="lote-separacion" type="number" min="0" max="120" step="5" class=${U.inputClass(false, "w-32")} value=${chainGap} onInput=${(e) => setChainGap(e.target.value)} />
                      </${U.Field}>
                      <${U.Button} icon="Timer" disabled=${Boolean(chainBlocked)} onClick=${chain}>Encadenar horarios</${U.Button}>
                      <p class="text-xs text-slate-500">${chainBlocked || "Usa " + Math.round(minutes) + " min por limpieza, en el orden de la tabla."}</p>
                    </div>
                  </${U.Ann}>
                </section>
              </${U.Ann}>

              ${overlapCount
                ? html`<${U.InlineAlert} tone="warning">
                    ${overlapCount === 1 ? "Hay 1 limpieza que se superpone" : "Hay " + overlapCount + " limpiezas que se superponen"} con otras del mismo empleado. Puedes asignar igual.
                  </${U.InlineAlert}>`
                : null}
              ${formError ? html`<${U.InlineAlert} tone="error">${formError}</${U.InlineAlert}>` : null}

              <section class="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div class="relative overflow-x-auto">
                  <table class="min-w-full text-sm">
                    <thead class="bg-slate-50">
                      <tr>
                        <th scope="col" class=${U.TH}>Limpieza</th>
                        <th scope="col" class=${U.TH}>Fecha</th>
                        <th scope="col" class=${U.TH}>Inicio</th>
                        <th scope="col" class=${U.TH}>Fin</th>
                        <th scope="col" class=${U.TH}>Empleado</th>
                        <th scope="col" class=${U.TH}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${statuses.map(({ task: t, status }) => {
                        const row = rows[t.id] || {};
                        const done = results[t.id] && results[t.id].ok;
                        return html`<tr key=${t.id} class="border-t border-slate-100">
                          <td class=${U.TD}>
                            <p class="font-mono font-semibold text-slate-900">${t.taskNumber}</p>
                            <p class="max-w-[14rem] truncate text-xs text-slate-500" title=${U.placeLabel(t)}>${U.placeLabel(t)}</p>
                          </td>
                          <td class=${U.TD}>
                            <input
                              id=${"lote-fecha-" + t.id}
                              aria-label=${"Fecha de " + t.taskNumber}
                              type="date"
                              class=${U.inputClass(false, "w-40")}
                              value=${row.date || ""}
                              disabled=${done}
                              onInput=${(e) => setRow(t.id, { date: e.target.value })}
                            />
                          </td>
                          <td class=${U.TD}>
                            <input
                              id=${"lote-inicio-" + t.id}
                              aria-label=${"Inicio de " + t.taskNumber}
                              type="time"
                              step="300"
                              class=${U.inputClass(false, "w-28")}
                              value=${row.start || ""}
                              disabled=${done}
                              onInput=${(e) => setRow(t.id, { start: e.target.value })}
                            />
                          </td>
                          <td class=${U.TD}>
                            <input
                              id=${"lote-fin-" + t.id}
                              aria-label=${"Fin de " + t.taskNumber}
                              type="time"
                              step="300"
                              class=${U.inputClass(false, "w-28")}
                              value=${row.end || ""}
                              disabled=${done}
                              onInput=${(e) => setRow(t.id, { end: e.target.value })}
                            />
                          </td>
                          <td class=${cx(U.TD, "min-w-[14rem]")}>
                            <${U.EmployeeSelect}
                              id=${"lote-empleado-" + t.id}
                              value=${row.employeeId}
                              onChange=${(value) => setRow(t.id, { employeeId: value })}
                              employees=${employees}
                              tasks=${allTasks}
                              date=${row.date}
                              startIso=${iso(row, "start")}
                              endIso=${iso(row, "end")}
                              excludeIds=${ids}
                            />
                          </td>
                          <td class=${cx(U.TD, "min-w-[9rem]")}><${U.Chip} tone=${status.tone} wrap=${true}>${status.text}</${U.Chip}></td>
                        </tr>`;
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>`}
    </${U.Drawer}>`;
  }

  Coord.screens = Coord.screens || {};
  Coord.screens.pendientes = {
    title: "Pendientes por asignar",
    calls: ["getAllTasks", "updateTask", "listEmployees", "listChecklists"],
    Component: PendientesScreen,
  };
  Coord.screens.BulkDrawer = BulkDrawer;
})();
