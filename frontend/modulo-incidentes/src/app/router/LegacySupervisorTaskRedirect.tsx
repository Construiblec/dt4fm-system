import { Navigate, useParams } from "react-router-dom";

/**
 * La ficha `/supervisor/tasks/:id` se retiró. Los avisos que ya se guardaron
 * (push `cleaning.completed` a AsistenteSL y SuperUser) la siguen apuntando, y
 * sin esta ruta darían 404: llevan a la ficha de AsistenteSL, a la que ambos
 * roles pueden entrar.
 */
export const LegacySupervisorTaskRedirect = () => {
  const { id = "" } = useParams();
  return <Navigate to={`/asistente-sl/tasks/${id}`} replace />;
};
