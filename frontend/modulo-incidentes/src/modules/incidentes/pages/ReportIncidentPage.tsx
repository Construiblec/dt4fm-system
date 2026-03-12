import { AppLayout } from "@/app/layout/AppLayout";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import logo from "@/shared/assets/images/construiblec-logo.png";

const buildings = ["Edificio A", "Edificio B", "Edificio C"];

const priorities = [
  {
    value: "Baja",
    baseClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300",
    activeClassName: "border-emerald-500 bg-emerald-500 text-white",
  },
  {
    value: "Media",
    baseClassName:
      "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300",
    activeClassName: "border-amber-500 bg-amber-500 text-slate-900",
  },
  {
    value: "Alta",
    baseClassName: "border-red-200 bg-red-50 text-red-700 hover:border-red-300",
    activeClassName: "border-red-500 bg-red-500 text-white",
  },
] as const;

type FormValues = {
  building: string;
  area: string;
  description: string;
};

type EvidencePreview = {
  file: File;
  previewUrl: string;
};

export const ReportIncidentPage = () => {
  const navigate = useNavigate();
  const [selectedPriority, setSelectedPriority] = useState<
    (typeof priorities)[number]["value"]
  >("Media");
  const [evidence, setEvidence] = useState<EvidencePreview[]>([]);
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      building: "",
      area: "",
      description: "",
    },
  });

  useEffect(() => {
    return () => {
      evidence.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [evidence]);

  const remainingSlots = useMemo(() => 3 - evidence.length, [evidence.length]);

  const handleEvidenceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []).slice(
      0,
      remainingSlots,
    );

    if (selectedFiles.length === 0) {
      return;
    }

    const previews = selectedFiles.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setEvidence((current) => [...current, ...previews]);
    event.target.value = "";
  };

  const removeEvidence = (previewUrl: string) => {
    setEvidence((current) => {
      const target = current.find((item) => item.previewUrl === previewUrl);

      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return current.filter((item) => item.previewUrl !== previewUrl);
    });
  };

  const onSubmit = (_values: FormValues) => {
    console.log("incidente enviado");
  };

  return (
    <AppLayout className="bg-[#f1f1f2]">
      <main className="min-h-screen bg-[#f1f1f2]">
        <div className="border-b border-slate-200 bg-white px-4 py-4">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700"
          >
            <span aria-hidden="true">&larr;</span>
            Reporte de novedad
          </button>
        </div>

        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img
              src={logo}
              alt="Construiblec"
              className="h-8 w-8 rounded-md border border-slate-200 bg-white p-0.5"
            />
            <span className="text-[15px] font-semibold text-slate-800">
              Construiblec
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 px-4 py-5">
          <section className="space-y-2">
            <label
              htmlFor="building"
              className="text-sm font-semibold text-slate-700"
            >
              Edificio
            </label>
            <select
              id="building"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...register("building")}
            >
              <option value="">Seleccionar edificio</option>
              {buildings.map((building) => (
                <option key={building} value={building}>
                  {building}
                </option>
              ))}
            </select>
          </section>

          <section className="space-y-2">
            <label htmlFor="area" className="text-sm font-semibold text-slate-700">
              Piso / {"\u00c1rea"}
            </label>
            <input
              id="area"
              type="text"
              placeholder="01 / 09"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...register("area")}
            />
          </section>

          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">
              Nivel de prioridad
            </p>
            <div className="grid grid-cols-3 gap-2">
              {priorities.map((priority) => {
                const isActive = selectedPriority === priority.value;

                return (
                  <button
                    key={priority.value}
                    type="button"
                    onClick={() => setSelectedPriority(priority.value)}
                    className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${isActive ? priority.activeClassName : priority.baseClassName}`}
                  >
                    {priority.value}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <label
              htmlFor="description"
              className="text-sm font-semibold text-slate-700"
            >
              Descripci{"\u00f3"}n
            </label>
            <textarea
              id="description"
              rows={5}
              placeholder={"Coloca una breve descripci\u00f3n del incidente"}
              className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...register("description")}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Evidencia</p>
              <span className="text-xs font-medium text-slate-400">
                {evidence.length}/3 im{"\u00e1"}genes
              </span>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
              <span className="text-sm font-semibold text-slate-700">
                Seleccionar im{"\u00e1"}genes
              </span>
              <span className="mt-1 text-xs text-slate-400">
                JPG, PNG o WEBP. M{"\u00e1"}ximo 3 archivos.
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleEvidenceChange}
                disabled={remainingSlots === 0}
              />
            </label>

            {evidence.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {evidence.map((item) => (
                  <div
                    key={item.previewUrl}
                    className="overflow-hidden rounded-2xl bg-white shadow-sm"
                  >
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-24 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeEvidence(item.previewUrl)}
                      className="w-full border-t border-slate-100 px-2 py-2 text-xs font-semibold text-red-500"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <button
            type="submit"
            className="w-full rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/30"
          >
            Reportar Novedad
          </button>
        </form>
      </main>
    </AppLayout>
  );
};
