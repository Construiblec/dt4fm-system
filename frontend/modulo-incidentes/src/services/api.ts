import axios from "axios";
import { env } from "@/config/env";

export type LoginResponse = {
  sessionId: string;
  employeeId: string;
  username: string;
  role: string;
  cleaningEmployeeId?: string | number;
};

const backendBaseUrl = env.VITE_API_URL.replace(/\/api\/?$/, "");

const authApi = axios.create({
  baseURL: backendBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

export const login = async (
  username: string,
  password: string,
): Promise<LoginResponse> => {
  const { data } = await authApi.post<LoginResponse>("/auth/login", {
    username,
    password,
  });

  return data;
};
