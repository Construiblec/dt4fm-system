import { Building2 } from "lucide-react";
import type { DoorBuilding } from "@/modules/supervisor-cav/types/Door";

type Props = {
  buildings: DoorBuilding[];
  value: number;
  onChange: (buildingId: number) => void;
};

export const BuildingSelect = ({ buildings, value, onChange }: Props) => (
  <label className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm">
    <span className="flex shrink-0 items-center justify-center rounded-lg bg-slate-100 p-2">
      <Building2 className="h-4 w-4 text-slate-600" />
    </span>
    <span className="sr-only">Edificio</span>
    <select
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none"
    >
      {buildings.map((building) => (
        <option key={building.buildingId} value={building.buildingId}>
          {building.name}
          {building.online ? "" : " · sin conexión"}
        </option>
      ))}
    </select>
  </label>
);
