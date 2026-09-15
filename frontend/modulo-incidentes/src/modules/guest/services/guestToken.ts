/**
 * `sessionStorage` y una clave propia: el token vale lo que el PIN de la puerta,
 * no debe sobrevivir a la pestaña, y `clearSession()` del personal no lo toca.
 */
const GUEST_TOKEN_KEY = "dt4fm-guest-token";

export const readGuestToken = (): string => {
  try {
    return sessionStorage.getItem(GUEST_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
};

export const storeGuestToken = (token: string): void => {
  try {
    sessionStorage.setItem(GUEST_TOKEN_KEY, token);
  } catch {
    // Sin almacenamiento (modo privado estricto) el portal sigue funcionando
    // mientras la pestaña no se recargue.
  }
};
