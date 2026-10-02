import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { createLiveSession } from "@/modules/supervisor-cav/services/camerasService";
import { isCavMock } from "@/modules/supervisor-cav/services/cavApi";
import {
  watchCamera,
  WhepError,
  type LiveConnection,
} from "@/modules/supervisor-cav/services/whepClient";
import { watchCameraMock } from "@/modules/supervisor-cav/services/whepClient.mock";
import type { LiveSession } from "@/modules/supervisor-cav/types/Camera";
import {
  backendFailure,
  whepFailure,
  type LiveVideoFailure,
} from "@/modules/supervisor-cav/utils/liveVideoMessages";

export type LiveCameraState =
  | "idle"
  | "requesting"
  | "connecting"
  | "live"
  | "ended"
  | "error";

const watch: typeof watchCamera = isCavMock ? watchCameraMock : watchCamera;

const describeBackendError = (error: unknown) =>
  axios.isAxiosError(error)
    ? backendFailure(
        (error.response?.data as { code?: string } | undefined)?.code,
        error.response?.status,
      )
    : backendFailure(undefined, undefined);

/**
 * Una cámara a la vez. Cada clic pide una sesión nueva (un `requestId`, una
 * visualización registrada) y nada reconecta solo: al terminar, el operador
 * decide si continúa.
 */
export const useLiveCamera = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const connectionRef = useRef<LiveConnection | null>(null);
  // Cada intento invalida al anterior: una respuesta tardía no pisa la cámara nueva.
  const attemptRef = useRef(0);
  const stateRef = useRef<LiveCameraState>("idle");
  const maxDurationRef = useRef(0);
  const [state, setState] = useState<LiveCameraState>("idle");
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [failure, setFailure] = useState<LiveVideoFailure | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);

  const setPhase = useCallback((next: LiveCameraState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /** Libera el cupo en la VPS; el `DELETE` sale aunque la página se esté cerrando. */
  const release = useCallback(() => {
    const connection = connectionRef.current;
    connectionRef.current = null;
    void connection?.close();
    if (videoRef.current) videoRef.current.srcObject = null;
    setEndsAt(null);
  }, []);

  const end = useCallback(
    (attempt: number) => {
      if (attempt !== attemptRef.current) return;
      release();
      setPhase("ended");
    },
    [release, setPhase],
  );

  const start = useCallback(
    async (nextCameraId: string) => {
      const attempt = ++attemptRef.current;
      release();
      setCameraId(nextCameraId);
      setFailure(null);
      setPhase("requesting");

      let session: LiveSession;
      try {
        session = await createLiveSession(nextCameraId, crypto.randomUUID());
      } catch (error) {
        if (attempt !== attemptRef.current) return;
        setFailure(describeBackendError(error));
        setPhase("error");
        return;
      }

      // El ticket de un intento abandonado caduca solo a los 60 s.
      const video = videoRef.current;
      if (attempt !== attemptRef.current || !video) return;

      maxDurationRef.current = session.maxDurationSeconds;
      video.muted = true;
      setPhase("connecting");

      try {
        const connection = await watch(video, session, () => end(attempt));
        if (attempt !== attemptRef.current) {
          void connection.close();
          return;
        }
        connectionRef.current = connection;
      } catch (error) {
        if (attempt !== attemptRef.current) return;
        setFailure(
          error instanceof WhepError
            ? whepFailure(error.status, error.code)
            : whepFailure(0, "network"),
        );
        setPhase("error");
      }
    },
    [end, release, setPhase],
  );

  const stop = useCallback(() => {
    attemptRef.current += 1;
    release();
    setCameraId(null);
    setFailure(null);
    setPhase("idle");
  }, [release, setPhase]);

  /** La cuenta de los 300 s empieza con el primer cuadro. */
  const onPlaying = useCallback(() => {
    if (stateRef.current !== "connecting") return;
    setPhase("live");
    setEndsAt(Date.now() + maxDurationRef.current * 1000);
  }, [setPhase]);

  // La VPS corta a los `maxDurationSeconds` con hasta 15 s de margen; aquí se cierra a tiempo.
  useEffect(() => {
    if (endsAt === null) return;

    const attempt = attemptRef.current;
    const timer = window.setTimeout(
      () => end(attempt),
      Math.max(0, endsAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [endsAt, end]);

  useEffect(() => {
    const onPageHide = () => {
      if (connectionRef.current) end(attemptRef.current);
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      attemptRef.current += 1;
      release();
    };
  }, [end, release]);

  return {
    videoRef,
    state,
    cameraId,
    failure,
    endsAt,
    start,
    stop,
    onPlaying,
  };
};
