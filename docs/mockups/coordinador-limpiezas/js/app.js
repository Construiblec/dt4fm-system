/*
 * Coordinador de limpiezas — prototipo.
 * Armazón: menú lateral, barra superior, avisos, panel del prototipo y arranque.
 */
(() => {
  "use strict";

  const Coord = window.Coord;
  const { html, render, useState } = window.htmPreact;
  const D = Coord.domain;
  const U = Coord.ui;
  const api = Coord.api;
  const cx = U.cx;

  const ICONS = [
    "LayoutDashboard", "Inbox", "CalendarDays", "RefreshCw", "ListChecks", "CalendarCheck", "Plus", "Search", "X",
    "ChevronLeft", "ChevronRight", "ChevronDown", "ChevronUp", "TriangleAlert", "CircleCheck", "CirclePause", "Clock",
    "Play", "Link2Off", "FileSpreadsheet", "Upload", "Copy", "Trash2", "Pencil", "Ban", "History", "CircleAlert", "Info",
    "Menu", "ArrowUpDown", "ArrowUp", "ArrowDown", "Eye", "UserCheck", "Bell", "ClipboardList",
    "RotateCcw", "FlaskConical", "Minus", "CalendarClock", "FileText", "Save", "Paperclip", "Table",
  ];

  const NAV = [
    { token: "panel", label: "Panel", icon: "LayoutDashboard", screens: ["panel"] },
    { token: "pendientes", label: "Pendientes", icon: "Inbox", screens: ["pendientes"], counter: true },
    { token: "limpiezas", label: "Limpiezas", icon: "CalendarDays", screens: ["limpiezas", "agenda"] },
    { token: "sincronizacion", label: "Sincronización", icon: "RefreshCw", screens: ["sincronizacion"] },
    { token: "checklists", label: "Checklists", icon: "ListChecks", screens: ["checklists"] },
  ];

  const TAG_STYLE = {
    existe: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
    ajuste: "bg-amber-500/15 text-amber-200 ring-amber-400/40",
    propuesta: "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40",
    ui: "bg-slate-500/20 text-slate-200 ring-slate-400/40",
    supuesto: "bg-sky-500/15 text-sky-200 ring-sky-400/40",
  };
  const TAG_LABEL = { existe: "Existe", ajuste: "Ajuste", propuesta: "Propuesta", ui: "Solo UI", supuesto: "Supuesto" };

  // ───────────────────────────────────────────────────────────────────────────
  // Menú
  // ───────────────────────────────────────────────────────────────────────────

  function Sidebar({ pendingCount }) {
    const screen = U.useStore((s) => s.route.screen);
    return html`<div class="flex h-full flex-col bg-white">
      <div class="flex items-center gap-3 px-5 pb-4 pt-5">
        <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <${U.Icon} name="CalendarCheck" class="h-6 w-6" />
        </span>
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Construiblec</p>
          <p class="text-sm font-semibold leading-tight text-slate-900">Coordinación de limpiezas</p>
        </div>
      </div>

      <div class="px-5">
        <${U.Ann}
          tag="propuesta"
          inline=${true}
          note="El rol Coordinator no existe todavía en el repo: hay que declararlo en rolePalette (índigo provisional, ícono CalendarCheck, home /coordinador), en las rutas del frontend y en su propio conjunto de roles del backend (no en SUPERVISOR_ROLES)."
        >
          <span class="inline-flex items-center gap-2 rounded-full bg-indigo-50 py-1.5 pl-2.5 pr-3">
            <span class="h-2 w-2 rounded-full bg-indigo-600"></span>
            <span class="text-xs font-bold text-indigo-700">Coordinador de limpiezas</span>
          </span>
        </${U.Ann}>
      </div>

      <div class="px-4 pt-4">
        <${U.Button} variant="primary" icon="Plus" class="w-full" onClick=${() => U.navigate("nueva")}>Nueva limpieza</${U.Button}>
      </div>

      <nav class="mt-4 flex-1 space-y-1 overflow-y-auto px-3" aria-label="Secciones">
        ${NAV.map((item) => {
          const active = item.screens.indexOf(screen) !== -1;
          return html`<button
            key=${item.token}
            type="button"
            aria-current=${active ? "page" : undefined}
            onClick=${() => U.navigate(item.token)}
            class=${cx(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition",
              U.FOCUS,
              active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <${U.Icon} name=${item.icon} class=${cx("h-5 w-5", active ? "text-indigo-600" : "text-slate-400")} />
            <span class="flex-1 text-left">${item.label}</span>
            ${item.counter && pendingCount
              ? html`<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-800">${pendingCount}</span>`
              : null}
          </button>`;
        })}
      </nav>

      <div class="flex items-center gap-3 border-t border-slate-100 px-5 py-4">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">CD</span>
        <div class="min-w-0 text-xs">
          <p class="truncate font-semibold text-slate-800">Coordinador Demo</p>
          <p class="truncate font-mono text-slate-500">coordinador.demo</p>
        </div>
      </div>
    </div>`;
  }

  function TopBar() {
    const today = Coord.clock.today;
    return html`<header class="sticky top-[env(safe-area-inset-top,0px)] z-20 border-b border-slate-200 bg-gray-100/90 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          class=${cx("rounded-lg p-2 text-slate-600 hover:bg-white lg:hidden", U.FOCUS)}
          aria-label="Abrir menú"
          onClick=${() => U.store.set({ navOpen: true })}
        >
          <${U.Icon} name="Menu" class="h-5 w-5" />
        </button>
        <p class="truncate text-sm font-semibold text-slate-900 lg:hidden">Coordinación de limpiezas</p>
        <div class="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <${U.Icon} name="CalendarDays" class="h-4 w-4 text-slate-400" />
          <span>${D.formatLongDate(today)}</span>
        </div>
      </div>
    </header>`;
  }

  function MobileNav({ pendingCount }) {
    const open = U.useStore((s) => s.navOpen);
    U.useEscape(() => U.store.set({ navOpen: false }), open);
    if (!open) return null;
    return html`<div class="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
      <button type="button" class="absolute inset-0 bg-slate-950/40" aria-label="Cerrar menú" onClick=${() => U.store.set({ navOpen: false })}></button>
      <div class="relative h-full w-72 max-w-[85vw] shadow-2xl"><${Sidebar} pendingCount=${pendingCount} /></div>
    </div>`;
  }

  function InflightBar() {
    const inflight = U.useStore((s) => s.inflight);
    return html`<div class="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5">
      ${inflight > 0 ? html`<div class="h-full w-full animate-pulse bg-brand motion-reduce:animate-none"></div>` : null}
    </div>`;
  }

  function FlashBar() {
    const flash = U.useStore((s) => s.flash);
    if (!flash) return null;
    return html`<div class="mb-6">
      <${U.InlineAlert}
        tone=${flash.tone}
        action=${html`<button type="button" class=${cx("rounded-md p-1 opacity-70 hover:opacity-100", U.FOCUS)} aria-label="Cerrar aviso" onClick=${() => U.store.set({ flash: null })}>
          <${U.Icon} name="X" />
        </button>`}
      >
        ${flash.text}
      </${U.InlineAlert}>
    </div>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Panel del prototipo (fuera de la app que se está diseñando)
  // ───────────────────────────────────────────────────────────────────────────

  function Toggle({ id, checked, onChange, label, hint }) {
    return html`<label for=${id} class="flex cursor-pointer items-start gap-3">
      <span class="relative mt-0.5 inline-flex h-5 w-9 shrink-0">
        <input id=${id} type="checkbox" class="peer sr-only" checked=${checked} onChange=${(e) => onChange(e.target.checked)} />
        <span class="absolute inset-0 rounded-full bg-slate-600 transition peer-checked:bg-emerald-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-300"></span>
        <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4"></span>
      </span>
      <span class="min-w-0">
        <span class="block text-sm font-semibold text-white">${label}</span>
        ${hint ? html`<span class="block text-xs text-slate-400">${hint}</span>` : null}
      </span>
    </label>`;
  }

  function ProtoPanel({ screenDef }) {
    const collapsed = U.useStore((s) => s.panelCollapsed);
    const annotations = U.useStore((s) => s.annotations);
    const failNext = U.useStore((s) => s.failNext);
    const scenario = U.useStore((s) => s.scenario);
    U.useStore((s) => s.logVersion);

    const setCollapsed = (value) => {
      U.store.set({ panelCollapsed: value });
      U.savePrefs({ panelCollapsed: value });
    };

    const changeScenario = (id) => {
      Coord.data.setScenario(id);
      U.store.set({ scenario: id, flash: null });
      if (U.store.state.route.overlay) U.navigate(U.store.state.baseToken || "panel", { replace: true });
      const label = Coord.data.SCENARIOS.find((s) => s.id === id).label;
      U.flash("info", "Escenario del prototipo: " + label + ".");
    };

    const reset = () => {
      Coord.data.reset();
      if (U.store.state.route.overlay) U.navigate(U.store.state.baseToken || "panel", { replace: true });
      U.flash("info", "Datos de ejemplo reiniciados.");
    };

    if (collapsed) {
      return html`<button
        type="button"
        onClick=${() => setCollapsed(false)}
        class=${cx("fixed bottom-4 left-4 z-[60] inline-flex items-center gap-2 rounded-full border border-dashed border-slate-500 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-xl lg:left-[17rem]", U.FOCUS)}
      >
        <${U.Icon} name="FlaskConical" />Prototipo${annotations ? " · anotaciones" : ""}
      </button>`;
    }

    const catalog = Coord.data.API_CATALOG;
    const log = Coord.data.getCallLog();

    return html`<aside
      class="proto-panel fixed bottom-4 left-4 z-[60] flex max-h-[calc(100vh-2rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-dashed border-slate-500 bg-slate-900 text-slate-200 shadow-2xl lg:left-[17rem]"
      aria-label="Controles del prototipo"
    >
      <div class="flex items-center gap-2 border-b border-slate-700 px-4 py-3">
        <${U.Icon} name="FlaskConical" class="h-4 w-4 text-emerald-300" />
        <p class="flex-1 text-sm font-bold text-white">Prototipo · no conectado</p>
        <button type="button" class=${cx("rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white", U.FOCUS)} aria-label="Minimizar" onClick=${() => setCollapsed(true)}>
          <${U.Icon} name="Minus" />
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <p class="text-xs leading-relaxed text-slate-400">
          Datos de ejemplo relativos a hoy. Nada sale del navegador: ni openMAINT ni Hostaway.
        </p>

        <div class="space-y-1.5">
          <label for="proto-escenario" class="block text-xs font-semibold uppercase tracking-wide text-slate-400">Escenario</label>
          <select
            id="proto-escenario"
            value=${scenario}
            onChange=${(e) => changeScenario(e.target.value)}
            class="block w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
          >
            ${Coord.data.SCENARIOS.map((s) => html`<option key=${s.id} value=${s.id}>${s.label}</option>`)}
          </select>
        </div>

        <${Toggle}
          id="proto-anotaciones"
          checked=${annotations}
          onChange=${(v) => U.toggleAnnotations(v)}
          label="Anotaciones (tecla A)"
          hint="Marca qué existe hoy en el backend y qué haría falta construir."
        />
        <${Toggle}
          id="proto-error"
          checked=${failNext}
          onChange=${(v) => Coord.data.setFailNext(v)}
          label="Simular error en la próxima acción"
          hint="La próxima vez que guardes algo, el servidor responderá con error."
        />

        <button
          type="button"
          onClick=${reset}
          class=${cx("inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800", U.FOCUS)}
        >
          <${U.Icon} name="RotateCcw" />Reiniciar datos
        </button>

        ${annotations
          ? html`<div class="space-y-4 border-t border-slate-700 pt-4">
              <div class="flex flex-wrap gap-1.5">
                ${Object.keys(TAG_LABEL).map(
                  (tag) => html`<span key=${tag} class=${cx("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", TAG_STYLE[tag])}>${TAG_LABEL[tag]}</span>`
                )}
              </div>
              <p class="text-xs text-slate-400">Pasa el mouse (o el foco) sobre una etiqueta para leer el detalle.</p>

              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${screenDef.panelTitle || "Qué llama esta pantalla"}</p>
                <ul class="space-y-2">
                  ${(screenDef.calls || []).map((name) => {
                    const entry = catalog[name];
                    return html`<li key=${name} class="rounded-lg bg-slate-800/70 px-3 py-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class=${cx("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", TAG_STYLE[entry.tag])}>${TAG_LABEL[entry.tag]}</span>
                        <code class="font-mono text-[11px] text-white">${entry.method} ${entry.path}</code>
                      </div>
                      <p class="mt-1 text-xs leading-relaxed text-slate-400">${entry.note}</p>
                    </li>`;
                  })}
                </ul>
              </div>

              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Supuestos a validar</p>
                <ul class="list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-300">
                  ${Coord.data.ASSUMPTIONS.map((a) => html`<li key=${a}>${a}</li>`)}
                </ul>
              </div>

              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Últimas llamadas</p>
                ${log.length
                  ? html`<ul class="space-y-1 font-mono text-[11px]">
                      ${log.map(
                        (entry, i) => html`<li key=${i} class="flex items-center gap-2">
                          <span class=${entry.ok ? "text-emerald-300" : "text-red-300"}>${entry.ok ? "200" : entry.status}</span>
                          <span class="truncate text-slate-300">${entry.method} ${entry.path}</span>
                          <span class="ml-auto text-slate-500">${entry.ms} ms</span>
                        </li>`
                      )}
                    </ul>`
                  : html`<p class="text-xs text-slate-500">Todavía nada.</p>`}
              </div>
            </div>`
          : null}
      </div>
    </aside>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Armazón
  // ───────────────────────────────────────────────────────────────────────────

  function Shell() {
    const route = U.useStore((s) => s.route);
    const tasksQ = U.useApi(() => api.getAllTasks(), []);
    const pendingCount = tasksQ.data ? tasksQ.data.data.filter(D.isPending).length : null;
    const screenDef = Coord.screens[route.screen] || Coord.screens.panel;
    const Screen = screenDef.Component;

    // Con un panel lateral abierto, las anotaciones describen ese panel.
    const panelDef =
      route.overlay && route.overlay.type === "limpieza"
        ? { panelTitle: "Qué llama la ficha", calls: ["getTaskDetail", "updateTask", "cancelTask", "listEmployees", "listChecklists", "getBuildings", "getBuildingLocations"] }
        : screenDef;

    let overlay = null;
    if (route.overlay && route.overlay.type === "limpieza") {
      overlay = html`<${Coord.screens.TaskDrawer}
        key=${route.overlay.id + "-" + route.overlay.mode}
        id=${route.overlay.id}
        mode=${route.overlay.mode}
      />`;
    }

    return html`<div class="min-h-screen bg-gray-100 text-slate-900">
      <${InflightBar} />
      <a
        href="#contenido"
        class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow"
        onClick=${(e) => {
          e.preventDefault();
          const main = document.getElementById("contenido");
          if (main) main.focus();
        }}
      >
        Ir al contenido
      </a>
      <div class="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 lg:block"><${Sidebar} pendingCount=${pendingCount} /></div>
      <${MobileNav} pendingCount=${pendingCount} />
      <div class="lg:pl-64">
        <${TopBar} />
        <main id="contenido" tabindex="-1" class="mx-auto w-full max-w-[1440px] px-4 pb-32 pt-6 outline-none sm:px-6 lg:px-8">
          <${FlashBar} />
          <${Screen} key=${route.screen} token=${route.token} checklistId=${route.checklistId} />
        </main>
      </div>
      ${overlay}
      <${ProtoPanel} screenDef=${panelDef} />
    </div>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Arranque
  // ───────────────────────────────────────────────────────────────────────────

  const boot = () => {
    Coord.data.subscribe((event) => {
      if (event.type === "inflight") U.store.set({ inflight: event.count });
      else if (event.type === "change") U.store.set((s) => ({ dbVersion: s.dbVersion + 1 }));
      else if (event.type === "log") U.store.set((s) => ({ logVersion: s.logVersion + 1 }));
      else if (event.type === "fail-next") U.store.set({ failNext: event.value });
    });

    const fromLocation = () => U.applyToken(window.location.hash);
    window.addEventListener("popstate", fromLocation);
    window.addEventListener("hashchange", fromLocation);

    window.addEventListener("keydown", (event) => {
      if (event.key !== "a" && event.key !== "A") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const tag = target && target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (target && target.isContentEditable)) return;
      U.toggleAnnotations();
    });

    U.applyToken(window.location.hash || "panel");
    U.checkIcons(ICONS);

    const root = document.getElementById("app");
    root.textContent = "";
    render(html`<${Shell} />`, root);
  };

  boot();
})();
