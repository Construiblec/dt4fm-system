import type { GuestPortalData } from "../services/guestPortalService";
import { firstName, stayPhase } from "../utils/guestDates";
import { GuestBrandMark, GuestEyebrow } from "./GuestBrand";

export const GuestHeader = ({ data }: { data: GuestPortalData }) => {
  const enCurso = stayPhase(data) === "en-curso";

  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex items-center gap-3">
        <GuestBrandMark />
        <div>
          <GuestEyebrow />
          <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">
            Hola, {firstName(data.guestName)}
          </h1>
        </div>
      </div>
      <span
        className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
          enCurso ? "bg-emerald-100 text-emerald-700" : "bg-brand/10 text-brand"
        }`}
      >
        {enCurso ? "Estadía en curso" : "Próxima estadía"}
      </span>
    </header>
  );
};
