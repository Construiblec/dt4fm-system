export type IncidentDetail = {
  id: number;
  number: string;
  location: string;
  building: string;
  status: string;
  priority: string;
  createdAt: string;
  notes: string | null;
  images: string[];
};
