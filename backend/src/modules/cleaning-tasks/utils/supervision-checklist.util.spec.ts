import { readFileSync } from 'fs';
import { join } from 'path';
import { readCsvTemplate } from './csv-template.util';
import {
  groupPointsByArea,
  parseSupervisionChecklist,
  splitCsvRow,
  validateSupervisionTemplate,
} from './supervision-checklist.util';

/** Copia del `Book1.csv` que cuelga de la tarjeta SUPERVISION (BOM y CRLF incluidos). */
const book1 = readFileSync(
  join(__dirname, '__fixtures__', 'supervision-book1.csv'),
);

const rowsOf = (buffer: Buffer): string[] => {
  const parsed = readCsvTemplate(buffer);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.rows;
};

describe('parseSupervisionChecklist', () => {
  it('lee el Book1 real: 19 puntos en cinco áreas, y el 1 es «Tendido de camas»', () => {
    const result = parseSupervisionChecklist(rowsOf(book1));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toHaveLength(19);
    expect(result.points[0]).toMatchObject({
      index: 1,
      area: 'Dormitorios',
      name: 'Tendido de camas',
    });
    expect(result.points[18].index).toBe(19);

    const areas = groupPointsByArea(result.points);
    expect(areas.map((a) => [a.name, a.points.length])).toEqual([
      ['Dormitorios', 3],
      ['Cocina', 5],
      ['Baños', 5],
      ['Áreas restantes', 4],
      ['Revisión general', 2],
    ]);
  });

  it('el Book1 real pasa la validación de la plantilla (19 puntos exactos)', () => {
    expect(validateSupervisionTemplate(rowsOf(book1)).ok).toBe(true);
  });

  it('respeta el punto y coma y las comillas dobles dentro de comillas', () => {
    const result = parseSupervisionChecklist([
      'area;guia_area;nombre_item;descripcion_criterio',
      'Cocina;"Guía; con punto y coma";Vajilla;"Dice ""limpia"""',
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points[0]).toEqual({
      index: 1,
      area: 'Cocina',
      areaGuide: 'Guía; con punto y coma',
      name: 'Vajilla',
      criterion: 'Dice "limpia"',
    });
  });

  it('acepta coma como separador si el encabezado la usa', () => {
    const result = parseSupervisionChecklist([
      'area,guia_area,nombre_item,descripcion_criterio',
      'Baños,Revisa,Inodoro,Sin sarro',
    ]);

    expect(result.ok).toBe(true);
  });

  it('acepta el encabezado con tildes, mayúsculas o espacios', () => {
    const result = parseSupervisionChecklist([
      'Área;Guía área;Nombre item;Descripción criterio',
      'Baños;Revisa;Inodoro;Sin sarro',
    ]);

    expect(result.ok).toBe(true);
  });

  it('rechaza el formato de 3 columnas del checklist de ejecución', () => {
    const result = parseSupervisionChecklist([
      'seccion;actividad;detalle',
      'Cocina;Lavar;Todo',
    ]);

    expect(result.ok).toBe(false);
  });

  it('rechaza una fila sin nombre de punto', () => {
    const result = parseSupervisionChecklist([
      'area;guia_area;nombre_item;descripcion_criterio',
      'Cocina;Guía;;Criterio',
    ]);

    expect(result).toEqual({
      ok: false,
      reason: 'la fila 2 no tiene área o nombre del punto',
    });
  });

  it('ignora las filas de puros separadores que deja Excel', () => {
    const result = parseSupervisionChecklist([
      'area;guia_area;nombre_item;descripcion_criterio',
      'Cocina;Guía;Vajilla;Criterio',
      ';;;',
    ]);

    expect(result.ok && result.points).toHaveLength(1);
  });

  it('con un número esperado, rechaza un CSV con filas de más o de menos', () => {
    const result = parseSupervisionChecklist(
      [
        'area;guia_area;nombre_item;descripcion_criterio',
        'Cocina;Guía;Vajilla;Criterio',
      ],
      19,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('19 puntos');
  });
});

describe('splitCsvRow', () => {
  it('corta por el separador fuera de comillas y recorta espacios', () => {
    expect(splitCsvRow(' a ; "b;c" ;d', ';')).toEqual(['a', 'b;c', 'd']);
  });
});
