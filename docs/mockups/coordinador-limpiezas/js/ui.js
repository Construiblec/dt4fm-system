/*
 * Coordinador de limpiezas — prototipo.
 * Estado global, router, acceso a la API y componentes compartidos.
 * Preact + htm, solo hooks y className: la idea es que pasar esto a TSX en la
 * app sea mecánico. Ojo al portar: acá los textos usan onInput.
 */
(() => {
  "use strict";

  const Coord = window.Coord;
  const { html, h, useState, useEffect, useMemo, useRef } = window.htmPreact;
  const D = Coord.domain;

  // ───────────────────────────────────────────────────────────────────────────
  // Preferencias del visitante (solo comodidades; nunca datos)
  // ───────────────────────────────────────────────────────────────────────────

  const PREFS_KEY = "coordinador-limpiezas-prototipo";
  const loadPrefs = () => {
    try {
      return JSON.parse(window.localStorage.getItem(PREFS_KEY)) || {};
    } catch (error) {
      return {};
    }
  };
  const savePrefs = (patch) => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(Object.assign(loadPrefs(), patch)));
    } catch (error) {
      /* sin almacenamiento: se sigue sin recordar */
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Store
  // ───────────────────────────────────────────────────────────────────────────

  const prefs = loadPrefs();

  const store = {
    state: {
      route: { token: "panel", screen: "panel", overlay: null, checklistId: null },
      baseToken: "panel",
      dbVersion: 0,
      logVersion: 0,
      inflight: 0,
      annotations: Boolean(prefs.annotations),
      panelCollapsed: Boolean(prefs.panelCollapsed),
      failNext: false,
      scenario: "normal",
      navOpen: false,
      flash: null,
    },
    listeners: new Set(),
    set(patch) {
      const next = typeof patch === "function" ? patch(this.state) : patch;
      this.state = Object.assign({}, this.state, next);
      this.listeners.forEach((listener) => listener());
    },
  };

  /** Suscribe el componente a una parte del estado. El selector debe devolver valores estables. */
  function useStore(selector) {
    const [, force] = useState(0);
    const selectorRef = useRef(selector);
    selectorRef.current = selector;
    const valueRef = useRef();
    valueRef.current = selector(store.state);

    useEffect(() => {
      const listener = () => {
        const next = selectorRef.current(store.state);
        if (!Object.is(next, valueRef.current)) {
          valueRef.current = next;
          force((n) => n + 1);
        }
      };
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    }, []);

    return valueRef.current;
  }

  /**
   * Llama a la API simulada y vuelve a llamar cuando cambian los datos. Mientras
   * recarga conserva lo último que tenía, para que la pantalla no parpadee.
   */
  function useApi(fn, deps) {
    const version = useStore((s) => s.dbVersion);
    const [state, setState] = useState({ loading: true, data: undefined, error: null });
    const [nonce, setNonce] = useState(0);
    const fnRef = useRef(fn);
    fnRef.current = fn;

    useEffect(() => {
      let alive = true;
      setState((s) => (s.loading ? s : Object.assign({}, s, { loading: true })));
      fnRef.current().then(
        (data) => {
          if (alive) setState({ loading: false, data, error: null });
        },
        (error) => {
          if (alive) setState((s) => ({ loading: false, data: s.data, error }));
        }
      );
      return () => {
        alive = false;
      };
    }, [version, nonce].concat(deps || []));

    return {
      loading: state.loading,
      data: state.data,
      error: state.error,
      reload: () => setNonce((n) => n + 1),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Router por hash. Solo tokens simples (letras, números y guiones): es lo único
  // que una página publicada deja pasar en el enlace.
  // ───────────────────────────────────────────────────────────────────────────

  const SCREEN_TOKENS = ["panel", "pendientes", "limpiezas", "agenda", "sincronizacion", "checklists", "nueva"];

  const parseToken = (raw) => {
    const token = String(raw || "").replace(/^#/, "");
    let match;
    if (SCREEN_TOKENS.indexOf(token) !== -1) return { token, screen: token, overlay: null, checklistId: null };
    if ((match = /^limpieza-(\d+)(-editar)?$/.exec(token))) {
      return { token, screen: null, overlay: { type: "limpieza", id: Number(match[1]), mode: match[2] ? "editar" : "ver" }, checklistId: null };
    }
    if ((match = /^checklist-(\d+)$/.exec(token))) return { token, screen: "checklists", overlay: null, checklistId: Number(match[1]) };
    if (token === "checklist-nuevo") return { token, screen: "checklists", overlay: null, checklistId: "nuevo" };
    return { token: "panel", screen: "panel", overlay: null, checklistId: null };
  };

  const applyToken = (raw) => {
    const parsed = parseToken(raw);
    store.set((s) => {
      if (parsed.overlay) {
        const fallback = "limpiezas";
        const base = parseToken(s.baseToken && s.route.token !== parsed.token ? s.baseToken : fallback);
        return {
          route: { token: parsed.token, screen: base.screen, overlay: parsed.overlay, checklistId: base.checklistId },
          baseToken: s.baseToken || fallback,
          navOpen: false,
        };
      }
      return { route: parsed, baseToken: parsed.token, navOpen: false };
    });
  };

  let overlayFromApp = false;

  const navigate = (token, options) => {
    const opts = options || {};
    try {
      if (opts.replace) window.history.replaceState(null, "", "#" + token);
      else if (window.location.hash !== "#" + token) window.history.pushState(null, "", "#" + token);
    } catch (error) {
      /* marco sin historial: se navega solo con el estado */
    }
    applyToken(token);
    if (!parseToken(token).overlay && !opts.keepScroll) window.scrollTo(0, 0);
  };

  const openOverlay = (token) => {
    overlayFromApp = true;
    navigate(token);
  };

  const closeOverlay = () => {
    const base = store.state.baseToken || "panel";
    if (overlayFromApp) {
      overlayFromApp = false;
      const before = store.state.route.token;
      try {
        window.history.back();
      } catch (error) {
        /* sigue abajo */
      }
      // Si el historial no respondió (marco bloqueado), se cierra igual.
      setTimeout(() => {
        if (store.state.route.token === before && store.state.route.overlay) navigate(base, { replace: true });
      }, 120);
      return;
    }
    navigate(base, { replace: true });
  };

  const openTask = (id, mode) => openOverlay("limpieza-" + id + (mode === "editar" ? "-editar" : ""));

  // ───────────────────────────────────────────────────────────────────────────
  // Avisos arriba del contenido (la app no tiene toasts: son cajas en línea)
  // ───────────────────────────────────────────────────────────────────────────

  let flashTimer = null;
  const flash = (tone, text, action) => {
    clearTimeout(flashTimer);
    store.set({ flash: { id: Date.now(), tone, text, action: action || null } });
    flashTimer = setTimeout(() => store.set({ flash: null }), 10000);
  };

  const toggleAnnotations = (value) => {
    const next = value === undefined ? !store.state.annotations : Boolean(value);
    store.set({ annotations: next });
    savePrefs({ annotations: next });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Íconos (lucide, mismos que usa la app con lucide-react)
  // ───────────────────────────────────────────────────────────────────────────

  const missingIcons = new Set();

  function Icon({ name, class: cls, label }) {
    const node = (window.lucide && (window.lucide[name] || (window.lucide.icons && window.lucide.icons[name]))) || null;
    if (!node) {
      if (!missingIcons.has(name)) {
        missingIcons.add(name);
        console.warn("[prototipo] falta el ícono", name);
      }
      return null;
    }
    return h(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        class: cls || "h-4 w-4",
        "aria-hidden": label ? undefined : "true",
        role: label ? "img" : undefined,
        "aria-label": label,
      },
      node.map((child, index) => h(child[0], Object.assign({ key: index }, child[1])))
    );
  }

  const checkIcons = (names) => {
    const missing = names.filter((name) => !(window.lucide && (window.lucide[name] || window.lucide.icons[name])));
    if (missing.length) console.error("[prototipo] íconos inexistentes en lucide:", missing.join(", "));
    return missing;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Estilos compartidos (misma geometría que la app: statusPalette.ts)
  // ───────────────────────────────────────────────────────────────────────────

  const cx = (...parts) => parts.filter(Boolean).join(" ");

  const BADGE = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap";
  const PILL = "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap";

  const LEVEL_BADGE = {
    pending: "bg-slate-100 text-slate-700",
    assigned: "bg-amber-100 text-amber-700",
    inProgress: "bg-blue-100 text-blue-700",
    paused: "bg-violet-100 text-violet-700",
    review: "bg-indigo-100 text-indigo-700",
    done: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
  };
  const LEVEL_BORDER = {
    pending: "border-slate-400",
    assigned: "border-amber-500",
    inProgress: "border-blue-500",
    paused: "border-violet-500",
    review: "border-indigo-500",
    done: "border-emerald-500",
    cancelled: "border-red-400",
  };
  const LEVEL_BAR = {
    pending: "bg-slate-400",
    assigned: "bg-amber-500",
    inProgress: "bg-blue-500",
    paused: "bg-violet-500",
    review: "bg-indigo-500",
    done: "bg-emerald-500",
    cancelled: "bg-red-400",
  };

  const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

  const BUTTON = {
    primary: "bg-brand text-white shadow-sm hover:bg-brand-hover",
    secondary: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
    danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  };
  const BUTTON_SIZE = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  };

  function Button({ variant = "secondary", size = "md", icon, iconRight, loading, class: cls, children, type = "button", ...rest }) {
    return html`<button
      type=${type}
      class=${cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        FOCUS,
        BUTTON[variant],
        BUTTON_SIZE[size],
        cls
      )}
      ...${rest}
    >
      ${loading ? html`<${Spinner} />` : icon ? html`<${Icon} name=${icon} class=${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />` : null}
      ${children}
      ${iconRight ? html`<${Icon} name=${iconRight} class="h-4 w-4" />` : null}
    </button>`;
  }

  function Spinner({ class: cls }) {
    return html`<span
      class=${cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none", cls)}
      aria-hidden="true"
    ></span>`;
  }

  const INPUT_BASE =
    "block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
  const inputClass = (invalid, extra) =>
    cx(INPUT_BASE, invalid ? "border-red-400 focus:border-red-500" : "border-slate-300 focus:border-brand", extra);

  function Field({ label, htmlFor, required, hint, error, children, class: cls, annotation }) {
    const labelNode = html`<label for=${htmlFor} class="block text-sm font-semibold text-slate-700">
      ${label}${required ? html`<span class="text-red-600" aria-hidden="true"> *</span>` : null}
    </label>`;
    return html`<div class=${cx("min-w-0 space-y-1.5", cls)}>
      ${annotation ? html`<${Ann} tag=${annotation.tag} note=${annotation.note} inline=${true}>${labelNode}</${Ann}>` : labelNode}
      ${children}
      ${error
        ? html`<p class="text-xs font-medium text-red-600">${error}</p>`
        : hint
          ? html`<p class="text-xs text-slate-500">${hint}</p>`
          : null}
    </div>`;
  }

  function Card({ title, subtitle, actions, children, class: cls, bodyClass, annotation, id }) {
    const header =
      title || actions
        ? html`<div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div class="min-w-0">
              ${title ? html`<h2 class="text-base font-semibold text-slate-900">${title}</h2>` : null}
              ${subtitle ? html`<p class="mt-0.5 text-sm text-slate-500">${subtitle}</p>` : null}
            </div>
            ${actions ? html`<div class="flex flex-wrap items-center gap-2">${actions}</div>` : null}
          </div>`
        : null;
    const content = html`<section id=${id} class=${cx("min-w-0 rounded-2xl bg-white shadow-sm", cls)}>
      ${header}
      <div class=${bodyClass === undefined ? "px-5 py-4" : bodyClass}>${children}</div>
    </section>`;
    return annotation ? html`<${Ann} tag=${annotation.tag} note=${annotation.note}>${content}</${Ann}>` : content;
  }

  function PageHeader({ title, subtitle, actions }) {
    return html`<div class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">${title}</h1>
        ${subtitle ? html`<p class="mt-1 max-w-3xl text-sm text-slate-600">${subtitle}</p>` : null}
      </div>
      ${actions ? html`<div class="flex flex-wrap items-center gap-2">${actions}</div>` : null}
    </div>`;
  }

  const TONES = {
    info: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: "Info", iconClass: "text-sky-600" },
    success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "CircleCheck", iconClass: "text-emerald-600" },
    warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: "TriangleAlert", iconClass: "text-amber-600" },
    error: { box: "border-red-200 bg-red-50 text-red-900", icon: "CircleAlert", iconClass: "text-red-600" },
    neutral: { box: "border-slate-200 bg-slate-50 text-slate-800", icon: "Info", iconClass: "text-slate-500" },
    paused: { box: "border-violet-200 bg-violet-50 text-violet-900", icon: "CirclePause", iconClass: "text-violet-600" },
    reopened: { box: "border-rose-200 bg-rose-50 text-rose-900", icon: "RotateCcw", iconClass: "text-rose-600" },
    review: { box: "border-indigo-200 bg-indigo-50 text-indigo-900", icon: "ClipboardList", iconClass: "text-indigo-600" },
    progress: { box: "border-blue-200 bg-blue-50 text-blue-900", icon: "Play", iconClass: "text-blue-600" },
  };

  function InlineAlert({ tone = "info", title, children, action, icon, class: cls }) {
    const t = TONES[tone] || TONES.info;
    return html`<div class=${cx("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", t.box, cls)} role=${tone === "error" ? "alert" : "status"}>
      <${Icon} name=${icon || t.icon} class=${cx("mt-0.5 h-4 w-4 shrink-0", t.iconClass)} />
      <div class="min-w-0 flex-1 space-y-1">
        ${title ? html`<p class="font-semibold">${title}</p>` : null}
        ${children ? html`<div class="leading-relaxed">${children}</div>` : null}
      </div>
      ${action ? html`<div class="shrink-0">${action}</div>` : null}
    </div>`;
  }

  function EmptyState({ icon = "ClipboardList", title, children, action }) {
    return html`<div class="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span class="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500"><${Icon} name=${icon} class="h-6 w-6" /></span>
      <p class="text-base font-semibold text-slate-900">${title}</p>
      ${children ? html`<p class="max-w-md text-sm text-slate-600">${children}</p>` : null}
      ${action || null}
    </div>`;
  }

  function Skeleton({ rows = 4 }) {
    return html`<div class="space-y-3 px-5 py-4" aria-busy="true" aria-label="Cargando">
      ${Array.from({ length: rows }).map(
        (_, i) => html`<div key=${i} class="h-9 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none"></div>`
      )}
    </div>`;
  }

  function ErrorState({ error, onRetry, title }) {
    return html`<div class="px-5 py-4">
      <${InlineAlert}
        tone="error"
        title=${title || "No se pudo cargar esta información."}
        action=${onRetry ? html`<${Button} size="sm" icon="RotateCcw" onClick=${onRetry}>Reintentar</${Button}>` : null}
      >
        ${error && error.message}
      </${InlineAlert}>
    </div>`;
  }

  function Chip({ tone = "slate", icon, children, title, wrap }) {
    const tones = {
      slate: "bg-slate-100 text-slate-700",
      amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
      blue: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
      red: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
      emerald: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
      indigo: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
      outline: "border border-slate-300 bg-white text-slate-600",
    };
    return html`<span class=${cx(wrap ? BADGE.replace("whitespace-nowrap", "whitespace-normal") : BADGE, tones[tone] || tones.slate)} title=${title}>
      ${icon ? html`<${Icon} name=${icon} class="h-3.5 w-3.5" />` : null}${children}
    </span>`;
  }

  function StatusBadges({ task, pill }) {
    const key = D.statusKey(task);
    const status = D.STATUS[key];
    const shape = pill ? PILL : BADGE;
    const overdue = D.overdueMinutes(task, Coord.clock.nowMs);
    return html`<span class="inline-flex flex-wrap items-center gap-1.5">
      <span class=${cx(shape, LEVEL_BADGE[status.level])}>${status.label}</span>
      ${D.isReopened(task) ? html`<span class=${cx(shape, "bg-rose-100 text-rose-700")}>Reabierta</span>` : null}
      ${overdue > 0 ? html`<span class=${cx(shape, "bg-red-100 text-red-700")}>Atrasada ${D.formatDuration(overdue)}</span>` : null}
    </span>`;
  }

  function SourceBadge({ source }) {
    return source === "Manual"
      ? html`<span class=${cx(BADGE, "border border-slate-300 bg-white text-slate-600")}>Manual</span>`
      : html`<span class=${cx(BADGE, "bg-slate-100 text-slate-700")}>Hostaway</span>`;
  }

  function Segmented({ options, value, onChange, label }) {
    return html`<div role="tablist" aria-label=${label} class="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-white p-1 shadow-sm">
      ${options.map(
        (o) => html`<button
          key=${o.value}
          type="button"
          role="tab"
          aria-selected=${o.value === value ? "true" : "false"}
          onClick=${() => onChange(o.value)}
          class=${cx(
            "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
            FOCUS,
            o.value === value ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          ${o.label}${o.count != null ? html`<span class="ml-1.5 tabular-nums opacity-70">${o.count}</span>` : null}
        </button>`
      )}
    </div>`;
  }

  const TH = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
  const TD = "px-4 py-3 align-top";

  function SortHeader({ label, sortKey, sort, onSort, class: cls }) {
    const active = sort.key === sortKey;
    return html`<th scope="col" class=${cx(TH, cls)} aria-sort=${active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick=${() => onSort(sortKey)} class=${cx("inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900", FOCUS)}>
        ${label}<${Icon} name=${active ? (sort.dir === "asc" ? "ArrowUp" : "ArrowDown") : "ArrowUpDown"} class="h-3.5 w-3.5" />
      </button>
    </th>`;
  }

  /** Orden por columna: primer clic descendente para fechas y creación (lo más nuevo arriba). */
  function useSort(initial) {
    const [sort, setSort] = useState(initial);
    const onSort = (key) =>
      setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
    return [sort, onSort];
  }

  const compareBy = (sort, getters) => (a, b) => {
    const get = getters[sort.key];
    const va = get(a);
    const vb = get(b);
    let result;
    if (va == null && vb == null) result = 0;
    else if (va == null) result = 1;
    else if (vb == null) result = -1;
    else result = va < vb ? -1 : va > vb ? 1 : 0;
    if (va != null && vb != null && sort.dir === "desc") result = -result;
    return result || b.id - a.id;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Anotaciones: qué existe hoy en el backend y qué haría falta construir
  // ───────────────────────────────────────────────────────────────────────────

  const ANN_TAGS = {
    existe: "Existe",
    ajuste: "Ajuste",
    propuesta: "Propuesta",
    ui: "Solo UI",
    supuesto: "Supuesto",
  };

  function Ann({ tag, note, inline, class: cls, children }) {
    const on = useStore((s) => s.annotations);
    const Tag = inline ? "span" : "div";
    if (!on) return html`<${Tag} class=${cls}>${children}</${Tag}>`;
    return html`<${Tag} class=${cx("ann", "ann-" + tag, inline && "inline-block", cls)}>
      ${children}
      <span class="ann-label" tabindex="0" data-note=${note || ""}>${ANN_TAGS[tag] || tag}</span>
    </${Tag}>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Paneles
  // ───────────────────────────────────────────────────────────────────────────

  function useEscape(onEscape, enabled = true) {
    const ref = useRef(onEscape);
    ref.current = onEscape;
    useEffect(() => {
      if (!enabled) return undefined;
      const onKey = (event) => {
        if (event.key === "Escape") ref.current(event);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [enabled]);
  }

  function useBodyLock() {
    useEffect(() => {
      document.body.classList.add("overflow-hidden");
      return () => document.body.classList.remove("overflow-hidden");
    }, []);
  }

  function Drawer({ title, eyebrow, badges, onClose, width = "max-w-[600px]", children, footer, headerActions }) {
    const panelRef = useRef(null);
    useBodyLock();
    useEffect(() => {
      if (panelRef.current) panelRef.current.focus();
    }, []);
    useEscape((event) => {
      if (document.querySelector("[data-modal-open]")) return;
      event.preventDefault();
      onClose();
    });

    return html`<div class="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label=${title}>
      <button type="button" class="absolute inset-0 cursor-default bg-slate-950/40" aria-label="Cerrar" onClick=${onClose}></button>
      <section ref=${panelRef} tabindex="-1" class=${cx("relative flex h-full w-full flex-col bg-gray-50 shadow-2xl outline-none", width)}>
        <header class="flex items-start gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div class="min-w-0 flex-1 space-y-1">
            ${eyebrow ? html`<div class="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">${eyebrow}</div>` : null}
            <h2 class="text-lg font-bold leading-snug text-slate-900 [text-wrap:balance]">${title}</h2>
            ${badges ? html`<div class="flex flex-wrap items-center gap-2 pt-1">${badges}</div>` : null}
          </div>
          ${headerActions ? html`<div class="flex shrink-0 flex-wrap items-center gap-2">${headerActions}</div>` : null}
          <button type="button" onClick=${onClose} class=${cx("shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100", FOCUS)} aria-label="Cerrar">
            <${Icon} name="X" class="h-5 w-5" />
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">${children}</div>
        ${footer ? html`<footer class="border-t border-slate-200 bg-white px-5 py-3">${footer}</footer>` : null}
      </section>
    </div>`;
  }

  function Modal({ title, children, footer, onClose, width = "max-w-md" }) {
    const ref = useRef(null);
    useEffect(() => {
      const first = ref.current && ref.current.querySelector("textarea, input, select, button");
      if (first) first.focus();
    }, []);
    useEscape((event) => {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    });
    return html`<div data-modal-open="true" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4" role="dialog" aria-modal="true" aria-label=${title}>
      <div ref=${ref} class=${cx("w-full rounded-2xl bg-white p-6 shadow-xl", width)}>
        <h2 class="text-lg font-bold text-slate-900 [text-wrap:balance]">${title}</h2>
        <div class="mt-3 space-y-3 text-sm text-slate-700">${children}</div>
        ${footer ? html`<div class="mt-6 grid grid-cols-2 gap-3">${footer}</div>` : null}
      </div>
    </div>`;
  }

  function CopyTextModal({ title, text, note, onClose }) {
    const [copied, setCopied] = useState(null);
    const areaRef = useRef(null);
    const copy = () => {
      const fallback = () => {
        if (areaRef.current) {
          areaRef.current.focus();
          areaRef.current.select();
        }
        setCopied("select");
      };
      try {
        navigator.clipboard.writeText(text).then(() => setCopied("ok"), fallback);
      } catch (error) {
        fallback();
      }
    };
    return html`<${Modal}
      title=${title}
      width="max-w-2xl"
      onClose=${onClose}
      footer=${html`<${Button} onClick=${onClose}>Cerrar</${Button}><${Button} variant="primary" icon="Copy" onClick=${copy}>Copiar</${Button}>`}
    >
      ${note ? html`<p>${note}</p>` : null}
      <textarea ref=${areaRef} readonly rows="10" class=${inputClass(false, "font-mono text-xs leading-relaxed")} id="texto-copiable" value=${text}></textarea>
      ${copied === "ok" ? html`<p class="text-xs font-semibold text-emerald-700">Copiado al portapapeles.</p>` : null}
      ${copied === "select" ? html`<p class="text-xs font-semibold text-amber-700">No se pudo copiar solo: el texto quedó seleccionado, cópialo con Ctrl+C.</p>` : null}
    </${Modal}>`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Formato de la tarjeta
  // ───────────────────────────────────────────────────────────────────────────

  const employeeName = (employee) => (employee ? D.formatEmployeeName(employee.name) : "Sin asignar");

  const unitLabel = (unit) => (unit ? unit.description + " · " + unit.building : null);

  const placeLabel = (task) => {
    if (task.unit) return unitLabel(task.unit);
    if (task.listingName) return task.listingName;
    return "Sin unidad";
  };

  const plannedLabel = (task) => {
    if (!task.plannedStartTime) return "Sin horario";
    return D.formatDayShort(D.ymdOf(task.plannedStartTime)) + " · " + D.formatRange(task.plannedStartTime, task.plannedEndTime);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Selectores
  // ───────────────────────────────────────────────────────────────────────────

  function BuildingUnitPicker({ unitId, initialBuildingId, onChange, idPrefix = "unidad", invalid }) {
    const buildingsQ = useApi(() => Coord.api.getBuildings(), []);
    const [buildingId, setBuildingId] = useState(initialBuildingId || "");
    const locationsQ = useApi(
      () => (buildingId ? Coord.api.getBuildingLocations(buildingId) : Promise.resolve(null)),
      [buildingId]
    );

    const floors = (locationsQ.data && locationsQ.data.floors) || [];
    const unitFloors = floors
      .map((f) => ({ label: f.label, units: f.areas.filter((a) => a.kind === "Unit") }))
      .filter((f) => f.units.length > 0);

    return html`<div class="grid gap-3 sm:grid-cols-2">
      <select
        id=${idPrefix + "-edificio"}
        aria-label="Edificio"
        class=${inputClass(false)}
        value=${buildingId}
        onChange=${(e) => {
          setBuildingId(e.target.value ? Number(e.target.value) : "");
          onChange(null);
        }}
      >
        <option value="">Sin unidad</option>
        ${(buildingsQ.data || []).map((b) => html`<option key=${b.id} value=${b.id}>${b.description || b.name}</option>`)}
      </select>
      <select
        id=${idPrefix + "-unidad"}
        aria-label="Unidad"
        class=${inputClass(invalid)}
        value=${unitId || ""}
        disabled=${!buildingId || locationsQ.loading}
        onChange=${(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">${!buildingId ? "Primero elige el edificio" : locationsQ.loading ? "Cargando unidades…" : "Elige la unidad"}</option>
        ${unitFloors.map(
          (f) => html`<optgroup key=${f.label} label=${f.label}>
            ${f.units.map((u) => html`<option key=${u.id} value=${u.id}>${u.label}</option>`)}
          </optgroup>`
        )}
      </select>
    </div>`;
  }

  /** Disponibilidad del empleado en la franja elegida (solo UI). */
  const availability = (employee, tasks, date, startIso, endIso, excludeIds) => {
    const exclude = excludeIds || [];
    if (startIso && endIso) {
      const conflicts = D.conflictsFor(employee.id, startIso, endIso, tasks, exclude);
      if (conflicts.length) {
        return {
          busy: true,
          text: "ocupado " + conflicts.map((t) => D.formatRange(t.plannedStartTime, t.plannedEndTime)).join(", "),
          conflicts,
        };
      }
    }
    const sameDay = tasks.filter(
      (t) =>
        exclude.indexOf(t.id) === -1 &&
        t.employee &&
        t.employee.id === employee.id &&
        t.phase !== "Cancelled" &&
        t.plannedStartTime &&
        D.ymdOf(t.plannedStartTime) === date
    ).length;
    return {
      busy: false,
      text: sameDay ? sameDay + (sameDay === 1 ? " limpieza ese día" : " limpiezas ese día") : "",
      conflicts: [],
    };
  };

  function EmployeeSelect({ id, value, onChange, employees, tasks, date, startIso, endIso, excludeIds, invalid, placeholder }) {
    const groups = useMemo(() => {
      const map = new Map();
      (employees || []).forEach((e) => {
        const key = e.team ? e.team.name : "Sin equipo";
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(e);
      });
      return Array.from(map.entries());
    }, [employees]);

    return html`<select id=${id} class=${inputClass(invalid)} value=${value || ""} onChange=${(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">${placeholder || "Elige un empleado"}</option>
      ${groups.map(
        ([team, list]) => html`<optgroup key=${team} label=${team}>
          ${list.map((e) => {
            const a = availability(e, tasks || [], date, startIso, endIso, excludeIds);
            return html`<option key=${e.id} value=${e.id}>${D.formatEmployeeName(e.name) + (a.text ? " — " + a.text : "")}</option>`;
          })}
        </optgroup>`
      )}
    </select>`;
  }

  const checklistSummaries = (checklists) =>
    (checklists || []).map((c) => Object.assign({}, c, { summary: D.summarizeChecklist(c.activities) }));

  function ChecklistSelect({ id, value, onChange, checklists }) {
    return html`<select id=${id} class=${inputClass(false)} value=${value || ""} onChange=${(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Sin checklist</option>
      ${checklistSummaries(checklists).map(
        (c) => html`<option key=${c.id} value=${c.id}>
          ${c.templateName} · ${c.summary.activityCount} actividades · ${D.describeChecklistMinutes(c.summary).toLowerCase()}
        </option>`
      )}
    </select>`;
  }

  function ChecklistPreview({ rows }) {
    const summary = useMemo(() => D.summarizeChecklist(rows || []), [rows]);
    if (!summary.activityCount) {
      return html`<p class="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
        Todavía no hay actividades que mostrar.
      </p>`;
    }
    return html`<div class="space-y-3">
      ${summary.sections.map(
        (section, index) => html`<div key=${index} class="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div class="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2">
            <p class="text-sm font-semibold text-slate-900">${section.title || "Sin sección"}</p>
            <span class="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
              ${section.totalMinutes !== null
                ? (section.hasPartialMinutes ? "~" : "") + D.formatMinutes(section.totalMinutes)
                : "sin minutos"}
            </span>
          </div>
          <ul class="divide-y divide-slate-100">
            ${section.items.map(
              (item) => html`<li key=${item.checkableIndex} class="flex items-start gap-3 px-4 py-2 text-sm">
                <span class="mt-0.5 h-4 w-4 shrink-0 rounded border border-slate-300 bg-white" aria-hidden="true"></span>
                <span class="min-w-0 flex-1 text-slate-700">${item.text}</span>
                <span class=${cx("shrink-0 text-xs tabular-nums", item.minutes !== null ? "text-slate-500" : "text-amber-700")}>
                  ${item.minutes !== null ? D.formatMinutes(item.minutes) : "sin minutos"}
                </span>
              </li>`
            )}
          </ul>
        </div>`
      )}
    </div>`;
  }

  function ChecklistSummaryLine({ rows }) {
    const s = D.summarizeChecklist(rows || []);
    if (!s.activityCount) return html`<span class="text-slate-500">Sin actividades</span>`;
    const counts = s.sectionCount + (s.sectionCount === 1 ? " sección · " : " secciones · ") + s.activityCount + " actividades · ";
    return html`<span class="tabular-nums">${counts}${s.minutes === null ? html`<span class="text-amber-700">sin minutos</span>` : D.describeChecklistMinutes(s)}</span>`;
  }

  /** Dos columnas etiqueta / valor. */
  function Details({ items }) {
    return html`<dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      ${items.filter(Boolean).map(
        (item) => html`<div key=${item.label} class=${cx("min-w-0", item.wide && "sm:col-span-2")}>
          <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">
            ${item.annotation
              ? html`<${Ann} tag=${item.annotation.tag} note=${item.annotation.note} inline=${true}>${item.label}</${Ann}>`
              : item.label}
          </dt>
          <dd class="mt-0.5 break-words text-sm text-slate-900">${item.value == null || item.value === "" ? html`<span class="text-slate-400">—</span>` : item.value}</dd>
        </div>`
      )}
    </dl>`;
  }

  Coord.ui = {
    store,
    useStore,
    useApi,
    navigate,
    openOverlay,
    closeOverlay,
    openTask,
    applyToken,
    parseToken,
    flash,
    toggleAnnotations,
    savePrefs,
    Icon,
    checkIcons,
    cx,
    BADGE,
    PILL,
    LEVEL_BADGE,
    LEVEL_BORDER,
    LEVEL_BAR,
    FOCUS,
    TH,
    TD,
    inputClass,
    Button,
    Spinner,
    Field,
    Card,
    PageHeader,
    InlineAlert,
    EmptyState,
    Skeleton,
    ErrorState,
    Chip,
    StatusBadges,
    SourceBadge,
    Segmented,
    SortHeader,
    useSort,
    compareBy,
    Ann,
    useEscape,
    Drawer,
    Modal,
    CopyTextModal,
    employeeName,
    unitLabel,
    placeLabel,
    plannedLabel,
    BuildingUnitPicker,
    availability,
    EmployeeSelect,
    checklistSummaries,
    ChecklistSelect,
    ChecklistPreview,
    ChecklistSummaryLine,
    Details,
  };
})();
