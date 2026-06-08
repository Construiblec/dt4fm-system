import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
};

export const Pagination = ({
  currentPage,
  totalPages,
  onChange,
}: PaginationProps) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex w-full items-center justify-between rounded-xl">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(1)}
          disabled={currentPage === 1}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 disabled:opacity-40"
        >
          <ChevronsLeft size={16} />
        </button>

        <button
          type="button"
          onClick={() => onChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className="flex-1 text-center text-sm font-semibold text-slate-700">
        Página {currentPage} de {totalPages}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>

        <button
          type="button"
          onClick={() => onChange(totalPages)}
          disabled={currentPage === totalPages}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 disabled:opacity-40"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
};
