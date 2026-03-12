import axios from "axios";
import { env } from "@/config/env";
import type { Building } from "@/modules/incidentes/types/Building";

const buildingsApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
  headers: {
    "Content-Type": "application/json",
  },
});

export const getBuildings = async (): Promise<Building[]> => {
  const sessionId = localStorage.getItem("sessionId");

  const { data } = await buildingsApi.get<Building[]>("/buildings", {
    headers: {
      Authorization: sessionId ?? "",
    },
  });

  return data;
};
