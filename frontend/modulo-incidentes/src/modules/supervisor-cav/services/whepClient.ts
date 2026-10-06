import type { LiveSession } from "@/modules/supervisor-cav/types/Camera";

/** La VPS espera hasta 10 s el primer cuadro antes de responder la oferta. */
const OFFER_TIMEOUT_MS = 15_000;
const GATHERING_TIMEOUT_MS = 4_000;

/** `status` 0: la respuesta no llegó (`timeout` o `network`). */
export class WhepError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "WhepError";
    this.status = status;
    this.code = code;
  }
}

export type LiveConnection = {
  close: () => Promise<void>;
};

const gatheringComplete = (pc: RTCPeerConnection, timeoutMs: number) => {
  if (pc.iceGatheringState === "complete") return Promise.resolve();

  return new Promise<void>((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, timeoutMs);
  });
};

const readError = async (response: Response) => {
  try {
    const body = (await response.json()) as { code?: string; message?: string };
    return new WhepError(
      response.status,
      body.code ?? `http_${response.status}`,
      body.message ?? response.statusText,
    );
  } catch {
    return new WhepError(response.status, `http_${response.status}`, response.statusText);
  }
};

const postOffer = async (session: LiveSession, sdp: string) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), OFFER_TIMEOUT_MS);

  try {
    return await fetch(session.whepUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        Authorization: `Bearer ${session.ticket}`,
      },
      body: sdp,
      signal: controller.signal,
    });
  } catch (error) {
    throw controller.signal.aborted
      ? new WhepError(0, "timeout", "La cámara no respondió a tiempo")
      : new WhepError(0, "network", (error as Error).message);
  } finally {
    window.clearTimeout(timer);
  }
};

/**
 * WHEP sin trickle, como el cliente de referencia de IoT: una sola oferta con
 * todos los candidatos, que solo son de relay. Un ticket vale para una oferta.
 */
export const watchCamera = async (
  video: HTMLVideoElement,
  session: LiveSession,
  onEnded: () => void,
): Promise<LiveConnection> => {
  const pc = new RTCPeerConnection({
    iceServers: session.iceServers,
    iceTransportPolicy: session.iceTransportPolicy,
  });
  let closed = false;

  pc.addTransceiver("video", { direction: "recvonly" });
  pc.ontrack = (event) => {
    video.srcObject = event.streams[0] ?? new MediaStream([event.track]);
  };
  // Así termina la sesión cuando la VPS corta a los 300 s.
  pc.onconnectionstatechange = () => {
    if (closed) return;
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      onEnded();
    }
  };

  try {
    await pc.setLocalDescription(await pc.createOffer());
    await gatheringComplete(pc, GATHERING_TIMEOUT_MS);

    const response = await postOffer(session, pc.localDescription?.sdp ?? "");
    if (response.status !== 201) throw await readError(response);

    // `Location` es relativa al hostname de video.
    const resource = new URL(response.headers.get("Location") ?? "", session.whepUrl);
    await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });

    return {
      async close() {
        if (closed) return;
        closed = true;
        pc.close();
        // keepalive: que el cierre salga aunque la página se esté yendo.
        await fetch(resource, { method: "DELETE", keepalive: true }).catch(() => {});
      },
    };
  } catch (error) {
    closed = true;
    pc.close();
    throw error;
  }
};
