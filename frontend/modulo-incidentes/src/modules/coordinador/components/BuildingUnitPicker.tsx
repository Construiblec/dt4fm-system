import { useEffect, useMemo, useState } from "react";
import {
  getBuildingLocations,
  getBuildings,
} from "@/modules/incidentes/services/buildingsService";
import type { Building } from "@/modules/incidentes/types/Building";
import type { BuildingLocations } from "@/modules/incidentes/types/BuildingLocations";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/shared/components/SearchableSelect";

type Props = {
  buildingId: string;
  onBuildingChange: (buildingId: string) => void;
  unitId: string;
  onUnitChange: (unitId: string) => void;
  invalid?: boolean;
  required?: boolean;
};

/**
 * Unit es una referencia de openMAINT que solo se resuelve por búsqueda
 * (nunca se crea al vuelo desde acá) — Edificio → Unidad en cascada, mismo
 * patrón que ya usa `ReportIncidentPage` para Planta/Área, reusando el mismo
 * `buildingsService`.
 */
export const BuildingUnitPicker = ({
  buildingId,
  onBuildingChange,
  unitId,
  onUnitChange,
  invalid = false,
  required = false,
}: Props) => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [locations, setLocations] = useState<BuildingLocations | null>(null);
  const [loadingUnits, setLoadingUnits] = useState(false);

  useEffect(() => {
    getBuildings()
      .then(setBuildings)
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    // Sin edificio seleccionado no hay nada que cargar; `locations` ya arranca
    // en null y el campo Unidad queda disabled, así que no hace falta resetear
    // estado acá. El flag de carga se prende en el onChange del edificio (un
    // event handler, no acá): un setState incondicional al entrar al efecto
    // es justo el patrón que desaconseja la guía de React
    // (https://react.dev/learn/you-might-not-need-an-effect) y que marca el
    // lint — acá solo queda apagarlo en el callback async, que sí sincroniza
    // con un sistema externo.
    if (!buildingId) {
      return;
    }

    let cancelled = false;

    getBuildingLocations(Number(buildingId))
      .then((data) => {
        if (!cancelled) setLocations(data);
      })
      .catch(() => {
        if (!cancelled) setLocations({ buildingId: Number(buildingId), floors: [], unassignedAreas: [] });
      })
      .finally(() => {
        if (!cancelled) setLoadingUnits(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  const buildingOptions = useMemo<SearchableSelectOption[]>(
    () =>
      buildings.map((building) => ({
        value: String(building.id),
        label: building.description ?? building.name,
      })),
    [buildings],
  );

  const unitOptions = useMemo<SearchableSelectOption[]>(() => {
    if (!locations) return [];

    const fromFloors = locations.floors.flatMap((floor) =>
      floor.areas
        .filter((area) => area.kind === "Unit")
        .map((area) => ({ value: String(area.id), label: area.label, group: floor.label })),
    );

    const fromUnassigned = locations.unassignedAreas
      .filter((area) => area.kind === "Unit")
      .map((area) => ({
        value: String(area.id),
        label: area.label,
        group: "Sin planta asignada",
      }));

    return [...fromFloors, ...fromUnassigned];
  }, [locations]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700">
          Edificio {required ? <span className="text-red-500">*</span> : null}
        </label>
        <SearchableSelect
          id="buildingId"
          value={buildingId}
          onChange={(next) => {
            onBuildingChange(next);
            onUnitChange("");
            setLoadingUnits(Boolean(next));
          }}
          options={buildingOptions}
          placeholder="Seleccionar edificio"
          searchPlaceholder="Buscar edificio..."
          emptyMessage="Sin edificios"
          required={required}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700">
          Unidad {required ? <span className="text-red-500">*</span> : null}
        </label>
        <SearchableSelect
          id="unitId"
          value={unitId}
          onChange={onUnitChange}
          options={unitOptions}
          disabled={!buildingId}
          loading={loadingUnits}
          loadingMessage="Cargando unidades..."
          invalid={invalid}
          required={required}
          placeholder={buildingId ? "Buscar unidad..." : "Seleccione primero el edificio"}
          searchPlaceholder="Buscar unidad..."
          emptyMessage="Sin unidades"
        />
      </div>
    </div>
  );
};
