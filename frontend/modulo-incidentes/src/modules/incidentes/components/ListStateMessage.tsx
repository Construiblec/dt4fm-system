type Props = {
  loading: boolean;
  error: string | null;
  /** La fuente de datos no devolvió nada */
  isEmpty: boolean;
  /** Hay datos, pero ninguno pasa los filtros activos */
  hasNoMatches: boolean;
  loadingMessage: string;
  emptyMessage: string;
  noMatchesMessage?: string;
};

const BASE_CLASS = "rounded-xl bg-white p-4 text-sm shadow-sm";

/**
 * Escalera de estados de una lista: cargando → error → vacío → sin coincidencias.
 * Devuelve `null` cuando hay resultados que mostrar.
 */
export const ListStateMessage = ({
  loading,
  error,
  isEmpty,
  hasNoMatches,
  loadingMessage,
  emptyMessage,
  noMatchesMessage = "No hay resultados que coincidan con los filtros",
}: Props) => {
  if (loading) {
    return <div className={`${BASE_CLASS} text-slate-500`}>{loadingMessage}</div>;
  }

  if (error) {
    return <div className={`${BASE_CLASS} text-red-600`}>{error}</div>;
  }

  if (isEmpty) {
    return <div className={`${BASE_CLASS} text-slate-500`}>{emptyMessage}</div>;
  }

  if (hasNoMatches) {
    return (
      <div className={`${BASE_CLASS} text-slate-500`}>{noMatchesMessage}</div>
    );
  }

  return null;
};
