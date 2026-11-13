import {
  ACCESS_SCOPES_BY_LEVEL,
  type AccessScope,
  type Authorization,
} from "@/modules/supervisor-cav/types/Authorization";

export type DoorState =
  | "active"
  | "none"
  | "activating"
  | "removing"
  | "activateFailed"
  | "removeFailed";

export type DoorView = { scope: AccessScope; label: string; state: DoorState };

export type AccessNotice = {
  tone: "amber" | "red";
  title: string;
  body: string;
  retry: boolean;
};

export type AccessDoorsView = {
  /** Lista por puerta; vacía en un revocado que ya se confirmó. */
  doors: DoorView[];
  /** Texto gris bajo la lista mientras se aplica solo. */
  pendingNote: string | null;
  notice: AccessNotice | null;
  /** Las puertas ya reflejan lo pedido. */
  settled: boolean;
};

const DOORS: { scope: AccessScope; label: string }[] = [
  { scope: "pedestrian", label: "Peatonal" },
  { scope: "vehicular", label: "Vehicular" },
];

const RETRIES_ALONE = "Se reintenta solo.";

const entrance = (doors: DoorView[]) => {
  const names = doors.map((door) => door.label.toLowerCase());
  return names.length > 1
    ? `las entradas ${names.join(" y ")}`
    : `la entrada ${names[0]}`;
};

const access = (doors: DoorView[]) =>
  `el acceso ${doors.map((door) => door.label.toLowerCase()).join(" y ")}`;

/** Lo pedido frente a lo que confirmaron las puertas, para la tarjeta «Nivel de acceso». */
export const accessDoorsView = (
  authorization: Authorization,
): AccessDoorsView => {
  const revoked = authorization.accessRevoked !== null;
  const requested =
    authorization.desiredScopes ??
    (authorization.accessLevel
      ? ACCESS_SCOPES_BY_LEVEL[authorization.accessLevel]
      : []);
  // Sin los campos nuevos (backend anterior) se da por aplicado lo pedido.
  const confirmed = authorization.confirmedScopes ?? requested;
  const status = authorization.syncStatus ?? "confirmed";
  const failed = status === "failed";

  const doors = DOORS.map(({ scope, label }): DoorView => {
    const wanted = requested.includes(scope);
    const there = confirmed.includes(scope);
    const state: DoorState =
      wanted && there
        ? "active"
        : !wanted && !there
          ? "none"
          : wanted
            ? failed
              ? "activateFailed"
              : "activating"
            : failed
              ? "removeFailed"
              : "removing";
    return { scope, label, state };
  });

  const removing = doors.filter(
    (door) => door.state === "removing" || door.state === "removeFailed",
  );
  const activating = doors.filter(
    (door) => door.state === "activating" || door.state === "activateFailed",
  );
  const settled = removing.length === 0 && activating.length === 0;

  let notice: AccessNotice | null = null;
  let pendingNote: string | null = null;

  if (failed && !settled) {
    notice = revoked
      ? {
          tone: "red",
          title: "No se pudo quitar el PIN de las puertas",
          body: "El PIN todavía puede abrir alguna entrada.",
          retry: true,
        }
      : removing.length > 0
        ? {
            tone: "red",
            title: `No se pudo quitar ${access(removing)}`,
            body: `El PIN todavía abre ${entrance(removing)}.`,
            retry: true,
          }
        : {
            tone: "red",
            title: `No se pudo activar ${access(activating)}`,
            body: `El PIN todavía no abre ${entrance(activating)}.`,
            retry: true,
          };
  } else if (!settled && !revoked) {
    pendingNote =
      removing.length > 0
        ? `Hasta que la puerta lo confirme, el PIN todavía abre ${entrance(removing)}. ${RETRIES_ALONE}`
        : `El PIN todavía no abre ${entrance(activating)}. ${RETRIES_ALONE}`;
  } else if (
    settled &&
    !revoked &&
    authorization.syncError === "pin_conflict"
  ) {
    const missing = doors.filter((door) => door.state === "none");
    notice = {
      tone: "amber",
      title:
        missing.length > 0
          ? `No se activó ${access(missing)}`
          : "No se amplió el acceso",
      body: "El PIN coincide con el de otro usuario de esa entrada. Renueva el PIN y vuelve a intentarlo.",
      retry: false,
    };
  }

  return {
    doors: revoked && settled ? [] : doors,
    pendingNote,
    notice,
    settled,
  };
};
