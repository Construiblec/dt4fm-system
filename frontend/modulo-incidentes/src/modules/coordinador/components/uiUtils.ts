import { useState } from "react";

/** Utilidades de las piezas visuales: clases, estilo de campo y orden de tablas. */

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const INPUT_BASE =
  "block rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export const inputClass = (invalid?: boolean | string | null, extra?: string) =>
  cx(
    INPUT_BASE,
    // Un ancho propio (`w-auto`…) manda sobre el ancho completo por defecto.
    !extra?.includes("w-") && "w-full",
    invalid
      ? "border-red-400 focus:border-red-500"
      : "border-slate-300 focus:border-brand",
    extra,
  );

export type Sort = { key: string; dir: "asc" | "desc" };

/** Orden por columna: el primer clic va descendente (lo más nuevo arriba). */
export const useSort = (initial: Sort): [Sort, (key: string) => void] => {
  const [sort, setSort] = useState<Sort>(initial);
  const onSort = (key: string) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  return [sort, onSort];
};

type SortValue = string | number | null | undefined;

/** Comparador por columna: lo vacío va siempre al final y el desempate es lo más nuevo primero. */
export const compareBy =
  <T extends { id: number }>(
    sort: Sort,
    getters: Record<string, (item: T) => SortValue>,
  ) =>
  (a: T, b: T): number => {
    const get = getters[sort.key];
    const va = get(a);
    const vb = get(b);
    let result: number;

    if (va == null && vb == null) result = 0;
    else if (va == null) return 1;
    else if (vb == null) return -1;
    else result = va < vb ? -1 : va > vb ? 1 : 0;

    if (sort.dir === "desc") result = -result;
    return result || b.id - a.id;
  };
