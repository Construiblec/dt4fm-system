export type Camera = {
  cameraId: string;
  name: string;
};

export type CameraBuilding = {
  buildingId: number;
  name: string;
  /** `false`: el gateway del edificio no respondió en la última consulta. */
  reachable: boolean;
  cameras: Camera[];
};

export type CamerasOverview = {
  /** Con `false`, el video en vivo está apagado en el backend. */
  enabled: boolean;
  /** La VPS no respondió: son las cámaras conocidas. */
  stale: boolean;
  buildings: CameraBuilding[];
};

/** Respuesta de la VPS tal cual. `ticket` y `credential` no se guardan en ningún sitio. */
export type LiveSession = {
  requestId: string;
  cameraId: string;
  buildingId: number;
  whepUrl: string;
  ticket: string;
  ticketExpiresAt: string;
  maxDurationSeconds: number;
  iceServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
};
