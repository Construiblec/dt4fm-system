import { type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  CircleAlert,
  CircleCheck,
  CirclePause,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Info,
  Play,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cx, type Sort } from "./uiUtils";

/**
 * Piezas visuales de la coordinación: botones, campos, tarjetas, avisos y
 * tablas. Mismo lenguaje que el resto de la app (Tailwind, brand azul, tarjetas
 * `rounded-2xl`), pensado para escritorio.
 */

export const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

// ─── Botón ──────────────────────────────────────────────────────────────────

const BUTTON_VARIANT = {
  primary: "bg-brand text-white shadow-sm hover:bg-brand-hover",
  secondary:
    "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  ghost: "text-slate-600 hover:bg-slate-100",
  subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
} as const;

const BUTTON_SIZE = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
} as const;

type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> & {
  variant?: keyof typeof BUTTON_VARIANT;
  size?: keyof typeof BUTTON_SIZE;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  className?: string;
};

export const Spinner = ({ className }: { className?: string }) => (
  <span
    aria-hidden="true"
    className={cx(
      "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none",
      className,
    )}
  />
);

export const Button = ({
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    className={cx(
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
      FOCUS,
      BUTTON_VARIANT[variant],
      BUTTON_SIZE[size],
      className,
    )}
    {...rest}
  >
    {loading ? (
      <Spinner />
    ) : Icon ? (
      <Icon
        className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}
        aria-hidden="true"
      />
    ) : null}
    {children}
    {IconRight ? <IconRight className="h-4 w-4" aria-hidden="true" /> : null}
  </button>
);

// ─── Campos ─────────────────────────────────────────────────────────────────

type FieldProps = {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
};

export const Field = ({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: FieldProps) => (
  <div className={cx("min-w-0 space-y-1.5", className)}>
    <label
      htmlFor={htmlFor}
      className="block text-sm font-semibold text-slate-700"
    >
      {label}
      {required ? (
        <span className="text-red-600" aria-hidden="true">
          {" "}
          *
        </span>
      ) : null}
    </label>
    {children}
    {error ? (
      <p className="text-xs font-medium text-red-600">{error}</p>
    ) : hint ? (
      <p className="text-xs text-slate-500">{hint}</p>
    ) : null}
  </div>
);

// ─── Tarjeta y encabezado de página ─────────────────────────────────────────

type CardProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Vacío = el contenido llega al borde (tablas). */
  bodyClass?: string;
};

export const Card = ({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClass,
}: CardProps) => (
  <section className={cx("min-w-0 rounded-2xl bg-white shadow-sm", className)}>
    {title || actions ? (
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          {title ? (
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          ) : null}
          {subtitle ? (
            <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    ) : null}
    <div className={bodyClass ?? "px-5 py-4"}>{children}</div>
  </section>
);

export const PageHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{subtitle}</p>
      ) : null}
    </div>
    {actions ? (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </div>
);

// ─── Avisos ─────────────────────────────────────────────────────────────────

const TONES = {
  info: {
    box: "border-sky-200 bg-sky-50 text-sky-900",
    icon: Info,
    iconClass: "text-sky-600",
  },
  success: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: CircleCheck,
    iconClass: "text-emerald-600",
  },
  warning: {
    box: "border-amber-200 bg-amber-50 text-amber-900",
    icon: TriangleAlert,
    iconClass: "text-amber-600",
  },
  error: {
    box: "border-red-200 bg-red-50 text-red-900",
    icon: CircleAlert,
    iconClass: "text-red-600",
  },
  neutral: {
    box: "border-slate-200 bg-slate-50 text-slate-800",
    icon: Info,
    iconClass: "text-slate-500",
  },
  paused: {
    box: "border-violet-200 bg-violet-50 text-violet-900",
    icon: CirclePause,
    iconClass: "text-violet-600",
  },
  reopened: {
    box: "border-rose-200 bg-rose-50 text-rose-900",
    icon: RotateCcw,
    iconClass: "text-rose-600",
  },
  review: {
    box: "border-indigo-200 bg-indigo-50 text-indigo-900",
    icon: ClipboardList,
    iconClass: "text-indigo-600",
  },
  progress: {
    box: "border-blue-200 bg-blue-50 text-blue-900",
    icon: Play,
    iconClass: "text-blue-600",
  },
} satisfies Record<
  string,
  { box: string; icon: LucideIcon; iconClass: string }
>;

export type AlertTone = keyof typeof TONES;

export const InlineAlert = ({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) => {
  const t = TONES[tone];
  const Icon = icon ?? t.icon;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        t.box,
        className,
      )}
    >
      <Icon
        className={cx("mt-0.5 h-4 w-4 shrink-0", t.iconClass)}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
};

