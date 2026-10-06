import { readCsvTemplate } from './csv-template.util';

/** Atajo: casi todos los casos parten de bytes UTF-8. */
const utf8 = (text: string) => Buffer.from(text, 'utf8');

const rowsOf = (result: ReturnType<typeof readCsvTemplate>) => {
  if (!result.ok) throw new Error(`se esperaba ok, vino: ${result.reason}`);
  return result.rows;
};

/**
 * Estrecha el tipo en vez de comparar contra `expect.stringContaining`, que
 * devuelve `any` y hace saltar la regla no-unsafe-assignment.
 */
const reasonOf = (result: ReturnType<typeof readCsvTemplate>) => {
  if (result.ok) throw new Error('se esperaba un rechazo, pero el CSV se leyó');
  return result.reason;
};

describe('readCsvTemplate', () => {
  describe('rechazos', () => {
    it('rechaza un buffer vacío', () => {
      expect(reasonOf(readCsvTemplate(Buffer.alloc(0)))).toContain('vacía');
    });

    it('rechaza null y undefined sin lanzar', () => {
      expect(readCsvTemplate(null).ok).toBe(false);
      expect(readCsvTemplate(undefined).ok).toBe(false);
    });

    it('rechaza un archivo por encima del tope', () => {
      const oversized = Buffer.alloc(1024 * 1024 + 1, 0x41);

      expect(reasonOf(readCsvTemplate(oversized))).toContain('máximo');
    });

    // El error más probable en la práctica: "Guardar como" deja .xlsx si no se
    // elige CSV a mano. Sin esto, el operario vería basura binaria como checklist.
    it('detecta un .xlsx subido por error y dice qué hacer', () => {
      const xlsx = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.alloc(50),
      ]);
      const result = readCsvTemplate(xlsx);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toContain('xlsx/ods');
      expect(result.reason).toContain('exportarla como CSV');
    });

    it('detecta .xls y .pdf', () => {
      const xls = Buffer.concat([
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
        Buffer.alloc(50),
      ]);
      const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(50)]);

      expect(readCsvTemplate(xls).ok).toBe(false);
      expect(readCsvTemplate(pdf).ok).toBe(false);
    });

    it('rechaza un archivo que solo tiene líneas en blanco', () => {
      expect(readCsvTemplate(utf8('\n\n   \n\r\n')).ok).toBe(false);
    });
  });

  describe('codificación', () => {
    it('lee UTF-8 plano', () => {
      const result = readCsvTemplate(utf8('Baño,Barrer,3'));

      expect(rowsOf(result)).toEqual(['Baño,Barrer,3']);
      expect(result.ok && result.encoding).toBe('utf-8');
    });

    // Si el BOM sobrevive se pega al inicio de la primera celda: deja de
    // coincidir con el encabezado esperado y arruina el primer titulo.
    it('saca el BOM de UTF-8 en vez de pegarlo a la primera celda', () => {
      const withBom = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        utf8('Título,Actividad,Minutos'),
      ]);

      expect(rowsOf(readCsvTemplate(withBom))).toEqual([
        'Título,Actividad,Minutos',
      ]);
      expect(rowsOf(readCsvTemplate(withBom))[0].charCodeAt(0)).not.toBe(
        0xfeff,
      );
    });

    // Excel en español guarda CSV en Windows-1252. Leerlo como UTF-8 destruye
    // todas las tildes y la ñ.
    it('detecta Windows-1252 y conserva las tildes y la ñ', () => {
      const latin1 = Buffer.from('Baño,Frotar paredes y grifería,8', 'latin1');
      const result = readCsvTemplate(latin1);

      expect(rowsOf(result)).toEqual(['Baño,Frotar paredes y grifería,8']);
      expect(result.ok && result.encoding).toBe('windows-1252');
      expect(rowsOf(result)[0]).not.toContain(String.fromCharCode(0xfffd));
    });

    it('lee UTF-16LE con BOM (el "Texto Unicode" de Excel)', () => {
      const utf16 = Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from('Baño,Barrer,3', 'utf16le'),
      ]);
      const result = readCsvTemplate(utf16);

      expect(rowsOf(result)).toEqual(['Baño,Barrer,3']);
      expect(result.ok && result.encoding).toBe('utf-16');
    });

    it('lee UTF-16BE con BOM', () => {
      const body = Buffer.from('Baño,Barrer,3', 'utf16le');
      body.swap16();
      const utf16be = Buffer.concat([Buffer.from([0xfe, 0xff]), body]);

      expect(rowsOf(readCsvTemplate(utf16be))).toEqual(['Baño,Barrer,3']);
    });

    it('no confunde ASCII de largo impar con UTF-16', () => {
      const result = readCsvTemplate(utf8('abc'));

      expect(rowsOf(result)).toEqual(['abc']);
      expect(result.ok && result.encoding).toBe('utf-8');
    });
  });

  describe('corte en filas', () => {
    it('corta por CRLF, CR y LF por igual', () => {
      const expected = ['Baño,Barrer,3', 'Baño,Trapear,2'];

      expect(
        rowsOf(readCsvTemplate(utf8('Baño,Barrer,3\r\nBaño,Trapear,2'))),
      ).toEqual(expected);
      expect(
        rowsOf(readCsvTemplate(utf8('Baño,Barrer,3\rBaño,Trapear,2'))),
      ).toEqual(expected);
      expect(
        rowsOf(readCsvTemplate(utf8('Baño,Barrer,3\nBaño,Trapear,2'))),
      ).toEqual(expected);
    });

    it('descarta líneas en blanco y recorta los espacios de los extremos', () => {
      const csv = '  Baño,Barrer,3  \n\n   \nBaño,Trapear,2\n';

      expect(rowsOf(readCsvTemplate(utf8(csv)))).toEqual([
        'Baño,Barrer,3',
        'Baño,Trapear,2',
      ]);
    });

    it('deja el punto y coma intacto: el separador lo decide el parser del front', () => {
      expect(rowsOf(readCsvTemplate(utf8('Baño;Barrer;3')))).toEqual([
        'Baño;Barrer;3',
      ]);
    });
  });

  describe('celdas multilínea', () => {
    // Un Alt+Enter dentro de una celda de Excel produce esto. Cortar ahí partiría
    // la actividad en dos filas basura.
    it('no corta en un salto de línea que está dentro de comillas', () => {
      const csv =
        'Baño,"Frotar paredes\ny también el espejo",8\nCocina,Lavar,4';

      expect(rowsOf(readCsvTemplate(utf8(csv)))).toEqual([
        'Baño,"Frotar paredes y también el espejo",8',
        'Cocina,Lavar,4',
      ]);
    });

    it('aplana el CRLF interno a un solo espacio', () => {
      const csv = 'Baño,"Frotar paredes\r\ny el espejo",8';

      expect(rowsOf(readCsvTemplate(utf8(csv)))).toEqual([
        'Baño,"Frotar paredes  y el espejo",8',
      ]);
    });

    it('las comillas escapadas no desbalancean el seguimiento', () => {
      const csv = 'Baño,"Usar el spray ""verde""",3\nCocina,Lavar,4';

      expect(rowsOf(readCsvTemplate(utf8(csv)))).toEqual([
        'Baño,"Usar el spray ""verde""",3',
        'Cocina,Lavar,4',
      ]);
    });

    // Sin este respaldo, una comilla sin cerrar pegaría el archivo entero en una
    // sola fila y el checklist quedaría en un único ítem gigante.
    it('ante comillas sin cerrar vuelve al corte por línea', () => {
      const csv = 'Baño,"Limpiar sin cerrar,3\nCocina,Lavar,4\nSala,Aspirar,5';
      const rows = rowsOf(readCsvTemplate(utf8(csv)));

      expect(rows).toEqual([
        'Baño,"Limpiar sin cerrar,3',
        'Cocina,Lavar,4',
        'Sala,Aspirar,5',
      ]);
    });
  });

  // Lo que hace que el frontend no tenga que enterarse de nada: las filas que
  // salen de un archivo son indistinguibles de las que salen de `Detalle`.
  it('produce el mismo arreglo que el camino actual de Detalle', () => {
    const contenido = [
      'Título,Actividad,Minutos',
      'Dormitorio,Separar la cama del espaldar,2',
      'Baño,"Frotar paredes, azulejos y grifería",8',
    ].join('\n');

    const porDetalle = contenido
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    expect(rowsOf(readCsvTemplate(utf8(contenido)))).toEqual(porDetalle);
  });
});
