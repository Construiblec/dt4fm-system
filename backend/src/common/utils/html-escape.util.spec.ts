import { escapeHtml } from './html-escape.util';

describe('escapeHtml', () => {
  it('neutraliza el marcado', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('escapa ampersand y comilla simple', () => {
    expect(escapeHtml("Tom & Jerry's")).toBe('Tom &amp; Jerry&#39;s');
  });

  it('convierte nulos en cadena vacía y deja el texto normal intacto', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('Baño principal, piso 3')).toBe('Baño principal, piso 3');
  });
});
