/*
 * Limpiezas: la grilla completa (como la lista de tarjetas de openMAINT) y la
 * agenda del día en línea de tiempo por empleado.
 */
(() => {
  "use strict";

  const Coord = window.Coord;
  const { html, useState, useMemo } = window.htmPreact;
  const D = Coord.domain;
  const U = Coord.ui;
  const api = Coord.api;
  const cx = U.cx;

  const STATUS_ORDER = ["pending", "assigned", "paused", "inProgress", "review", "done", "cancelled"];

  const DATE_FILTERS = [
    { value: "todas", label: "Todas las fechas" },
    { value: "hoy", label: "Hoy" },
    { value: "manana", label: "Mañana" },
    { value: "semana", label: "Próximos 7 días" },
    { value: "pasados", label: "Últimos 7 días" },
  ];

  const fold = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  function Tabs({ active }) {
    return html`<div role="tablist" aria-label="Vista" class="inline-flex rounded-xl bg-white p-1 shadow-sm">
      ${[
        { token: "limpiezas", label: "Tabla", icon: "Table" },
        { token: "agenda", label: "Agenda del día", icon: "CalendarDays" },
      ].map(
        (tab) => html`<button
          key=${tab.token}
          type="button"
          role="tab"
          aria-selected=${active === tab.token ? "true" : "false"}
          onClick=${() => U.navigate(tab.token, { keepScroll: true })}
          class=${cx(
            "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
            U.FOCUS,
            active === tab.token ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          <${U.Icon} name=${tab.icon} />${tab.label}
        </button>`
      )}
    </div>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tabla
  // ───────────────────────────────────────────────────────────────────────────

  function TableView({ tasks, employees }) {
    const today = Coord.clock.today;
    const [q, setQ] = useState("");
    const [statuses, setStatuses] = useState(STATUS_ORDER.slice());
    const [source, setSource] = useState("todos");
    const [employeeId, setEmployeeId] = useState("");
    const [dates, setDates] = useState("todas");
    const [sort, onSort] = U.useSort({ key: "creada", dir: "desc" });

    const inDates = (t) => {
      const date = D.taskDate(t);
      if (dates === "hoy") return date === today;
      if (dates === "manana") return date === D.addDays(today, 1);
      if (dates === "semana") return date >= today && date <= D.addDays(today, 7);
      if (dates === "pasados") return date < today && date >= D.addDays(today, -7);
      return true;
    };

    const base = tasks.filter(
      (t) =>
        inDates(t) &&
        (source === "todos" || t.source === source) &&
        (!employeeId || (employeeId === "sin" ? !t.employee : t.employee && String(t.employee.id) === employeeId)) &&
        (!q ||
          fold([t.taskNumber, t.description, t.unit && t.unit.description, t.unit && t.unit.code, t.listingName, t.hostawayReservation].join(" ")).indexOf(fold(q)) !== -1)
    );
    const statusCount = {};
    STATUS_ORDER.forEach((key) => {
      statusCount[key] = base.filter((t) => D.statusKey(t) === key).length;
    });
    const visible = base
      .filter((t) => statuses.indexOf(D.statusKey(t)) !== -1)
      .sort(
        U.compareBy(sort, {
          creada: (t) => t.id,
          numero: (t) => t.taskNumber,
          checkout: (t) => t.checkoutDate,
          planificada: (t) => t.plannedStartTime,
          empleado: (t) => (t.employee ? D.formatEmployeeName(t.employee.name) : null),
        })
      );

    const toggleStatus = (key) =>
      setStatuses((list) => (list.indexOf(key) !== -1 ? list.filter((k) => k !== key) : list.concat(key)));

    return html`<div class="space-y-4">
      <div class="flex flex-wrap items-end gap-3">
        <label class="relative block w-full max-w-xs" for="buscar-limpiezas">
          <span class="sr-only">Buscar</span>
          <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400"><${U.Icon} name="Search" /></span>
          <input
            id="buscar-limpiezas"
            type="search"
            class=${U.inputClass(false, "pl-9")}
            placeholder="Número, unidad, listing o reserva"
            value=${q}
            onInput=${(e) => setQ(e.target.value)}
          />
        </label>
        <select id="filtro-fecha" aria-label="Fecha" class=${U.inputClass(false, "w-auto")} value=${dates} onChange=${(e) => setDates(e.target.value)}>
          ${DATE_FILTERS.map((f) => html`<option key=${f.value} value=${f.value}>${f.label}</option>`)}
        </select>
        <select id="filtro-origen" aria-label="Origen" class=${U.inputClass(false, "w-auto")} value=${source} onChange=${(e) => setSource(e.target.value)}>
          <option value="todos">Todos los orígenes</option>
          <option value="Hostaway">Hostaway</option>
          <option value="Manual">Manual</option>
        </select>
        <select id="filtro-empleado" aria-label="Empleado" class=${U.inputClass(false, "w-auto")} value=${employeeId} onChange=${(e) => setEmployeeId(e.target.value)}>
          <option value="">Todos los empleados</option>
          <option value="sin">Sin empleado</option>
          ${employees.map((e) => html`<option key=${e.id} value=${String(e.id)}>${D.formatEmployeeName(e.name)}</option>`)}
        </select>
      </div>

      <div class="flex flex-wrap gap-2" role="group" aria-label="Estados">
        ${STATUS_ORDER.map((key) => {
          const on = statuses.indexOf(key) !== -1;
          const st = D.STATUS[key];
          return html`<button
            key=${key}
            type="button"
            aria-pressed=${on ? "true" : "false"}
            onClick=${() => toggleStatus(key)}
            class=${cx(U.BADGE, "transition", U.FOCUS, on ? U.LEVEL_BADGE[st.level] : "border border-dashed border-slate-300 bg-white text-slate-400")}
          >
            ${st.label}<span class="tabular-nums opacity-70">${statusCount[key]}</span>
          </button>`;
        })}
      </div>

      <${U.Card}
        bodyClass=""
        annotation=${{ tag: "ajuste", note: "Hoy GET /cleaning-tasks/all es solo para supervisión, trae 50 por página y su filtro de fecha usa GeneratedDate. La grilla necesita filtros por fecha planificada, checkout, origen y empleado." }}
      >
        ${visible.length === 0
          ? html`<${U.EmptyState} icon="Search" title="Ninguna limpieza coincide con los filtros." />`
          : html`<div class="relative overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="bg-slate-50">
                  <tr>
                    <${U.SortHeader} label="Número" sortKey="numero" sort=${sort} onSort=${onSort} />
                    <th scope="col" class=${U.TH}>Descripción</th>
                    <th scope="col" class=${U.TH}>Unidad</th>
                    <${U.SortHeader} label="Checkout" sortKey="checkout" sort=${sort} onSort=${onSort} />
                    <${U.SortHeader} label="Planificada" sortKey="planificada" sort=${sort} onSort=${onSort} />
                    <${U.SortHeader} label="Empleado" sortKey="empleado" sort=${sort} onSort=${onSort} />
                    <th scope="col" class=${U.TH}>Estado</th>
                    <th scope="col" class=${U.TH}>Origen</th>
                    <${U.SortHeader} label="Creada" sortKey="creada" sort=${sort} onSort=${onSort} />
                  </tr>
                </thead>
                <tbody>
                  ${visible.map(
                    (t) => html`<tr
                      key=${t.id}
                      class="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick=${() => U.openTask(t.id)}
                    >
                      <td class=${U.TD}>
                        <button type="button" class=${cx("font-mono font-semibold text-slate-900 hover:text-brand", U.FOCUS)} onClick=${(e) => {
                          e.stopPropagation();
                          U.openTask(t.id);
                        }}>${t.taskNumber}</button>
                      </td>
                      <td class=${cx(U.TD, "max-w-[16rem]")}><p class="truncate text-slate-700" title=${t.description}>${t.description}</p></td>
                      <td class=${cx(U.TD, "whitespace-nowrap text-slate-700")}>${t.unit ? U.unitLabel(t.unit) : html`<span class="text-slate-400">Sin unidad</span>`}</td>
                      <td class=${cx(U.TD, "whitespace-nowrap tabular-nums text-slate-700")}>${t.checkoutDate ? D.formatDayShort(t.checkoutDate) : html`<span class="text-slate-400">—</span>`}</td>
                      <td class=${cx(U.TD, "whitespace-nowrap tabular-nums text-slate-700")}>${t.plannedStartTime ? U.plannedLabel(t) : html`<span class="text-slate-400">Sin horario</span>`}</td>
                      <td class=${cx(U.TD, "whitespace-nowrap text-slate-700")}>${t.employee ? U.employeeName(t.employee) : html`<span class="text-slate-400">Sin asignar</span>`}</td>
                      <td class=${U.TD}><${U.StatusBadges} task=${t} /></td>
                      <td class=${U.TD}><${U.SourceBadge} source=${t.source} /></td>
                      <td class=${cx(U.TD, "whitespace-nowrap tabular-nums text-slate-500")}>${D.relativeDay(t.generatedDate, today)}</td>
                    </tr>`
                  )}
                </tbody>
              </table>
            </div>`}
        <p class="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">Mostrando ${visible.length} de ${tasks.length} limpiezas. Las recién creadas aparecen primero.</p>
      </${U.Card}>
    </div>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Agenda del día
  // ───────────────────────────────────────────────────────────────────────────

  const LANE = 52;

  const assignLanes = (list) => {
    const lanes = [];
    const placed = list
      .slice()
      .sort((a, b) => Date.parse(a.plannedStartTime) - Date.parse(b.plannedStartTime))
      .map((task) => {
        const start = Date.parse(task.plannedStartTime);
        let lane = lanes.findIndex((end) => end <= start);
        if (lane === -1) {
          lane = lanes.length;
          lanes.push(0);
        }
        lanes[lane] = Date.parse(task.plannedEndTime);
        return { task, lane };
      });
    return { placed, laneCount: Math.max(1, lanes.length) };
  };

  function Block({ task, lane, pct, overlapping }) {
    const key = D.statusKey(task);
    const level = D.STATUS[key].level;
    const startMin = D.minutesOfDay(task.plannedStartTime);
    const endMin = D.minutesOfDay(task.plannedEndTime);
    const overdue = D.overdueMinutes(task, Coord.clock.nowMs);
    const left = pct(startMin);
    const width = Math.max(pct(endMin) - left, 4);

    let actual = null;
    if (task.actualStartTime && D.ymdOf(task.actualStartTime) === D.ymdOf(task.plannedStartTime)) {
      const aStart = D.minutesOfDay(task.actualStartTime);
      const aEnd = task.actualEndTime
        ? D.minutesOfDay(task.actualEndTime)
        : task.phase === "InExecution"
          ? D.minutesOfDay(Coord.clock.nowIso)
          : null;
      if (aEnd !== null && aEnd > aStart) {
        actual = { left: pct(aStart), width: Math.max(pct(aEnd) - pct(aStart), 0.6), done: Boolean(task.actualEndTime) };
      }
    }

    const tooltip =
      task.taskNumber +
      " · " +
      task.description +
      " · " +
      D.STATUS[key].label +
      (overdue ? " · atrasada " + D.formatDuration(overdue) : "") +
      (D.isReopened(task) ? " · reabierta" : "") +
      (overlapping ? " · se superpone" : "");

    return html`<button
        type="button"
        onClick=${() => U.openTask(task.id)}
        title=${tooltip}
        style=${{ left: left + "%", width: width + "%", top: 4 + lane * LANE + "px", height: LANE - 12 + "px" }}
        class=${cx(
          "absolute overflow-hidden rounded-lg border-l-4 bg-white px-2 py-1 text-left text-xs shadow-sm transition hover:z-10 hover:shadow-md",
          U.FOCUS,
          U.LEVEL_BORDER[level],
          overlapping ? "ring-2 ring-red-400" : overdue ? "ring-2 ring-red-300" : "ring-1 ring-slate-200"
        )}
      >
        <span class="flex items-center gap-1 font-semibold tabular-nums text-slate-900">
          ${overlapping ? html`<${U.Icon} name="TriangleAlert" class="h-3.5 w-3.5 shrink-0 text-red-600" label="Se superpone" />` : null}
          ${task.isPaused ? html`<${U.Icon} name="CirclePause" class="h-3.5 w-3.5 shrink-0 text-violet-600" label="En pausa" />` : null}
          ${overdue ? html`<${U.Icon} name="Clock" class="h-3.5 w-3.5 shrink-0 text-red-600" label="Atrasada" />` : null}
          <span class="truncate">${D.formatRange(task.plannedStartTime, task.plannedEndTime)}</span>
        </span>
        <span class="block truncate text-slate-500">${(task.unit ? task.unit.code : task.listingName || "Sin unidad") + " · " + task.taskNumber}</span>
      </button>
      ${actual
        ? html`<span
            aria-hidden="true"
            class=${cx("absolute h-1 rounded-full", actual.done ? "bg-emerald-500" : "bg-blue-500")}
            style=${{ left: actual.left + "%", width: actual.width + "%", top: 4 + lane * LANE + (LANE - 10) + "px" }}
          ></span>`
        : null}`;
  }

  function AgendaView({ tasks, employees }) {
    const today = Coord.clock.today;
    const [day, setDay] = useState(today);
    const [showFree, setShowFree] = useState(false);

    const planned = tasks.filter((t) => t.phase !== "Cancelled" && t.plannedStartTime && t.plannedEndTime && D.ymdOf(t.plannedStartTime) === day);
    const unscheduled = tasks.filter((t) => D.isPending(t) && !t.plannedStartTime && D.taskDate(t) === day);
    const overlaps = D.findOverlaps(planned);
    const overdueCount = planned.filter((t) => D.isOverdue(t, Coord.clock.nowMs)).length;
    const overlapPairs = Math.round(Array.from(overlaps.values()).reduce((n, list) => n + list.length, 0) / 2);

    let startHour = 6;
    let endHour = 20;
    planned.forEach((t) => {
      startHour = Math.min(startHour, Math.floor(D.minutesOfDay(t.plannedStartTime) / 60));
      endHour = Math.max(endHour, Math.ceil(D.minutesOfDay(t.plannedEndTime) / 60));
    });
    const total = (endHour - startHour) * 60;
    const pct = (minutes) => Math.min(100, Math.max(0, ((minutes - startHour * 60) / total) * 100));
    const hours = [];
    for (let hNum = startHour; hNum <= endHour; hNum += 1) hours.push(hNum);
    const grid = {
      backgroundImage: "repeating-linear-gradient(to right, rgb(226 232 240) 0, rgb(226 232 240) 1px, transparent 1px, transparent calc(100% / " + (endHour - startHour) + "))",
    };

    const groups = useMemo(() => {
      const byEmployee = new Map();
      planned.forEach((t) => {
        const key = t.employee ? t.employee.id : "sin";
        if (!byEmployee.has(key)) byEmployee.set(key, []);
        byEmployee.get(key).push(t);
      });
      const teams = new Map();
      employees.forEach((e) => {
        const list = byEmployee.get(e.id) || [];
        if (!list.length && !showFree) return;
        const team = e.team ? e.team.name : "Sin equipo";
        if (!teams.has(team)) teams.set(team, []);
        teams.get(team).push({ employee: e, tasks: list });
      });
      const result = Array.from(teams.entries()).map(([team, rows]) => ({ team, rows }));
      if (byEmployee.has("sin")) result.push({ team: "Sin empleado", rows: [{ employee: null, tasks: byEmployee.get("sin") }] });
      return result;
    }, [tasks, employees, day, showFree]);

    const nowLeft = day === today ? pct(D.minutesOfDay(Coord.clock.nowIso)) : null;
    const pendingTotal = tasks.filter(D.isPending).length;

    return html`<div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <${U.Button} icon="ChevronLeft" aria-label="Día anterior" onClick=${() => setDay(D.addDays(day, -1))}></${U.Button}>
          <${U.Button} onClick=${() => setDay(today)} disabled=${day === today}>Hoy</${U.Button}>
          <${U.Button} icon="ChevronRight" aria-label="Día siguiente" onClick=${() => setDay(D.addDays(day, 1))}></${U.Button}>
          <input id="agenda-dia" type="date" aria-label="Día" class=${U.inputClass(false, "w-auto")} value=${day} onInput=${(e) => e.target.value && setDay(e.target.value)} />
          <p class="text-sm font-semibold text-slate-900">${D.formatLongDate(day)}</p>
        </div>
        <label class="inline-flex items-center gap-2 text-sm text-slate-700" for="agenda-libres">
          <input id="agenda-libres" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand" checked=${showFree} onChange=${(e) => setShowFree(e.target.checked)} />
          Mostrar empleados sin limpiezas
        </label>
      </div>

      <${U.Ann} tag="ui" note="Superposiciones y atrasos se calculan en la pantalla con el horario planificado.">
        <p class="text-sm text-slate-600">
          <strong class="tabular-nums text-slate-900">${planned.length}</strong>${planned.length === 1 ? " limpieza" : " limpiezas"}${" · "}<strong class=${cx("tabular-nums", overdueCount ? "text-red-700" : "text-slate-900")}>${overdueCount}</strong>${overdueCount === 1 ? " atrasada" : " atrasadas"}${" · "}<strong class=${cx("tabular-nums", overlapPairs ? "text-red-700" : "text-slate-900")}>${overlapPairs}</strong>${overlapPairs === 1 ? " superposición" : " superposiciones"}${" · "}<strong class="tabular-nums text-slate-900">${unscheduled.length}</strong>${" sin horario"}
        </p>
      </${U.Ann}>

      ${unscheduled.length
        ? html`<div class="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm">
            <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Sin horario</span>
            ${unscheduled.map(
              (t) => html`<button
                key=${t.id}
                type="button"
                onClick=${() => U.openTask(t.id, "editar")}
                class=${cx("inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-400 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-brand hover:text-brand", U.FOCUS)}
              >
                <span class="font-mono font-semibold">${t.taskNumber}</span><span>${U.placeLabel(t)}</span>
              </button>`
            )}
          </div>`
        : null}

      <${U.Card}
        bodyClass=""
        annotation=${{ tag: "ajuste", note: "La agenda necesita pedir las limpiezas por fecha planificada. Hoy /all?date filtra por GeneratedDate (el día en que se creó la tarjeta, en UTC)." }}
      >
        ${planned.length === 0
          ? html`<${U.EmptyState}
              icon="CalendarDays"
              title="No hay limpiezas planificadas para este día."
              action=${pendingTotal ? html`<${U.Button} onClick=${() => U.navigate("pendientes")}>Ver pendientes (${pendingTotal})</${U.Button}>` : null}
            />`
          : html`<div class="relative overflow-x-auto">
              <div class="min-w-[1000px]">
                <div class="flex border-b border-slate-200 bg-slate-50">
                  <div class="sticky left-0 z-20 w-56 shrink-0 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Empleado</div>
                  <div class="relative h-8 flex-1">
                    ${hours.map(
                      (hNum) => html`<span
                        key=${hNum}
                        class=${cx(
                          "absolute top-2 text-xs tabular-nums text-slate-500",
                          hNum === startHour ? "pl-1" : hNum === endHour ? "-translate-x-full pr-1" : "-translate-x-1/2"
                        )}
                        style=${{ left: pct(hNum * 60) + "%" }}
                      >${String(hNum).padStart(2, "0")}:00</span>`
                    )}
                    ${nowLeft !== null
                      ? html`<span class="absolute top-1 z-10 -translate-x-1/2 rounded bg-red-600 px-1 text-[10px] font-bold tabular-nums text-white" style=${{ left: nowLeft + "%" }}>
                          ${Coord.clock.nowHm}
                        </span>`
                      : null}
                  </div>
                </div>

                ${groups.map(
                  (group) => html`<div key=${group.team}>
                    <div class="sticky left-0 border-b border-slate-100 bg-white px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">${group.team}</div>
                    ${group.rows.map((row) => {
                      const { placed, laneCount } = assignLanes(row.tasks);
                      const minutes = row.tasks.reduce(
                        (sum, t) => sum + (Date.parse(t.plannedEndTime) - Date.parse(t.plannedStartTime)) / 60000,
                        0
                      );
                      return html`<div key=${row.employee ? row.employee.id : "sin"} class="flex border-b border-slate-100">
                        <div class="sticky left-0 z-20 w-56 shrink-0 bg-white px-4 py-3">
                          <p class="text-sm font-semibold text-slate-900">${row.employee ? D.formatEmployeeName(row.employee.name) : "Sin empleado"}</p>
                          <p class="text-xs text-slate-500">
                            ${row.tasks.length ? row.tasks.length + (row.tasks.length === 1 ? " limpieza" : " limpiezas") + " · " + D.formatDuration(minutes) : "Libre"}
                          </p>
                        </div>
                        <div class="relative flex-1" style=${Object.assign({ height: laneCount * LANE + 8 + "px" }, grid)}>
                          ${nowLeft !== null
                            ? html`<span aria-hidden="true" class="absolute inset-y-0 z-10 w-px bg-red-500" style=${{ left: nowLeft + "%" }}></span>`
                            : null}
                          ${placed.map(
                            ({ task, lane }) => html`<${Block} key=${task.id} task=${task} lane=${lane} pct=${pct} overlapping=${overlaps.has(task.id)} />`
                          )}
                        </div>
                      </div>`;
                    })}
                  </div>`
                )}
              </div>
            </div>`}
      </${U.Card}>

      <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span class="font-semibold text-slate-500">Leyenda:</span>
        ${["assigned", "inProgress", "paused", "review", "done"].map(
          (key) => html`<span key=${key} class=${cx(U.BADGE, U.LEVEL_BADGE[D.STATUS[key].level])}>${D.STATUS[key].label}</span>`
        )}
        <span class=${cx(U.BADGE, "bg-red-100 text-red-700")}>Atrasada</span>
        <span class=${cx(U.BADGE, "bg-white text-slate-700 ring-2 ring-red-400")}>Superposición</span>
        <span class="inline-flex items-center gap-1.5"><span class="h-1 w-6 rounded-full bg-blue-500"></span>Ejecución real</span>
      </div>
    </div>`;
  }

  function LimpiezasScreen({ token }) {
    const tasksQ = U.useApi(() => api.getAllTasks(), []);
    const employeesQ = U.useApi(() => api.listEmployees(), []);
    const tasks = tasksQ.data ? tasksQ.data.data : [];
    const employees = employeesQ.data ? employeesQ.data.data : [];
    const isAgenda = token === "agenda";

    return html`<div class="space-y-6">
      <${U.PageHeader}
        title="Limpiezas"
        subtitle="Todas las limpiezas, creadas por la sincronización o a mano."
        actions=${html`<${Tabs} active=${isAgenda ? "agenda" : "limpiezas"} />
          <${U.Button} variant="primary" icon="Plus" onClick=${() => U.navigate("nueva")}>Nueva limpieza</${U.Button}>`}
      />
      ${tasksQ.error && !tasksQ.data
        ? html`<${U.Card} bodyClass=""><${U.ErrorState} error=${tasksQ.error} onRetry=${tasksQ.reload} /></${U.Card}>`
        : !tasksQ.data || !employeesQ.data
          ? html`<${U.Card} bodyClass=""><${U.Skeleton} rows=${8} /></${U.Card}>`
          : isAgenda
            ? html`<${AgendaView} tasks=${tasks} employees=${employees} />`
            : html`<${TableView} tasks=${tasks} employees=${employees} />`}
    </div>`;
  }

  Coord.screens = Coord.screens || {};
  Coord.screens.limpiezas = {
    title: "Limpiezas",
    calls: ["getAllTasks", "getTaskDetail", "listEmployees"],
    Component: LimpiezasScreen,
  };
  Coord.screens.agenda = Coord.screens.limpiezas;
})();
