import { useParams } from "react-router-dom";
import { CorrectiveSupervisorDetailPage } from "@/modules/supervisor-mantenimiento/pages/CorrectiveSupervisorDetailPage";
import { PreventiveSupervisorDetailPage } from "@/modules/supervisor-mantenimiento/pages/PreventiveSupervisorDetailPage";

/** `/supervisor-mantenimiento/:kind/:id`: cada tipo tiene su propio detalle. */
export const MaintenanceSupervisorDetailPage = () => {
  const { kind = "corrective" } = useParams();

  return kind === "preventive" ? (
    <PreventiveSupervisorDetailPage />
  ) : (
    <CorrectiveSupervisorDetailPage />
  );
};
