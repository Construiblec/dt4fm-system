export type LocationAreaKind = "Unit" | "CommonArea";

export type LocationArea = {
  id: number;
  code: string | null;
  name: string | null;
  description: string | null;
  label: string;
  kind: LocationAreaKind;
  floorId: number | null;
};

export type LocationFloor = {
  id: number;
  code: string | null;
  name: string | null;
  description: string | null;
  label: string;
  areas: LocationArea[];
};

export type BuildingLocations = {
  buildingId: number;
  floors: LocationFloor[];
  /** Áreas del edificio sin planta asignada */
  unassignedAreas: LocationArea[];
};
