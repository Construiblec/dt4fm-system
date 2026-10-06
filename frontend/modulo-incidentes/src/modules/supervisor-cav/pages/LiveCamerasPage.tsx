import { useEffect, useState } from "react";
import { Cctv, PowerOff, RefreshCw, TriangleAlert } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { ListStateMessage } from "@/modules/incidentes/components/ListStateMessage";
import { BuildingSelect } from "@/modules/supervisor-cav/components/BuildingSelect";
import { CameraViewer } from "@/modules/supervisor-cav/components/CameraViewer";
import { useCameras } from "@/modules/supervisor-cav/hooks/useCameras";
import { useLiveCamera } from "@/modules/supervisor-cav/hooks/useLiveCamera";
import { AppHeader } from "@/shared/components/AppHeader";

export const LiveCamerasPage = () => {
  const { overview, loading, error, reload } = useCameras();
  const live = useLiveCamera();
  const buildings = overview?.buildings ?? [];
  const enabled = overview?.enabled ?? false;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Si al recargar el elegido ya no viene, se muestra el primero.
  const selected =
    buildings.find((building) => building.buildingId === selectedId) ??
    buildings[0];
  const activeCamera =
    buildings
      .flatMap((building) => building.cameras)
      .find((camera) => camera.cameraId === live.cameraId) ?? null;
  const [now, setNow] = useState(() => Date.now());
  const remainingSeconds =
    live.endsAt !== null
      ? Math.max(0, Math.ceil((live.endsAt - now) / 1000))
      : null;

  useEffect(() => {
    if (live.endsAt === null) return;

    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [live.endsAt]);

  const changeBuilding = (buildingId: number) => {
    live.stop();
    setSelectedId(buildingId);
  };

  const refresh = () => {
    live.stop();
    void reload();
  };

  return (
    <AppLayout className="bg-gray-100">
      <main className="flex min-h-screen flex-col bg-gray-100">
        <AppHeader />

        <section className="flex-1 px-4 pb-20">
          <div className="mx-auto w-full max-w-sm space-y-5">
            <div className="relative">
              <h1 className="text-center text-2xl font-bold text-slate-900">
                Cámaras
              </h1>
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                aria-label="Actualizar"
                className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-500 transition hover:bg-white disabled:opacity-50"
              >
                <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {overview && !enabled ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <PowerOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm text-amber-700">
                  El video en vivo está desactivado.
                </p>
              </div>
            ) : null}

            {overview?.stale ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm text-amber-700">
                  No se pudo actualizar la lista: se muestran las cámaras conocidas.
                </p>
              </div>
            ) : null}

            <ListStateMessage
              loading={loading && !overview}
              error={error}
              isEmpty={!loading && !error && buildings.length === 0}
              hasNoMatches={false}
              loadingMessage="Cargando cámaras..."
              emptyMessage="Aún no hay cámaras en vivo"
            />

            {selected ? (
              <>
                <BuildingSelect
                  buildings={buildings.map((building) => ({
                    ...building,
                    online: building.reachable,
                  }))}
                  value={selected.buildingId}
                  onChange={changeBuilding}
                />

                <CameraViewer
                  videoRef={live.videoRef}
                  state={live.state}
                  camera={activeCamera}
                  failure={live.failure}
                  remainingSeconds={remainingSeconds}
                  onPlaying={live.onPlaying}
                  onRetry={() => {
                    if (live.cameraId) void live.start(live.cameraId);
                  }}
                  onRefresh={refresh}
                  onClose={live.stop}
                />

                <article className="rounded-xl bg-white p-4 shadow-sm">
                  {!selected.reachable ? (
                    <p className="mb-3 text-xs font-medium text-amber-700">
                      Edificio sin conexión
                    </p>
                  ) : null}

                  <ul className="divide-y divide-slate-100">
                    {selected.cameras.map((camera) => {
                      const watching =
                        camera.cameraId === live.cameraId &&
                        ["requesting", "connecting", "live"].includes(live.state);

                      return (
                        <li key={camera.cameraId} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10">
                              <Cctv className="h-5 w-5 text-brand" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {camera.name}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {camera.cameraId}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void live.start(camera.cameraId)}
                              disabled={!enabled || watching}
                              className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              {watching ? "Viendo" : "Ver"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </article>

                <p className="text-center text-[11px] text-slate-400">
                  Una cámara a la vez. Cada visualización queda registrada.
                </p>
              </>
            ) : null}
          </div>
        </section>
      </main>
    </AppLayout>
  );
};