export const EmptyState = ({
  icon: Icon = ClipboardList,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
    <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500">
      <Icon className="h-6 w-6" aria-hidden="true" />
    </span>
    <p className="text-base font-semibold text-slate-900">{title}</p>
    {children ? (
      <p className="max-w-md text-sm text-slate-600">{children}</p>
    ) : null}
    {action ?? null}
  </div>
);

export const Skeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-3 px-5 py-4" aria-busy="true" aria-label="Cargando">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="h-9 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none"
      />
    ))}
  </div>
);

export const ErrorState = ({
  message,
  title,
  onRetry,
}: {
  message?: string | null;
  title?: string;
  onRetry?: () => void;
}) => (
  <div className="px-5 py-4">
    <InlineAlert
      tone="error"
      title={title ?? "No se pudo cargar esta información."}
      action={
        onRetry ? (
          <Button size="sm" icon={RotateCcw} onClick={onRetry}>
            Reintentar
          </Button>
        ) : null
      }
    >
      {message}
    </InlineAlert>
  </div>
);

// ─── Chip y segmentado ──────────────────────────────────────────────────────

const CHIP_TONES = {
  slate: "bg-slate-100 text-slate-700",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  red: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
  outline: "border border-slate-300 bg-white text-slate-600",
} as const;

export const Chip = ({
  tone = "slate",
  icon: Icon,
  children,
  title,
}: {
  tone?: keyof typeof CHIP_TONES;
  icon?: LucideIcon;
  children: ReactNode;
  title?: string;
}) => (
  <span
    title={title}
    className={cx(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold",
      CHIP_TONES[tone],
    )}
  >
    {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
    {children}
  </span>
);

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  count?: number | null;
};

export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) => (
  <div
    role="tablist"
    aria-label={label}
    className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-white p-1 shadow-sm"
  >
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="tab"
        aria-selected={o.value === value}
        onClick={() => onChange(o.value)}
        className={cx(
          "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
          FOCUS,
          o.value === value
            ? "bg-brand/10 text-brand"
            : "text-slate-600 hover:bg-slate-100",
        )}
      >
        {o.label}
        {o.count != null ? (
          <span className="ml-1.5 tabular-nums opacity-70">{o.count}</span>
        ) : null}
      </button>
    ))}
  </div>
);

// ─── Tablas ─────────────────────────────────────────────────────────────────

export const TH =
  "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
export const TD = "px-4 py-3 align-top";

export const SortHeader = ({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: string;
  sort: Sort;
  onSort: (key: string) => void;
  className?: string;
}) => {
  const active = sort.key === sortKey;
  const Icon = active
    ? sort.dir === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <th
      scope="col"
      className={cx(TH, className)}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cx(
          "inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900",
          FOCUS,
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </th>
  );
};

/** Dos columnas etiqueta / valor. */
export const Details = ({
  items,
}: {
  items: Array<
    { label: string; value: ReactNode; wide?: boolean } | null | false
  >;
}) => (
  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
    {items
      .filter((item): item is NonNullable<typeof item> & object =>
        Boolean(item),
      )
      .map((item) => (
        <div
          key={item.label}
          className={cx("min-w-0", item.wide && "sm:col-span-2")}
        >
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {item.label}
          </dt>
          <dd className="mt-0.5 break-words text-sm text-slate-900">
            {item.value == null || item.value === "" ? (
              <span className="text-slate-400">—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
  </dl>
);

// ─── Paginación ─────────────────────────────────────────────────────────────

/** Páginas a mostrar: la primera, la última y las vecinas de la actual; el resto, "…". */
const pageWindow = (page: number, pages: number): Array<number | "gap"> => {
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  const list = Array.from(keep)
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);

  return list.flatMap((n, i) =>
    i > 0 && n - list[i - 1] > 1 ? (["gap", n] as const) : [n],
  );
};

export const Pagination = ({
  page,
  pageSize,
  total,
  onPage,
  noun = "resultados",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  noun?: string;
}) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const item =
    "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm font-semibold tabular-nums transition";

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3"
    >
      <p className="text-sm text-slate-600">
        Mostrando{" "}
        <span className="tabular-nums">
          {from}–{to}
        </span>{" "}
        de <span className="tabular-nums">{total}</span> {noun}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={cx(
            item,
            FOCUS,
            "text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent",
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        {pageWindow(page, pages).map((n, i) =>
          n === "gap" ? (
            <span
              key={`gap-${i}`}
              className="px-1 text-slate-400"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
              className={cx(
                item,
                FOCUS,
                n === page
                  ? "bg-brand/10 text-brand"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Página siguiente"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className={cx(
            item,
            FOCUS,
            "text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent",
          )}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};
