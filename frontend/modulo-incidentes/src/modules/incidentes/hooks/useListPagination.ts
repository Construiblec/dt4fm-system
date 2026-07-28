import { useMemo, useState } from "react";

type Result<T> = {
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  pageItems: T[];
};

/**
 * Paginación en cliente de una lista ya filtrada.
 *
 * La página efectiva se deriva en el render (sin efectos): vuelve a 1 cuando
 * cambian los filtros y se recorta si la lista se encogió por debajo de la
 * página actual.
 *
 * @param resetKey Valor que representa los filtros activos. Al cambiar se
 * vuelve a la primera página; necesario porque dos filtros distintos pueden
 * devolver la misma cantidad de elementos.
 */
export const useListPagination = <T>(
  items: T[],
  itemsPerPage: number,
  resetKey = "",
): Result<T> => {
  const [selection, setSelection] = useState({ page: 1, key: resetKey });

  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));

  const page =
    selection.key === resetKey ? Math.min(selection.page, totalPages) : 1;

  const setPage = (nextPage: number) =>
    setSelection({ page: nextPage, key: resetKey });

  const pageItems = useMemo(
    () => items.slice((page - 1) * itemsPerPage, page * itemsPerPage),
    [items, page, itemsPerPage],
  );

  return { page, setPage, totalPages, pageItems };
};
