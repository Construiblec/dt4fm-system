import logo from "@/shared/assets/images/logo.svg";

export const GuestBrandMark = () => (
  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
    <img src={logo} alt="" className="h-6 w-6 object-contain" />
  </div>
);

export const GuestEyebrow = () => (
  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
    Construiblec
  </p>
);
