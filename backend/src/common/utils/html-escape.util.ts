const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Para interpolar texto libre en HTML de correos: ningún valor debe poder inyectar marcado. */
export const escapeHtml = (value: string | number | null | undefined): string =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ENTITIES[char]);
