/** Ya instalada: iOS lo expone en navigator.standalone; el resto, display-mode. */
export const isRunningStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: window-controls-overlay)").matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPadOS 13+ se anuncia como Macintosh; se distingue por los puntos tactiles. */
export const isIos = () => {
  const ua = window.navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1)
  );
};

/** Solo Safari en iOS ofrece "Añadir a pantalla de inicio". */
export const isIosSafari = () =>
  isIos() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(window.navigator.userAgent);
