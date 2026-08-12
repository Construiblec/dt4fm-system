import axios from "axios";
import { env } from "@/config/env";
import type { Incident } from "@/modules/incidentes/types/Incident";

const incidentsApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

export type CreateIncidentPayload = {
  buildingId: string;
  floorArea: string;
  /** Ubicación estructurada; se omite lo que el usuario no haya elegido */
  floorId?: number | null;
  unitId?: number | null;
  commonAreaId?: number | null;
  priority: number;
  notes: string;
  images?: File[];
};

export type CreateIncidentResponse = {
  incidentId: number;
  attachmentsUploaded: number;
  attachmentsFailed: number;
};

type GetMyIncidentsResponse = {
  incidents: Incident[];
};

export const createIncident = async ({
  buildingId,
  floorArea,
  floorId,
  unitId,
  commonAreaId,
  priority,
  notes,
  images = [],
}: CreateIncidentPayload): Promise<CreateIncidentResponse> => {
  const sessionId = localStorage.getItem("sessionId");
  const employeeId = localStorage.getItem("employeeId");

  const formData = new FormData();
  formData.append("buildingId", buildingId);
  formData.append("floorArea", floorArea);
  formData.append("priority", String(Number(priority)));
  formData.append("notes", notes);

  // Nunca enviar cadenas vacías: el DTO las convertiría en 0 y fallaría el @Min(1)
  const optionalIds = { floorId, unitId, commonAreaId };

  Object.entries(optionalIds).forEach(([key, value]) => {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      formData.append(key, String(value));
    }
  });

  images.forEach((image) => {
    formData.append("images", image);
  });

  const { data } = await incidentsApi.post<CreateIncidentResponse>(
    "/incidents",
    formData,
    {
      headers: {
        Authorization: sessionId ?? "",
        "x-employee-id": employeeId ?? "",
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return data;
};

export const getMyIncidents = async (): Promise<Incident[]> => {
  const sessionId = localStorage.getItem("sessionId");
  const employeeId = localStorage.getItem("employeeId");

  try {
    const { data } = await incidentsApi.get<GetMyIncidentsResponse>(
      "/incidents/my",
      {
        headers: {
          Authorization: sessionId ?? "",
          "x-employee-id": employeeId ?? "",
        },
      },
    );

    return data.incidents;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      window.location.assign("/login");
    }

    throw error;
  }
};
