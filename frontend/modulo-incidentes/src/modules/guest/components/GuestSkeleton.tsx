import { GuestPageShell } from "./GuestPageShell";

export const GuestSkeleton = () => (
  <GuestPageShell>
    <div aria-busy="true" aria-label="Cargando tu portal">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-200" />
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="h-56 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-72 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    </div>
  </GuestPageShell>
);
