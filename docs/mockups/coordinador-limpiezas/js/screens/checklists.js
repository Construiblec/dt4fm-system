/*
 * Checklists (CleaningActivity en openMAINT). El coordinador los crea y edita
 * como en openMAINT: la ficha tiene Nombre de checklist, Código, Descripción,
 * Detalle y el archivo Plantilla (CSV) como un campo más. Si hay archivo, el
 * equipo ve el archivo; si no, el Detalle.
 */
(() => {
  "use strict";

  const Coord = window.Coord;
  const { html, useState, useEffect } = window.htmPreact;
  const D = Coord.domain;
  const U = Coord.ui;
  const api = Coord.api;
  const cx = U.cx;

  const FILE_MESSAGES = {
    empty: "El archivo está vacío.",
    "too-big": "El archivo pesa más de 1 MB.",
    "no-rows": "El archivo no tiene ninguna fila con contenido.",
  };
  const BINARY_MESSAGES = {
    "xlsx/ods": "El archivo es un Excel (.xlsx u .ods), no un CSV. En Excel usa «Guardar como» y elige «CSV (delimitado por comas)».",
    xls: "El archivo es un Excel antiguo (.xls), no un CSV. Guárdalo como «CSV (delimitado por comas)».",
    pdf: "El archivo es un PDF, no un CSV.",
  };

  const readMessage = (result) => (result.code === "binary" ? BINARY_MESSAGES[result.label] : FILE_MESSAGES[result.code]) || result.reason;

  const inUse = (tasks, checklistId) =>
    tasks.filter(
      (t) => t.checklist && t.checklist.id === checklistId && (t.phase === "InExecution" || (t.phase === "Assigned" && !t.actualStartTime) || t.isPaused)
    );

  function MinutesCell({ summary }) {
    if (summary.minutes === null) {
      return html`<${U.Chip} title="El asistente de voz no hará recordatorios con este checklist.">Sin minutos · sin recordatorios</${U.Chip}>`;
    }
    return html`<span class="inline-flex flex-wrap items-center gap-1.5">
      <span class="tabular-nums text-slate-900">${D.describeChecklistMinutes(summary)}</span>
      ${summary.isPartial ? html`<${U.Chip} tone="amber">Minutos parciales</${U.Chip}>` : null}
    </span>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Lista
  // ───────────────────────────────────────────────────────────────────────────

  function ChecklistList() {
    const listQ = U.useApi(() => api.listChecklists(), []);
    const tasksQ = U.useApi(() => api.getAllTasks(), []);
    const [example, setExample] = useState(false);
    const items = U.checklistSummaries(listQ.data ? listQ.data.data : []);
    const tasks = tasksQ.data ? tasksQ.data.data : [];

    return html`<div class="space-y-6">
      <${U.PageHeader}
        title="Checklists"
        subtitle="Las actividades que el equipo sigue en cada limpieza. Cada limpieza lleva un checklist como un campo más."
        actions=${html`<${U.Button} icon="FileSpreadsheet" onClick=${() => setExample(true)}>Ver ejemplo de CSV</${U.Button}>
          <${U.Button} variant="primary" icon="Plus" onClick=${() => U.navigate("checklist-nuevo")}>Nuevo checklist</${U.Button}>`}
      />

      <${U.Card}
        bodyClass=""
        annotation=${{ tag: "propuesta", note: "No existe un listado: hoy el backend solo lee un CleaningActivity por id, desde la limpieza (GET /cleaning-tasks/checklists sería nuevo)." }}
      >
        ${listQ.error && !listQ.data
          ? html`<${U.ErrorState} error=${listQ.error} onRetry=${listQ.reload} />`
          : !listQ.data
            ? html`<${U.Skeleton} rows=${3} />`
            : items.length === 0
              ? html`<${U.EmptyState}
                  icon="ListChecks"
                  title="Aún no hay checklists."
                  action=${html`<${U.Button} variant="primary" icon="Plus" onClick=${() => U.navigate("checklist-nuevo")}>Nuevo checklist</${U.Button}>`}
                >
                  Crea el primero subiendo el CSV que ya usan los supervisores (Titulo, Actividad, Minutos) o escribiendo el Detalle.
                </${U.EmptyState}>`
              : html`<div class="relative overflow-x-auto">
                  <table class="min-w-full text-sm">
                    <thead class="bg-slate-50">
                      <tr>
                        <th scope="col" class=${U.TH}>Nombre de checklist</th>
                        <th scope="col" class=${U.TH}>Código</th>
                        <th scope="col" class=${cx(U.TH, "text-right")}>Secciones</th>
                        <th scope="col" class=${cx(U.TH, "text-right")}>Actividades</th>
                        <th scope="col" class=${U.TH}>Tiempo estimado</th>
                        <th scope="col" class=${U.TH}>Plantilla</th>
                        <th scope="col" class=${U.TH}>
                          <${U.Ann} tag="ui" inline=${true} note="Se cuenta en la pantalla con el checklist de cada limpieza (que hoy el listado no devuelve).">En uso</${U.Ann}>
                        </th>
                        <th scope="col" class=${U.TH}><span class="sr-only">Acción</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${items.map((c) => {
                        const using = inUse(tasks, c.id).length;
                        return html`<tr key=${c.id} class="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick=${() => U.navigate("checklist-" + c.id)}>
                          <td class=${U.TD}>
                            <p class="font-semibold text-slate-900">${c.templateName}</p>
                            ${c.description ? html`<p class="max-w-xs truncate text-xs text-slate-500" title=${c.description}>${c.description}</p>` : null}
                          </td>
                          <td class=${cx(U.TD, "font-mono text-slate-700")}>${c.code || "—"}</td>
                          <td class=${cx(U.TD, "text-right tabular-nums")}>${c.summary.sectionCount}</td>
                          <td class=${cx(U.TD, "text-right tabular-nums")}>${c.summary.activityCount}</td>
                          <td class=${U.TD}><${MinutesCell} summary=${c.summary} /></td>
                          <td class=${U.TD}>
                            ${c.plantilla
                              ? html`<span class="inline-flex items-center gap-1.5 text-slate-700">
                                    <${U.Icon} name="Paperclip" class="h-3.5 w-3.5 text-slate-400" />${c.plantilla.fileName}
                                  </span>
                                  <p class="text-xs text-slate-500">${D.ENCODING_LABELS[c.plantilla.encoding] || "No se pudo leer"}</p>`
                              : html`<span class="text-slate-500">Solo Detalle</span>`}
                          </td>
                          <td class=${cx(U.TD, "tabular-nums text-slate-700")}>${using ? using + (using === 1 ? " limpieza" : " limpiezas") : html`<span class="text-slate-400">—</span>`}</td>
                          <td class=${cx(U.TD, "text-right")}>
                            <${U.Button} size="sm" icon="Pencil" onClick=${(e) => {
                              e.stopPropagation();
                              U.navigate("checklist-" + c.id);
                            }}>Editar</${U.Button}>
                          </td>
                        </tr>`;
                      })}
                    </tbody>
                  </table>
                </div>`}
      </${U.Card}>

      <${U.InlineAlert} tone="neutral" title="Minutos y recordatorios">
        El asistente de voz del empleado avisa cuando se cumplen los minutos de cada actividad. Si una actividad no tiene minutos, no hay recordatorio para ella.
      </${U.InlineAlert}>

      ${example
        ? html`<${U.CopyTextModal}
            title="Ejemplo de CSV para un checklist"
            note="Columnas Titulo, Actividad y Minutos; separador coma o punto y coma. En el prototipo se copia el texto; en la app sería una descarga .csv."
            text=${Coord.data.EXAMPLE_CSV}
            onClose=${() => setExample(false)}
          />`
        : null}
    </div>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Ficha (crear / editar)
  // ───────────────────────────────────────────────────────────────────────────

  function ChecklistEditor({ id }) {
    const isNew = id === "nuevo";
    const detailQ = U.useApi(() => (isNew ? Promise.resolve(null) : api.getChecklist(id)), [id]);

    const [loadedId, setLoadedId] = useState(null);
    const [templateName, setTemplateName] = useState("");
    const [code, setCode] = useState("");
    const [description, setDescription] = useState("");
    const [detalle, setDetalle] = useState("");
    const [plantilla, setPlantilla] = useState(null);
    const [fileError, setFileError] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [viewing, setViewing] = useState(false);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    const loadBytes = (fileName, bytes) => {
      const read = D.readCsvTemplate(bytes);
      if (!read.ok) {
        setFileError(readMessage(read));
        return;
      }
      setFileError(null);
      setPlantilla({ fileName, bytes, size: bytes.length, encoding: read.encoding, rows: read.rows });
      setErrors((e) => Object.assign({}, e, { content: null }));
    };

    // Carga inicial de la ficha existente.
    useEffect(() => {
      const data = detailQ.data;
      if (!data || loadedId === data.id) return;
      setLoadedId(data.id);
      setTemplateName(data.templateName || "");
      setCode(data.code || "");
      setDescription(data.description || "");
      setDetalle(data.detalle || "");
      if (data.plantilla && data.plantillaBytes) {
        const bytes = data.plantillaBytes instanceof Uint8Array ? data.plantillaBytes : new Uint8Array(data.plantillaBytes);
        loadBytes(data.plantilla.fileName, bytes);
      } else {
        setPlantilla(null);
      }
    }, [detailQ.data]);

    const onFile = (file) => {
      if (!file) return;
      if (file.size > D.MAX_TEMPLATE_BYTES) {
        setFileError(FILE_MESSAGES["too-big"]);
        return;
      }
      file.arrayBuffer().then((buffer) => loadBytes(file.name, new Uint8Array(buffer)));
    };

    const rows = plantilla ? plantilla.rows : D.detalleToRows(detalle);
    const summary = D.summarizeChecklist(rows);
    const lint = D.lintChecklist(rows);

    const save = () => {
      setSubmitError(null);
      const next = {};
      if (!templateName.trim()) next.templateName = "Escribe el nombre del checklist.";
      if (rows.length === 0 || summary.activityCount === 0) next.content = "Agrega actividades en el Detalle o sube el archivo de la plantilla.";
      setErrors(next);
      if (Object.keys(next).length) return;
      setSaving(true);
      api
        .saveChecklist({
          id: isNew ? null : Number(id),
          code,
          description,
          templateName,
          detalle,
          plantilla: plantilla ? { fileName: plantilla.fileName, bytes: plantilla.bytes } : null,
        })
        .then((result) => {
          U.flash("success", (result.created ? "Checklist creado: " : "Checklist guardado: ") + templateName.trim() + ".");
          U.navigate("checklists");
        })
        .catch((error) => setSubmitError(error.message))
        .finally(() => setSaving(false));
    };

    if (!isNew && detailQ.error && !detailQ.data) {
      return html`<div class="space-y-6">
        <${U.Button} variant="ghost" icon="ChevronLeft" onClick=${() => U.navigate("checklists")}>Checklists</${U.Button}>
        <${U.Card} bodyClass=""><${U.ErrorState} error=${detailQ.error} onRetry=${detailQ.reload} /></${U.Card}>
      </div>`;
    }

    const loading = !isNew && (!detailQ.data || loadedId !== detailQ.data.id);

    return html`<div class="space-y-6">
      <div class="space-y-2">
        <${U.Button} variant="ghost" size="sm" icon="ChevronLeft" onClick=${() => U.navigate("checklists")}>Checklists</${U.Button}>
        <${U.PageHeader}
          title=${isNew ? "Nuevo checklist" : templateName || "Checklist"}
          subtitle=${isNew ? "Sube el CSV que ya usan los supervisores o escribe el Detalle." : "Los cambios se ven en todas las limpiezas que usan este checklist."}
        />
      </div>

      ${loading
        ? html`<${U.Card} bodyClass=""><${U.Skeleton} rows=${6} /></${U.Card}>`
        : html`<div class="grid gap-6 lg:grid-cols-12">
            <div class="min-w-0 space-y-4 lg:col-span-5">
              <${U.Card}
                title="Ficha del checklist"
                subtitle="Los mismos campos que CleaningActivity en openMAINT."
                annotation=${{ tag: "propuesta", note: "No existe endpoint para crear ni editar (POST/PUT /cleaning-tasks/checklists, multipart con el archivo Plantilla). Los campos son los de CleaningActivity: NombrePlantilla, Code, Description, Detalle y Plantilla." }}
              >
                <div class="space-y-4">
                  <${U.Field} label="Nombre de checklist" htmlFor="chk-nombre" required=${true} error=${errors.templateName}>
                    <input id="chk-nombre" class=${U.inputClass(errors.templateName)} value=${templateName} maxlength="120" onInput=${(e) => setTemplateName(e.target.value)} />
                  </${U.Field}>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <${U.Field} label="Código" htmlFor="chk-codigo" hint="Opcional. Ejemplo: CHK-STD.">
                      <input id="chk-codigo" class=${U.inputClass(false, "font-mono")} value=${code} maxlength="40" onInput=${(e) => setCode(e.target.value)} />
                    </${U.Field}>
                    <${U.Field} label="Descripción" htmlFor="chk-descripcion" hint="Opcional.">
                      <input id="chk-descripcion" class=${U.inputClass(false)} value=${description} maxlength="200" onInput=${(e) => setDescription(e.target.value)} />
                    </${U.Field}>
                  </div>

                  <div class="space-y-1.5">
                    <p class="text-sm font-semibold text-slate-700">Plantilla (archivo CSV)</p>
                    ${plantilla
                      ? html`<div class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <${U.Icon} name="FileSpreadsheet" class="h-5 w-5 text-emerald-600" />
                          <div class="min-w-0 flex-1 text-sm">
                            <p class="truncate font-semibold text-slate-900">${plantilla.fileName}</p>
                            <p class="text-xs text-slate-500">
                              ${D.formatBytes(plantilla.size)} · ${D.ENCODING_LABELS[plantilla.encoding]} · separador «${lint.delimiter}» · ${plantilla.rows.length} filas
                            </p>
                          </div>
                          <${U.Button} size="sm" icon="Eye" onClick=${() => setViewing(true)}>Ver contenido</${U.Button}>
                          <${U.Button} size="sm" variant="ghost" icon="Trash2" onClick=${() => setPlantilla(null)}>Quitar</${U.Button}>
                        </div>`
                      : null}
                    <label
                      for="chk-archivo"
                      onDragOver=${(e) => {
                        e.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave=${() => setDragging(false)}
                      onDrop=${(e) => {
                        e.preventDefault();
                        setDragging(false);
                        onFile(e.dataTransfer.files && e.dataTransfer.files[0]);
                      }}
                      class=${cx(
                        "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition",
                        dragging ? "border-brand bg-brand/5" : "border-slate-300 bg-white hover:border-brand"
                      )}
                    >
                      <${U.Icon} name="Upload" class="h-5 w-5 text-slate-400" />
                      <span class="font-semibold text-slate-700">${plantilla ? "Reemplazar archivo" : "Arrastra aquí el archivo CSV o haz clic para elegirlo"}</span>
                      <span class="text-xs text-slate-500">Columnas Titulo, Actividad, Minutos · separador coma o punto y coma · máximo 1 MB</span>
                      <input
                        id="chk-archivo"
                        type="file"
                        accept=".csv,.txt,text/csv"
                        class="sr-only"
                        onChange=${(e) => {
                          onFile(e.target.files && e.target.files[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    ${fileError
                      ? html`<${U.Ann} tag="existe" note="Mismos rechazos que readCsvTemplate del backend: archivo vacío, más de 1 MB, Excel o PDF, o sin filas.">
                          <${U.InlineAlert} tone="error">${fileError}</${U.InlineAlert}>
                        </${U.Ann}>`
                      : null}
                  </div>

                  <${U.Field}
                    label="Detalle (solo si no hay un CSV cargado)"
                    htmlFor="chk-detalle"
                    error=${errors.content}
                    hint=${plantilla ? "Hay archivo: el equipo verá el archivo y este texto se ignora." : "Una actividad por línea: Titulo,Actividad,Minutos."}
                    annotation=${{ tag: "existe", note: "El backend ya lee el checklist así: si el archivo Plantilla se puede leer, gana el archivo; si no, parte el Detalle por líneas." }}
                  >
                    <textarea
                      id="chk-detalle"
                      rows="8"
                      class=${U.inputClass(errors.content, cx("font-mono text-xs leading-relaxed", plantilla && "opacity-60"))}
                      value=${detalle}
                      placeholder=${"Titulo,Actividad,Minutos\nDormitorio,Tender la cama con juego limpio,8"}
                      onInput=${(e) => setDetalle(e.target.value)}
                    ></textarea>
                  </${U.Field}>
                </div>
              </${U.Card}>
            </div>

            <div class="min-w-0 lg:col-span-7">
              <div class="space-y-4 lg:sticky lg:top-20">
                <${U.Card}
                  title="Así lo verá el equipo de limpieza"
                  subtitle=${html`<${U.ChecklistSummaryLine} rows=${rows} /> · ${plantilla ? "desde el archivo" : "desde el Detalle"}`}
                  annotation=${{ tag: "existe", note: "Mismo parser que la app del empleado (cleaningChecklistUtils.ts), copiado sin cambios." }}
                >
                  <div class="max-h-[60vh] overflow-y-auto pr-1"><${U.ChecklistPreview} rows=${rows} /></div>
                </${U.Card}>
              </div>
            </div>
          </div>`}

      ${submitError ? html`<${U.InlineAlert} tone="error" title="No se pudo guardar.">${submitError}</${U.InlineAlert}>` : null}

      <div class="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl bg-white px-5 py-3 shadow-lg ring-1 ring-slate-200">
        <${U.Button} onClick=${() => U.navigate("checklists")} disabled=${saving}>Cancelar</${U.Button}>
        <${U.Button} variant="primary" icon="Save" loading=${saving} disabled=${saving || loading} onClick=${save}>
          ${saving ? "Guardando…" : "Guardar checklist"}
        </${U.Button}>
      </div>

      ${viewing && plantilla
        ? html`<${U.CopyTextModal}
            title=${plantilla.fileName}
            note="Filas tal como las lee el backend (ya decodificadas)."
            text=${plantilla.rows.join("\n")}
            onClose=${() => setViewing(false)}
          />`
        : null}
    </div>`;
  }

  function ChecklistsScreen({ checklistId }) {
    return checklistId ? html`<${ChecklistEditor} key=${checklistId} id=${checklistId} />` : html`<${ChecklistList} />`;
  }

  Coord.screens = Coord.screens || {};
  Coord.screens.checklists = {
    title: "Checklists",
    calls: ["listChecklists", "getChecklist", "saveChecklist", "getAllTasks"],
    Component: ChecklistsScreen,
  };
})();
