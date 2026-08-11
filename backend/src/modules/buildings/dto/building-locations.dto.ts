export type LocationAreaKind = 'Unit' | 'CommonArea';

export type LocationAreaDto = {
  id: number;
  code: string | null;
  name: string | null;
  description: string | null;
  /** Texto de presentación ya resuelto (Description || Name || Code) */
  label: string;
  kind: LocationAreaKind;
  floorId: number | null;
};

export type LocationFloorDto = {
  id: number;
  code: string | null;
  name: string | null;
  description: string | null;
  /** Texto de presentación ya resuelto (Description || Name || Code) */
  label: string;
  areas: LocationAreaDto[];
};

export type BuildingLocationsDto = {
  buildingId: number;
  floors: LocationFloorDto[];
  /** Áreas del edificio sin planta asignada (o cuya planta pertenece a otro edificio) */
  unassignedAreas: LocationAreaDto[];
};
