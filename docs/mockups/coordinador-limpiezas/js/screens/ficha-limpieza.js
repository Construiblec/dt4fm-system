/*
 * Ficha de la limpieza (panel lateral) y el formulario que comparte con
 * "Nueva limpieza". Es la tarjeta CleaningTask de openMAINT vista por el
 * coordinador: edita lo que todavía no empezó; lo demás es de solo lectura.
 */
(() => {
  "use strict";

  const Coord = window.Coord;
  const { html, useState, useMemo } = window.htmPreact;
  const D = Coord.domain;
  const U = Coord.ui;
  const api = Coord.api;
  const cx = U.cx;

  // ───────────────────────────────────────────────────────────────────────────
  // Formulario (completar, editar o crear)
  // ───────────────────────────────────────────────────────────────────────────

  const NOTES = {
    description: "Hoy el PUT no escribe Description. En una limpieza manual la escribe el endpoint nuevo (POST /cleaning-tasks/manual).",
    checkout: "Hoy el PUT no escribe CheckoutDate. Hace falta para corregir un checkout que cambió en Hostaway. Solo se guarda la fecha, no la hora.",
    unit: "Hoy el backend nunca escribe Unit. Al sincronizar, la tarjeta llevará HostawayListingID y openMAINT la vincula si el listing tiene unidad. La unidad no es obligatoria.",
    schedule: "El PUT ya escribe PlannedStartTime y PlannedEndTime. La hora de checkout no se guarda: el horario lo pone el coordinador.",
    employee: "El PUT ya escribe Employee (hoy como texto: hay que pasarlo a número) y avisa al empleado (push cleaning.assigned). El listado de empleados de limpieza, sin proveedores, es propuesta.",
    checklist: "Hoy el PUT no escribe CleaningChecklist y no existe un listado de checklists. Si el checklist no tiene minutos, el empleado no tiene recordatorios.",
    observations: "El PUT ya escribe Observations.",
  };

  function TaskForm({ variant, task, employees, tasks, checklists, onSubmit, onCancel, submitLabel, inPage }) {
    const isNew = variant === "nueva";
    const today = Coord.clock.today;
    const source = task ? task.source : "Manual";
    const initialDate = task
      ? task.plannedStartTime
        ? D.ymdOf(task.plannedStartTime)
        : task.checkoutDate || today
      : today;

    const [description, setDescription] = useState(task ? task.description : "");
    const [checkoutDate, setCheckoutDate] = useState(task ? task.checkoutDate || "" : "");
    const [unitId, setUnitId] = useState(task && task.unit ? task.unit.id : null);
    const [date, setDate] = useState(initialDate);
    const [start, setStart] = useState(task && task.plannedStartTime ? D.hmOf(task.plannedStartTime) : "");
    const [end, setEnd] = useState(task && task.plannedEndTime ? D.hmOf(task.plannedEndTime) : "");
    const [checklistId, setChecklistId] = useState(task && task.checklist ? task.checklist.id : null);
    const [employeeId, setEmployeeId] = useState(task && task.employee ? task.employee.id : null);
    const [observations, setObservations] = useState(task ? task.taskObservations || "" : "");
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    const selfIds = task ? [task.id] : [];
    const startIso = date && start ? D.isoAt(date, start) : null;
    const endIso = date && end ? D.isoAt(date, end) : null;
    const chosenChecklist = (checklists || []).find((c) => c.id === checklistId) || null;
    const checklistSummary = chosenChecklist ? D.summarizeChecklist(chosenChecklist.activities) : null;
    const employee = (employees || []).find((e) => e.id === employeeId) || null;
    const conflicts = employeeId && startIso && endIso ? D.conflictsFor(employeeId, startIso, endIso, tasks || [], selfIds) : [];
    const employeeChanged = employeeId && (!task || !task.employee || task.employee.id !== employeeId);

    const duplicates = useMemo(() => {
      if (!isNew || !unitId || !date) return [];
      return (tasks || []).filter(
        (t) => t.phase !== "Cancelled" && t.unit && t.unit.id === unitId && D.taskDate(t) === date
      );
    }, [isNew, unitId, date, tasks]);

    const warnings = [];
    if (startIso && employeeId && Date.parse(startIso) < Coord.clock.nowMs) {
      warnings.push("El inicio ya pasó: la limpieza aparecerá como atrasada apenas la guardes.");
    }
    if (checkoutDate && date && date < checkoutDate) {
      warnings.push("La fecha planificada es anterior al checkout (" + D.formatDate(checkoutDate) + ").");
    }

    // Una pendiente se puede guardar a medias (por ejemplo, solo corregir el
    // checkout): sigue en Pendientes hasta tener empleado y horario. Una que ya
    // estaba asignada no puede perderlos: el backend no permite quitar el empleado.
    const partialAllowed = variant === "completar";
    const complete = Boolean(employeeId && date && start && end);

    const validate = () => {
      const next = {};
      if (!description.trim()) next.description = isNew ? "Describe la limpieza." : "La descripción no puede quedar vacía.";
      if (!isNew && source === "Hostaway" && !checkoutDate) next.checkoutDate = "Completa la fecha de checkout.";
      const scheduleRequired = !partialAllowed || start || end;
      if (scheduleRequired) {
        if (!date) next.date = "Completa la fecha.";
        if (!start) next.start = "Completa la hora de inicio.";
        if (!end) next.end = "Completa la hora de fin.";
      }
      if (start && end && end <= start) next.end = "El fin debe ser posterior al inicio.";
      if (variant === "editar" && !employeeId) next.employee = "Elige el empleado.";
      setErrors(next);
      return Object.keys(next).length === 0;
    };

    const submit = (event) => {
      event.preventDefault();
      setSubmitError(null);
      if (!validate()) return;

      let payload;
      if (isNew) {
        payload = {
          description: description.trim(),
          unitId: unitId || null,
          employeeId: employeeId || null,
          plannedStartTime: startIso,
          plannedEndTime: endIso,
          cleaningChecklistId: checklistId || null,
          observations: observations.trim() || null,
        };
      } else {
        payload = {};
        if (description.trim() !== task.description) payload.description = description.trim();
        if (source === "Hostaway" && checkoutDate !== task.checkoutDate) payload.checkoutDate = checkoutDate;
        if ((unitId || null) !== (task.unit ? task.unit.id : null)) payload.unitId = unitId || null;
        if (startIso !== task.plannedStartTime) payload.plannedStartTime = startIso;
        if (endIso !== task.plannedEndTime) payload.plannedEndTime = endIso;
        if (employeeChanged) payload.employeeId = employeeId;
        if ((checklistId || null) !== (task.checklist ? task.checklist.id : null)) payload.cleaningChecklistId = checklistId || null;
        if ((observations.trim() || null) !== (task.taskObservations || null)) payload.observations = observations.trim() || null;
      }

      setSubmitting(true);
      Promise.resolve(onSubmit(payload, { employee, startIso, endIso }))
        .catch((error) => setSubmitError(error.message || String(error)))
        .finally(() => setSubmitting(false));
    };

    const unitHint =
      task && !task.unit && task.hostawayListingId
        ? "El listing " + task.hostawayListingId + " no tiene una única unidad en openMAINT. Puedes dejarla vacía."
        : "Opcional.";

    return html`<form class="space-y-4" onSubmit=${submit} novalidate>
      <section class="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <${U.Field}
          label="Descripción"
          htmlFor="f-descripcion"
          required=${true}
          error=${errors.description}
          hint=${isNew ? "Lo que verá el equipo como título. Ejemplo: Limpieza profunda - Pradera, Suite I41." : null}
          annotation=${{ tag: "propuesta", note: NOTES.description }}
        >
          <input
            id="f-descripcion"
            class=${U.inputClass(errors.description)}
            value=${description}
            maxlength="200"
            onInput=${(e) => setDescription(e.target.value)}
          />
        </${U.Field}>

        ${!isNew && source === "Hostaway"
          ? html`<div class="grid gap-4 sm:grid-cols-2">
              <${U.Field}
                label="Fecha de checkout"
                htmlFor="f-checkout"
                required=${true}
                error=${errors.checkoutDate}
                hint="Corrígela si la reserva cambió en Hostaway."
                annotation=${{ tag: "propuesta", note: NOTES.checkout }}
              >
                <input id="f-checkout" type="date" class=${U.inputClass(errors.checkoutDate)} value=${checkoutDate} onInput=${(e) => setCheckoutDate(e.target.value)} />
              </${U.Field}>
              <div class="space-y-1.5 text-sm">
                <p class="font-semibold text-slate-700">Reserva de Hostaway</p>
                <p class="font-mono text-slate-900">${task.hostawayReservation}</p>
                <p class="text-xs text-slate-500">${task.listingName} · listing ${task.hostawayListingId}</p>
              </div>
            </div>`
          : null}
      </section>

      <section class="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <${U.Field} label="Unidad" htmlFor="f-unidad-edificio" hint=${unitHint} annotation=${{ tag: "propuesta", note: NOTES.unit }}>
          <${U.BuildingUnitPicker}
            idPrefix="f-unidad"
            unitId=${unitId}
            initialBuildingId=${task && task.unit ? task.unit.buildingId : null}
            onChange=${setUnitId}
          />
        </${U.Field}>
        ${duplicates.length
          ? html`<${U.InlineAlert} tone="warning">
              Esta unidad ya tiene ${duplicates.map((t) => t.taskNumber).join(", ")} ese día. Revisa que no sea la misma limpieza.
            </${U.InlineAlert}>`
          : null}
      </section>

      <section class="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <${U.Ann} tag="existe" note=${NOTES.schedule}>
          <div class="grid gap-4 sm:grid-cols-3">
            <${U.Field} label="Fecha" htmlFor="f-fecha" required=${true} error=${errors.date}>
              <input id="f-fecha" type="date" class=${U.inputClass(errors.date)} value=${date} onInput=${(e) => setDate(e.target.value)} />
            </${U.Field}>
            <${U.Field} label="Inicio" htmlFor="f-inicio" required=${true} error=${errors.start}>
              <input id="f-inicio" type="time" step="300" class=${U.inputClass(errors.start)} value=${start} onInput=${(e) => setStart(e.target.value)} />
            </${U.Field}>
            <${U.Field} label="Fin" htmlFor="f-fin" required=${true} error=${errors.end}>
              <input id="f-fin" type="time" step="300" class=${U.inputClass(errors.end)} value=${end} onInput=${(e) => setEnd(e.target.value)} />
            </${U.Field}>
          </div>
        </${U.Ann}>

        <${U.Field} label="Checklist" htmlFor="f-checklist" annotation=${{ tag: "propuesta", note: NOTES.checklist }}>
          <${U.ChecklistSelect} id="f-checklist" value=${checklistId} onChange=${setChecklistId} checklists=${checklists} />
        </${U.Field}>
        ${chosenChecklist
          ? html`<div class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <${U.ChecklistSummaryLine} rows=${chosenChecklist.activities} />
              ${checklistSummary.minutes === null
                ? html`<span class="text-xs text-amber-700">Sin minutos: el empleado no tendrá recordatorios.</span>`
                : null}
            </div>`
          : null}

        <${U.Field}
          label="Empleado"
          htmlFor="f-empleado"
          required=${!isNew}
          error=${errors.employee}
          hint=${isNew ? "Opcional. Si la dejas sin empleado, queda en Pendientes." : null}
          annotation=${{ tag: "existe", note: NOTES.employee }}
        >
          <${U.EmployeeSelect}
            id="f-empleado"
            value=${employeeId}
            onChange=${(value) => {
              setEmployeeId(value);
              setErrors((e) => Object.assign({}, e, { employee: null }));
            }}
            employees=${employees}
            tasks=${tasks}
            date=${date}
            startIso=${startIso}
            endIso=${endIso}
            excludeIds=${selfIds}
            invalid=${errors.employee}
            placeholder=${isNew ? "Sin empleado por ahora" : "Elige un empleado"}
          />
        </${U.Field}>
        ${conflicts.length
          ? html`<${U.Ann} tag="ui" note="La superposición se calcula en la pantalla. Solo avisa: no hay un máximo de limpiezas por empleado.">
              <${U.InlineAlert} tone="warning" title="Se superpone con otras limpiezas">
                ${U.employeeName(employee)} ya tiene
                ${conflicts.map((t, i) => html`${i ? ", " : " "}<strong>${t.taskNumber}</strong> de ${D.formatRange(t.plannedStartTime, t.plannedEndTime)}`)}.
                Puedes guardar igual.
              </${U.InlineAlert}>
            </${U.Ann}>`
          : null}
        ${warnings.map((w) => html`<${U.InlineAlert} key=${w} tone="warning">${w}</${U.InlineAlert}>`)}
      </section>

      <section class="rounded-2xl bg-white p-4 shadow-sm">
        <${U.Field} label="Observaciones para el equipo" htmlFor="f-observaciones" annotation=${{ tag: "existe", note: NOTES.observations }}>
          <textarea
            id="f-observaciones"
            rows="3"
            maxlength="500"
            class=${U.inputClass(false)}
            value=${observations}
            onInput=${(e) => setObservations(e.target.value)}
          ></textarea>
        </${U.Field}>
      </section>

      ${submitError ? html`<${U.InlineAlert} tone="error" title="No se pudo guardar.">${submitError}</${U.InlineAlert}>` : null}

      <div
        class=${inPage
          ? "sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl bg-white px-5 py-3 shadow-lg ring-1 ring-slate-200"
          : "sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-3"}
      >
        ${employeeChanged && employee
          ? html`<${U.Ann}
              tag=${isNew ? "propuesta" : "existe"}
              note=${isNew
                ? "Al crear con empleado, el endpoint nuevo debería avisarle igual que hoy lo hace el PUT."
                : "El aviso al empleado ya existe: se envía cuando el PUT cambia Employee."}
              inline=${true}
              class="mr-auto"
            >
              <span class="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <${U.Icon} name="Bell" class="h-3.5 w-3.5" />${U.employeeName(employee)} recibirá una notificación en su teléfono.
              </span>
            </${U.Ann}>`
          : null}
        <${U.Button} onClick=${onCancel} disabled=${submitting}>Cancelar</${U.Button}>
        <${U.Button} type="submit" variant="primary" loading=${submitting} disabled=${submitting}>
          ${submitting ? "Guardando…" : partialAllowed ? (complete ? "Asignar" : "Guardar sin asignar") : submitLabel}
        </${U.Button}>
      </div>
    </form>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Vista de solo lectura
  // ───────────────────────────────────────────────────────────────────────────

  const lastPause = (task) => {
    const entries = D.parseTeamLog(task.teamObservations).filter((e) => e.type === "pause");
    return entries.length ? entries[entries.length - 1] : null;
  };

  function StateBanner({ task }) {
    const who = U.employeeName(task.employee);
    if (task.phase === "Cancelled") {
      return html`<${U.InlineAlert} tone="error" icon="Ban" title="Cancelada">No aparece en la agenda y no se puede editar.</${U.InlineAlert}>`;
    }
    if (task.phase === "Reviewed") {
      return html`<${U.InlineAlert} tone="success" title="Revisada">Supervisión la aprobó. Solo lectura.</${U.InlineAlert}>`;
    }
    if (task.phase === "Completed") {
      return html`<${U.InlineAlert} tone="review" title="Completada">Espera la revisión de supervisión. Solo lectura.</${U.InlineAlert}>`;
    }
    if (task.phase === "InExecution") {
      return html`<${U.InlineAlert} tone="progress" title="En ejecución">
        ${who} empezó a las ${D.formatTime(task.actualStartTime)}. Solo lectura.
      </${U.InlineAlert}>`;
    }
    if (task.isPaused) {
      // htm recorta el salto de línea al inicio de cada texto: la frase se arma
      // completa para no perder los espacios entre partes.
      const pause = lastPause(task);
      const sentence =
        who +
        " la empezó a las " +
        D.formatTime(task.actualStartTime) +
        (pause ? " y la pausó a las " + pause.time : "") +
        (pause && pause.text ? ": «" + pause.text + "»" : ".") +
        " Lleva " +
        D.formatDuration(task.executionTime || 0) +
        " trabajados. Mientras esté en pausa no se puede editar ni reasignar.";
      return html`<${U.InlineAlert} tone="paused" title="En pausa">${sentence}</${U.InlineAlert}>`;
    }
    if (D.isReopened(task)) {
      return html`<${U.Ann} tag="supuesto" note="Supuesto a validar: una limpieza reabierta queda en manos de supervisión y el coordinador no la edita.">
        <${U.InlineAlert} tone="reopened" title="Reabierta por supervisión">La gestiona Supervisión de limpieza: el coordinador no la edita.</${U.InlineAlert}>
      </${U.Ann}>`;
    }
    return null;
  }

  function TeamLog({ text }) {
    const entries = D.parseTeamLog(text);
    if (!entries.length) return null;
    const LABEL = { pause: "Pausa", resume: "Reanudada", restart: "Reiniciada", note: "Nota" };
    const ICON = { pause: "CirclePause", resume: "Play", restart: "RotateCcw", note: "FileText" };
    const COLOR = { pause: "text-violet-600", resume: "text-blue-600", restart: "text-rose-600", note: "text-slate-500" };
    return html`<ol class="space-y-2">
      ${entries.map(
        (e, i) => html`<li key=${i} class="flex items-start gap-3 text-sm">
          <${U.Icon} name=${ICON[e.type]} class=${cx("mt-0.5 h-4 w-4 shrink-0", COLOR[e.type])} />
          <div class="min-w-0">
            <p class="font-semibold text-slate-800">
              ${LABEL[e.type]}${e.time ? html`<span class="ml-1 font-normal tabular-nums text-slate-500">${D.formatDayShort(e.date)} · ${e.time}</span>` : null}
              ${e.carryMinutes != null ? html`<span class="ml-1 font-normal text-slate-500">· ${e.carryMinutes} min previos</span>` : null}
            </p>
            ${e.text ? html`<p class="text-slate-600">${e.text}</p>` : null}
          </div>
        </li>`
      )}
    </ol>`;
  }

  function Section({ title, children, annotation }) {
    const body = html`<section class="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h3 class="text-sm font-semibold text-slate-900">${title}</h3>
      ${children}
    </section>`;
    return annotation ? html`<${U.Ann} tag=${annotation.tag} note=${annotation.note}>${body}</${U.Ann}>` : body;
  }

  function TaskView({ task, employees }) {
    const [showChecklist, setShowChecklist] = useState(false);
    const today = Coord.clock.today;
    const fullEmployee = task.employee ? (employees || []).find((e) => e.id === task.employee.id) : null;

    const programacion = [
      {
        label: "Unidad",
        value: task.unit
          ? U.unitLabel(task.unit) + " (" + task.unit.code + ")"
          : task.hostawayListingId
            ? "Sin unidad: el listing no tiene una única unidad en openMAINT"
            : null,
        annotation: { tag: "propuesta", note: NOTES.unit },
      },
      task.source === "Hostaway"
        ? {
            label: "Listing de Hostaway",
            value: task.listingName + " · " + task.hostawayListingId,
            annotation: { tag: "propuesta", note: "Atributo nuevo HostawayListingID en CleaningTask = listingMapId de la reserva. La sincronización debe enviarlo al crear la tarjeta (hoy lo descarta)." },
          }
        : null,
      task.source === "Hostaway"
        ? { label: "Reserva de Hostaway", value: html`<span class="font-mono">${task.hostawayReservation}</span>`, annotation: { tag: "existe", note: "HostawayReservation. Es la llave para no duplicar al sincronizar." } }
        : null,
      task.source === "Hostaway"
        ? { label: "Fecha de checkout", value: D.formatDate(task.checkoutDate) + " (" + D.relativeDay(task.checkoutDate, today) + ")", annotation: { tag: "existe", note: "CheckoutDate: solo la fecha." } }
        : null,
      {
        label: task.source === "Hostaway" ? "Sincronizada el" : "Creada el",
        value: D.formatDate(task.generatedDate),
        annotation: { tag: "existe", note: "GeneratedDate: el día en que se creó la tarjeta (el backend lo calcula en UTC)." },
      },
      { label: "Horario planificado", value: task.plannedStartTime ? U.plannedLabel(task) : null },
      {
        label: "Empleado",
        value: task.employee ? U.employeeName(task.employee) + (fullEmployee && fullEmployee.team ? " · " + fullEmployee.team.name : "") : null,
      },
      {
        label: "Checklist",
        value: task.checklistDetail
          ? html`${task.checklistDetail.templateName}<br /><span class="text-xs text-slate-500"><${U.ChecklistSummaryLine} rows=${task.checklistDetail.activities} /></span>`
          : null,
      },
      { label: "Observaciones", value: task.taskObservations, wide: true },
    ];

    const executed = task.actualStartTime
      ? [
          { label: "Inicio real", value: D.formatDayShort(D.ymdOf(task.actualStartTime)) + " · " + D.formatTime(task.actualStartTime) },
          { label: "Fin real", value: task.actualEndTime ? D.formatTime(task.actualEndTime) : task.phase === "InExecution" ? "En curso" : null },
          { label: "Tiempo trabajado", value: task.executionTime != null ? D.formatDuration(task.executionTime) : null },
          { label: "Retraso al empezar", value: task.delayTime != null ? (task.delayTime > 0 ? D.formatDuration(task.delayTime) : "Sin retraso") : null },
        ]
      : null;

    return html`<div class="space-y-4">
      <${StateBanner} task=${task} />

      <${Section} title="Programación">
        <${U.Details} items=${programacion} />
      </${Section}>

      ${executed
        ? html`<${Section} title="Ejecución" annotation=${{ tag: "existe", note: "ActualStartTime, ActualEndTime, ExecutionTime y DelayTime: los escribe la app del empleado." }}>
            <${U.Details} items=${executed} />
          </${Section}>`
        : null}

      ${task.teamObservations
        ? html`<${Section} title="Bitácora del equipo" annotation=${{ tag: "existe", note: "TeamObservations, con las marcas [Pausado: …], [Reanudado: …] y [Reiniciado: …] que escribe la app del empleado." }}>
            <${TeamLog} text=${task.teamObservations} />
          </${Section}>`
        : null}

      ${task.supervisionObserv
        ? html`<${Section} title="Supervisión" annotation=${{ tag: "existe", note: "SupervisionObserv." }}>
            <p class="rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900">${task.supervisionObserv}</p>
          </${Section}>`
        : null}

      ${task.phase === "Cancelled"
        ? html`<${Section} title="Motivo de cancelación" annotation=${{ tag: "propuesta", note: "El motivo se guarda en Notes, pero hoy ningún endpoint lo devuelve." }}>
            <p class="text-sm text-slate-700">${task.cancelReason || "Sin motivo registrado."}</p>
          </${Section}>`
        : null}

      ${task.checklistDetail
        ? html`<${Section} title="Checklist">
            <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
              <span>${task.checklistDetail.templateName}</span>
              <${U.Button} size="sm" variant="ghost" icon=${showChecklist ? "ChevronUp" : "ChevronDown"} onClick=${() => setShowChecklist(!showChecklist)}>
                ${showChecklist ? "Ocultar actividades" : "Ver actividades"}
              </${U.Button}>
            </div>
            ${showChecklist ? html`<${U.ChecklistPreview} rows=${task.checklistDetail.activities} />` : null}
          </${Section}>`
        : null}
    </div>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cancelar
  // ───────────────────────────────────────────────────────────────────────────

  function CancelModal({ task, onClose, onDone }) {
    const [reason, setReason] = useState("");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const confirm = () => {
      if (!reason.trim()) {
        setError("Escribe el motivo de la cancelación.");
        return;
      }
      setBusy(true);
      setError(null);
      api
        .cancelTask(task.id, { reason: reason.trim() })
        .then(() => {
          U.flash("success", task.taskNumber + " quedó cancelada.");
          onDone();
        })
        .catch((e) => setError(e.message))
        .finally(() => setBusy(false));
    };

    return html`<${U.Modal}
      title=${"Cancelar " + task.taskNumber}
      onClose=${onClose}
      footer=${html`<${U.Button} onClick=${onClose} disabled=${busy}>Volver</${U.Button}>
        <${U.Button} variant="danger" loading=${busy} disabled=${busy} onClick=${confirm}>Cancelar limpieza</${U.Button}>`}
    >
      <p>La limpieza pasará a <strong>Cancelada</strong> y dejará de aparecer en la agenda. Esto no se puede deshacer desde esta pantalla.</p>
      <${U.Field} label="Motivo" htmlFor="motivo-cancelacion" required=${true} error=${error}>
        <textarea
          id="motivo-cancelacion"
          rows="3"
          maxlength="500"
          class=${U.inputClass(Boolean(error))}
          placeholder="Ejemplo: la reserva se canceló en Hostaway."
          value=${reason}
          onInput=${(e) => setReason(e.target.value)}
        ></textarea>
      </${U.Field}>
      <${U.Ann} tag="ajuste" note="PATCH /cleaning-tasks/:taskId/cancel ya existe con motivo obligatorio, pero solo para supervisión. Hay que habilitarlo para Coordinator.">
        <p class="text-xs text-slate-500">El motivo queda guardado en la tarjeta.</p>
      </${U.Ann}>
    </${U.Modal}>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Panel lateral
  // ───────────────────────────────────────────────────────────────────────────

  function TaskDrawer({ id, mode }) {
    const detailQ = U.useApi(() => api.getTaskDetail(id), [id]);
    const tasksQ = U.useApi(() => api.getAllTasks(), []);
    const employeesQ = U.useApi(() => api.listEmployees(), []);
    const checklistsQ = U.useApi(() => api.listChecklists(), []);
    const [editing, setEditing] = useState(mode === "editar");
    const [cancelOpen, setCancelOpen] = useState(false);

    const task = detailQ.data;
    const pending = task ? D.isPending(task) : false;
    const editable = task ? D.canEdit(task) : false;
    const employees = employeesQ.data ? employeesQ.data.data : [];
    const tasks = tasksQ.data ? tasksQ.data.data : [];
    const checklists = checklistsQ.data ? checklistsQ.data.data : [];
    const formReady = task && employeesQ.data && tasksQ.data && checklistsQ.data;

    const save = (payload, context) =>
      api.updateTask(task.id, payload).then((result) => {
        if (pending) {
          if (context.employee && context.startIso && context.endIso) {
            U.flash(
              "success",
              task.taskNumber + " asignada a " + U.employeeName(context.employee) + " · " + D.formatDayShort(D.ymdOf(context.startIso)) + ", " + D.formatRange(context.startIso, context.endIso) + "."
            );
          } else {
            const missing = [!context.employee && "empleado", !context.startIso && "horario"].filter(Boolean).join(" y ");
            U.flash("info", "Cambios guardados en " + task.taskNumber + ". Sigue en Pendientes: le falta " + missing + ".");
          }
          U.closeOverlay();
        } else {
          U.flash("success", "Cambios guardados en " + task.taskNumber + "." + (result.notified ? " Se avisó a " + D.formatEmployeeName(result.notified) + "." : ""));
          setEditing(false);
        }
      });

    let title = "Limpieza";
    if (task) title = task.description;

    const eyebrow = task
      ? html`<span class="font-mono text-slate-700">${task.taskNumber}</span>
          <${U.SourceBadge} source=${task.source} />
          <span>${task.source === "Hostaway" ? "Sincronizada" : "Creada"} ${D.relativeDay(task.generatedDate, Coord.clock.today)}</span>`
      : null;

    const footer =
      task && !editing
        ? html`<div class="flex flex-wrap items-center justify-between gap-3">
            ${editable
              ? html`<${U.Button} variant="ghost" icon="Ban" class="text-red-700 hover:bg-red-50" onClick=${() => setCancelOpen(true)}>Cancelar limpieza</${U.Button}>`
              : html`<span class="text-xs text-slate-500">Solo lectura: ${D.STATUS[D.statusKey(task)].label.toLowerCase()}.</span>`}
            <div class="flex gap-2">
              <${U.Button} onClick=${U.closeOverlay}>Cerrar</${U.Button}>
              ${editable
                ? html`<${U.Button} variant="primary" icon=${pending ? "UserCheck" : "Pencil"} onClick=${() => setEditing(true)}>
                    ${pending ? "Completar" : "Editar"}
                  </${U.Button}>`
                : null}
            </div>
          </div>`
        : null;

    let body;
    if (detailQ.error && !task) {
      body = html`<${U.ErrorState} error=${detailQ.error} onRetry=${detailQ.reload} title="No se pudo abrir la limpieza." />`;
    } else if (!task) {
      body = html`<${U.Skeleton} rows=${6} />`;
    } else if (editing && editable) {
      body = formReady
        ? html`<${TaskForm}
            key=${task.id}
            variant=${pending ? "completar" : "editar"}
            task=${task}
            employees=${employees}
            tasks=${tasks}
            checklists=${checklists}
            submitLabel=${pending ? "Asignar" : "Guardar cambios"}
            onSubmit=${save}
            onCancel=${() => (mode === "editar" && pending ? U.closeOverlay() : setEditing(false))}
          />`
        : html`<${U.Skeleton} rows=${6} />`;
    } else {
      body = html`<${TaskView} task=${task} employees=${employees} />`;
    }

    return html`<${U.Drawer}
        title=${task && editing && editable ? (pending ? "Completar: " : "Editar: ") + title : title}
        eyebrow=${eyebrow}
        badges=${task ? html`<${U.StatusBadges} task=${task} pill=${true} />` : null}
        onClose=${U.closeOverlay}
        footer=${footer}
      >
        ${body}
      </${U.Drawer}>
      ${cancelOpen && task
        ? html`<${CancelModal}
            task=${task}
            onClose=${() => setCancelOpen(false)}
            onDone=${() => {
              setCancelOpen(false);
              U.closeOverlay();
            }}
          />`
        : null}`;
  }

  Coord.screens = Coord.screens || {};
  Coord.screens.TaskDrawer = TaskDrawer;
  Coord.screens.TaskForm = TaskForm;
})();
