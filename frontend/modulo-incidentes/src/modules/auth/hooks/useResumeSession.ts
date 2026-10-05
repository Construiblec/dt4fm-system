import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { checkSession } from "@/services/api";
import { consumeReturnTo } from "@/shared/auth/returnTo";
import {
  getHomeRoute,
  hasActiveSession,
  isVisitorSession,
} from "@/shared/auth/session";
import { getSession } from "@/store/sessionStore";

/**
 * Al abrir la app con una sesión guardada, entra directo en vez de pedir la
 * contraseña.
 *
 * La PWA arranca en `/` (`start_url`), y `/` es el login: sin esto, cerrar y
 * volver a abrir la app enseñaba el formulario aunque la sesión siguiera viva,
 * y «Mantener la sesión iniciada» no servía de nada.
 *
 * Antes de entrar se pregunta al backend, así una sesión caducada se queda en
 * el login y no rebota entre pantallas. Devuelve `true` mientras pregunta, para
 * no enseñar el formulario un instante y quitarlo.
 */
export const useResumeSession = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(
    () => hasActiveSession() && !isVisitorSession(),
  );

  useEffect(() => {
    if (!checking) return;

    let cancelled = false;

    checkSession()
      .then(() => true)
      // Solo un 401 dice que la sesión murió. Sin red u openMAINT caído se
      // entra igual: pedir la contraseña tampoco funcionaría.
      .catch(
        (error: unknown) =>
          !(axios.isAxiosError(error) && error.response?.status === 401),
      )
      .then((resume) => {
        if (cancelled) return;

        if (!resume) {
          setChecking(false);
          return;
        }

        const { username, role } = getSession();
        navigate(consumeReturnTo(username) ?? getHomeRoute(role), {
          replace: true,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [checking, navigate]);

  return checking;
};
