import axios from "axios";
import { env } from "@/config/env";
import { attachSessionRenewal } from "@/shared/auth/sessionHttp";

export type MaintSubcategory = { id: number; name: string; isOther: boolean };

export type MaintCategory = {
  id: number;
  code: string;
  name: string;
  /** «Otro» viene siempre al final. */
  subcategories: MaintSubcategory[];
};

const categoriesApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

attachSessionRenewal(categoriesApi, "authorization");

export const getCategories = async (): Promise<MaintCategory[]> => {
  const { data } = await categoriesApi.get<MaintCategory[]>(
    "/incidents/categories",
    { headers: { Authorization: localStorage.getItem("sessionId") ?? "" } },
  );

  return data;
};
