import { useQuery } from "@tanstack/react-query";
import { getCategories } from "@/shared/services/categoriesService";

/**
 * Subcategorías de Limpieza (LIM): la misma lista para todos los puntos. El
 * backend vuelve a comprobar que la elegida sea de LIM.
 */
export const useCleaningSubcategories = () => {
  const query = useQuery({
    queryKey: ["maint-categories"],
    queryFn: getCategories,
    staleTime: 15 * 60_000,
  });

  const lim =
    query.data?.find((category) => category.code.toUpperCase() === "LIM") ??
    null;

  return {
    subcategories: lim?.subcategories ?? [],
    loading: query.isLoading,
    error: query.isError,
  };
};
