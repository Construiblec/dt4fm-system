import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  MapPin,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
} from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { formatDayMonthTime } from "@/shared/utils/dateUtils";
import { getOwnerCommonAreas, type CommonArea } from "@/services/api";
import { badgeFor } from "../components/areaBadge";

type Tab = "areas" | "reservas";
type FilterEstado = "todos" | "Libre" | "Reservado" | "Mantenimiento";

export const OwnerReservationsPage = () => {
  const navigate = useNavigate();
  const tenantId = Number(localStorage.getItem("tenantId"));

  const [areas, setAreas] = useState<CommonArea[]>([]);
  const [misReservas, setMisReservas] = useState<CommonArea[]>([]);
  const [edificio, setEdificio] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(
    tenantId ? null : "No se encontró tu residente. Vuelve a iniciar sesión.",
  );
  const [tab, setTab] = useState<Tab>("areas");
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<FilterEstado>("todos");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    getOwnerCommonAreas(tenantId)
      .then((res) => {
        setEdificio(res.edificio);
        setAreas(res.areas);
        setMisReservas(res.misReservas);
      })
      .catch((err) =>
        setError(
          axios.isAxiosError(err) && err.response?.status === 400
            ? "No tienes un edificio asignado. Contacta con administración."
            : "No se pudieron cargar las áreas de tu edificio.",
        ),
      )
      .finally(() => setLoading(false));
  }, [tenantId]);

  const filtered = areas.filter((a) => {
    const term = search.trim().toLowerCase();
    const matchSearch =
      term === "" ||
      a.name.toLowerCase().includes(term) ||
      (a.piso ?? "").toLowerCase().includes(term);

    const matchEstado =
      filterEstado === "todos" ||
      (filterEstado === "Mantenimiento"
        ? a.enMantenimiento
        : a.estado === filterEstado && !a.enMantenimiento);

    return matchSearch && matchEstado;
  });

  const resumen = [
    {
      key: "Libre" as FilterEstado,
      label: "Libres",
      value: areas.filter((a) => a.reservable).length,
      className: "text-emerald-600",
    },
    {
      key: "Reservado" as FilterEstado,
      label: "Reservadas",
      value: areas.filter((a) => a.estado === "Reservado" && !a.enMantenimiento)
        .length,
      className: "text-red-600",
    },
    {
      key: "Mantenimiento" as FilterEstado,
      label: "En mantenimiento",
      value: areas.filter((a) => a.enMantenimiento).length,
      className: "text-amber-600",
    },
  ];

  return (
    <AppLayout>
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <h1 className="mb-1 text-xl font-bold text-slate-900">
          Áreas comunales
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          {edificio
            ? `Consulta y reserva las áreas de ${edificio}.`
            : "Consulta y reserva las áreas de tu edificio."}
        </p>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        ) : (
          <>
            {/* Pestañas, mismo switcher que el dashboard de tareas */}
            <div className="mb-5 flex rounded-xl bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setTab("areas")}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  tab === "areas"
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Para reservar ({areas.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("reservas")}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  tab === "reservas"
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Mis reservas ({misReservas.length})
              </button>
            </div>

            {/* Búsqueda, con los filtros acoplados a la derecha */}
            {tab === "areas" ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar area..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowFilters(!showFilters)}
                    aria-label="Filtros"
                    aria-pressed={showFilters}
                    className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border transition ${
                      showFilters
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </button>
                </div>

                {/* Filtros de estado */}
                {showFilters ? (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterEstado("todos")}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        filterEstado === "todos"
                          ? "bg-brand text-white"
                          : "border border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      Todos ({areas.length})
                    </button>
                    {resumen.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setFilterEstado(r.key)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          filterEstado === r.key
                            ? "bg-brand text-white"
                            : "border border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {r.label} ({r.value})
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* Resumen de estados */}
                {!loading ? (
                  <div className="mb-5 grid grid-cols-3 gap-2">
                    {resumen.map((r) => (
                      <div
                        key={r.key}
                        className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white py-3 shadow-sm"
                      >
                        <span className={`text-lg font-bold ${r.className}`}>
                          {r.value}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {r.label}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-2xl bg-slate-200"
                  />
                ))}
              </div>
            ) : (
              <>
                {/* ── Pestaña: áreas que se pueden reservar ── */}
                {tab === "areas" ? (
                  filtered.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center">
                      <p className="text-sm font-medium text-slate-500">
                        {areas.length === 0
                          ? "Tu edificio no tiene áreas comunales disponibles para reservar."
                          : "No se encontraron áreas con esos criterios."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filtered.map((area) => {
                        const badge = badgeFor(area);
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
                                {area.piso ? (
                                  <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span>{area.piso}</span>
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
                                {area.condicion &&
                                area.condicion.trim() !== badge.label ? (
                                  <span
                                    className={`rounded-lg px-2 py-1 text-[11px] ${
                                      area.enMantenimiento
                                        ? "bg-amber-50 text-amber-700"
                                        : "bg-slate-50 text-slate-500"
                                    }`}
                                  >
                                    {area.condicion}
                                  </span>
                                ) : null}
                                {area.reservadoPorMi ? (
                                  <span className="rounded-lg bg-brand/10 px-2 py-1 text-[11px] font-semibold text-brand">
                                    Tu reserva
                                  </span>
                                ) : null}
                              </div>

                              {area.reservable ? (
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
                  )
                ) : null}

                {/* ── Pestaña: áreas reservadas por el residente ── */}
                {tab === "reservas" ? (
                  misReservas.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center">
                      <p className="text-sm text-slate-400">
                        Todavía no tienes áreas reservadas.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {misReservas.map((reserva) => (
                        <div
                          key={reserva.id}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900">
                                {reserva.name}
                              </p>
                              {reserva.piso ? (
                                <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span>{reserva.piso}</span>
                                </div>
                              ) : null}
                            </div>
                            <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Reservada
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span>
                              {formatDayMonthTime(reserva.fechaReservaInicio)} —{" "}
                              {formatDayMonthTime(reserva.fechaReservaFin)}
                            </span>
                          </div>

                          {reserva.notes ? (
                            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                              {reserva.notes}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </>
            )}
          </>
        )}
      </main>
    </AppLayout>
  );
};
