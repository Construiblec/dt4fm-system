import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Search,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  SlidersHorizontal,
} from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { getCommonAreas, type CommonArea } from "@/services/api";

type FilterEstado = "todos" | "Libre" | "Reservado" | "Disponible";

const estadoBadge: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  Libre: {
    label: "Libre",
    className: "bg-emerald-100 text-emerald-700",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  Reservado: {
    label: "Reservado",
    className: "bg-red-100 text-red-700",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  Disponible: {
    label: "Disponible",
    className: "bg-slate-100 text-slate-600",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
};

export const OwnerReservationsPage = () => {
  const navigate = useNavigate();
  const buildingId = Number(localStorage.getItem("buildingId")) || undefined;

  const [areas, setAreas] = useState<CommonArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<FilterEstado>("todos");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    getCommonAreas(buildingId)
      .then(setAreas)
      .catch(() => setAreas([]))
      .finally(() => setLoading(false));
  }, [buildingId]);

  const filtered = areas.filter((a) => {
    const matchSearch =
      search.trim() === "" ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.edificio ?? "").toLowerCase().includes(search.toLowerCase());

    const matchEstado = filterEstado === "todos" || a.estado === filterEstado;

    return matchSearch && matchEstado;
  });

  const countByEstado = (estado: string) =>
    areas.filter((a) => a.estado === estado).length;

  return (
    <AppLayout>
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/owner/dashboard")}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al inicio
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${
              showFilters
                ? "border-brand bg-brand/10 text-brand"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
          </button>
        </div>

        <h1 className="mb-1 text-xl font-bold text-slate-900">
          Areas comunales
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          Consulta el estado y disponibilidad de las areas de tu edificio.
        </p>

        {/* Búsqueda */}
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar area..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
          />
        </div>

        {/* Filtros de estado */}
        {showFilters ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              ["todos", "Libre", "Reservado", "Disponible"] as FilterEstado[]
            ).map((estado) => (
              <button
                key={estado}
                type="button"
                onClick={() => setFilterEstado(estado)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  filterEstado === estado
                    ? "bg-brand text-white"
                    : "border border-slate-200 bg-white text-slate-600"
                }`}
              >
                {estado === "todos"
                  ? `Todos (${areas.length})`
                  : `${estado} (${countByEstado(estado)})`}
              </button>
            ))}
          </div>
        ) : null}

        {/* Resumen de estados */}
        {!loading ? (
          <div className="mb-5 grid grid-cols-3 gap-2">
            {(["Libre", "Reservado", "Disponible"] as const).map((estado) => {
              const badge = estadoBadge[estado];
              return (
                <div
                  key={estado}
                  className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white py-3 shadow-sm"
                >
                  <span
                    className={`text-lg font-bold ${
                      estado === "Libre"
                        ? "text-emerald-600"
                        : estado === "Reservado"
                          ? "text-red-600"
                          : "text-slate-600"
                    }`}
                  >
                    {countByEstado(estado)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Listado */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl bg-slate-200"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-500">
              No se encontraron \u00e1reas con esos criterios.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((area) => {
              const badge =
                estadoBadge[area.estado] ?? estadoBadge["Disponible"];
              return (
                <div
                  key={area.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">
                        {area.name}
                      </p>
                      {area.edificio ? (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span>{area.edificio}</span>
                          {area.piso ? <span>&middot; {area.piso}</span> : null}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}
                    >
                      {badge.icon}
                      {badge.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-2">
                      {area.areaNeta ? (
                        <span className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
                          {area.areaNeta} m²
                        </span>
                      ) : null}
                      {area.condicion ? (
                        <span className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
                          {area.condicion}
                        </span>
                      ) : null}
                    </div>

                    {area.estado !== "Reservado" ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/owner/reservations/${area.id}`)
                        }
                        className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-hover"
                      >
                        Reservar
                      </button>
                    ) : (
                      <span className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-400">
                        No disponible
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </AppLayout>
  );
};
