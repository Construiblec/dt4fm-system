import { Injectable } from '@nestjs/common';

/**
 * Renderizador de plantillas.
 *
 * Reemplaza marcadores de la forma {{clave}} dentro del asunto y el cuerpo
 * con los valores provistos en un mapa de variables. Se mantiene
 * deliberadamente simple (sin lógica, sin condicionales) para el caso
 * actual; si en el futuro se necesitan condicionales o bucles, esta clase
 * es el único punto a cambiar (p. ej. integrando Handlebars).
 *
 * Ejemplo:
 *   plantilla:  "Hola {{nombre}}, su pago de {{monto}} está listo"
 *   variables:  { nombre: "Ana", monto: "$50" }
 *   resultado:  "Hola Ana, su pago de $50 está listo"
 *
 * Las claves sin valor se reemplazan por cadena vacía para no dejar
 * marcadores crudos visibles en el correo final.
 */
@Injectable()
export class TemplateRenderer {
  private readonly placeholderPattern = /\{\{\s*([\w.]+)\s*\}\}/g;

  render(template: string, variables: Record<string, string>): string {
    if (!template) {
      return '';
    }

    return template.replace(this.placeholderPattern, (_match, key: string) => {
      const value = variables[key];
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  /**
   * Devuelve la lista de variables ({{...}}) presentes en una plantilla.
   * Útil para validar o mostrar al admin qué variables soporta su plantilla.
   */
  extractVariables(template: string): string[] {
    if (!template) {
      return [];
    }

    const found = new Set<string>();
    let match: RegExpExecArray | null;
    const pattern = new RegExp(this.placeholderPattern);

    while ((match = pattern.exec(template)) !== null) {
      found.add(match[1]);
    }

    return [...found];
  }
}
