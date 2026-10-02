import type { LiveConnection } from "@/modules/supervisor-cav/services/whepClient";
import type { LiveSession } from "@/modules/supervisor-cav/types/Camera";

/** Con `VITE_CAV_MOCK=true`: un lienzo con la hora en lugar del video, para probar los estados. */
export const watchCameraMock = async (
  video: HTMLVideoElement,
  session: LiveSession,
): Promise<LiveConnection> => {
  await new Promise((resolve) => setTimeout(resolve, 800));

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");

  const draw = () => {
    if (!context) return;
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f8fafc";
    context.font = "bold 32px sans-serif";
    context.fillText(session.cameraId, 32, 120);
    context.font = "28px monospace";
    context.fillText(new Date().toLocaleTimeString("es-EC"), 32, 170);
    context.fillStyle = "#94a3b8";
    context.font = "20px sans-serif";
    context.fillText("Simulación: sin video real", 32, 320);
  };

  draw();
  const timer = window.setInterval(draw, 500);
  const stream = canvas.captureStream(2);
  video.srcObject = stream;

  return {
    async close() {
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
    },
  };
};
