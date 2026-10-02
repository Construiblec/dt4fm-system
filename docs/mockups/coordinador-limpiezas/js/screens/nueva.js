/*
 * Nueva limpieza (manual): para lo que no viene de Hostaway. La tarjeta nace con
 * Source Manual y fase Asignada; sin empleado queda en Pendientes.
 */
(() => {
  "use strict";

  const Coord = window.Coord;
  const { html, useState } = window.htmPreact;
  const D = Coord.domain;
  const U = Coord.ui;
  const api = Coord.api;

  function NuevaScreen() {
    const tasksQ = U.useApi(() => api.getAllTasks(), []);
    const employeesQ = U.useApi(() => api.listEmployees(), []);
    const checklistsQ = U.useApi(() => api.listChecklists(), []);
    const [created, setCreated] = useState(null);
    const [formKey, setFormKey] = useState(0);

    const ready = tasksQ.data && employeesQ.data && checklistsQ.data;

    const submit = (payload, context) =>
      api.createManualTask(payload).then((result) => {
        setCreated({
          taskId: result.taskId,
          taskNumber: result.taskNumber,
          employee: context.employee,
          startIso: context.startIso,
          endIso: context.endIso,
        });
        window.scrollTo(0, 0);
      });

    const again = () => {
      setCreated(null);
      setFormKey((k) => k + 1);
    };

    return html`<div class="mx-auto max-w-3xl space-y-6">
      <${U.PageHeader}
        title="Nueva limpieza"
        subtitle="Para limpiezas que no vienen de Hostaway: limpiezas profundas, repasos o pedidos del propietario."
      />

      ${created
        ? html`<${U.Card}>
            <div class="space-y-4">
              <${U.InlineAlert} tone="success" title=${"Limpieza " + created.taskNumber + " creada."}>
                ${created.employee
                  ? "Asignada a " + U.employeeName(created.employee) + " · " + D.formatDayShort(D.ymdOf(created.startIso)) + ", " + D.formatRange(created.startIso, created.endIso) + "."
                  : "Quedó en Pendientes porque no tiene empleado."}
              </${U.InlineAlert}>
              <div class="flex flex-wrap gap-2">
                <${U.Button} icon="Eye" onClick=${() => U.openTask(created.taskId)}>Ver ficha</${U.Button}>
                ${created.employee
                  ? html`<${U.Button} icon="CalendarDays" onClick=${() => U.navigate("agenda")}>Ver en la agenda</${U.Button}>`
                  : html`<${U.Button} icon="Inbox" onClick=${() => U.navigate("pendientes")}>Ir a Pendientes</${U.Button}>`}
                <${U.Button} variant="primary" icon="Plus" onClick=${again}>Crear otra</${U.Button}>
              </div>
            </div>
          </${U.Card}>`
        : html`<div class="space-y-4">
            <${U.Ann}
              tag="propuesta"
              note="No existe todavía: POST /cleaning-tasks/manual. Crea la tarjeta con Source Manual (el valor existe en el backend pero nunca se usa), fase Asignada y GeneratedDate de hoy. Base: el DTO create-manual-cleaning-task.dto.ts sin trackear, con empleado y unidad opcionales."
            >
              <div class="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
                <span class="text-slate-600">La tarjeta se crea con</span>
                <${U.Chip} tone="outline">Origen: Manual</${U.Chip}>
                <${U.Chip} tone="amber">Fase: Asignada</${U.Chip}>
                <${U.Chip}>Sin reserva de Hostaway</${U.Chip}>
              </div>
            </${U.Ann}>
            <${U.Ann} tag="supuesto" note="Supuesto a validar: obligatorios la descripción, la fecha y el horario. Unidad, empleado y checklist son opcionales.">
              ${ready
                ? html`<${Coord.screens.TaskForm}
                    key=${formKey}
                    variant="nueva"
                    task=${null}
                    employees=${employeesQ.data.data}
                    tasks=${tasksQ.data.data}
                    checklists=${checklistsQ.data.data}
                    submitLabel="Crear limpieza"
                    inPage=${true}
                    onSubmit=${submit}
                    onCancel=${() => U.navigate("limpiezas")}
                  />`
                : html`<${U.Card} bodyClass=""><${U.Skeleton} rows=${6} /></${U.Card}>`}
            </${U.Ann}>
          </div>`}
    </div>`;
  }

  Coord.screens = Coord.screens || {};
  Coord.screens.nueva = {
    title: "Nueva limpieza",
    calls: ["createManualTask", "getBuildings", "getBuildingLocations", "listEmployees", "listChecklists"],
    Component: NuevaScreen,
  };
})();
