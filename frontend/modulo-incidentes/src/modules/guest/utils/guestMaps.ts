/**
 * Google Maps sin clave de API. El embed con `output=embed` no está documentado
 * oficialmente: si Google lo retira solo se pierde la miniatura, el enlace (Maps
 * URLs, documentado) sigue abriendo la app.
 */
const query = (address: string) => encodeURIComponent(`${address}, Ecuador`);

export const mapsEmbedUrl = (address: string): string =>
  `https://www.google.com/maps?q=${query(address)}&output=embed`;

export const mapsLinkUrl = (address: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${query(address)}`;
