import axios from "axios";
import { env } from "@/config/env";

const incidentsApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

export type CreateIncidentPayload = {
  buildingId: string;
  floorArea: string;
  priority: number;
  notes: string;
  images?: File[];
};

export type CreateIncidentResponse = {
  incidentId: number;
  attachmentsUploaded: number;
  attachmentsFailed: number;
};

export const createIncident = async ({
  buildingId,
  floorArea,
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
