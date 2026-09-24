import { describe, expect, it } from "vitest";
import {
  countChecklistActivities,
  countCompletedSections,
  formatMinutes,
  getChecklistSignature,
  getSectionIndices,
  isSectionComplete,
  parseCleaningChecklist,
  type ChecklistSection,
} from "@/modules/incidentes/utils/cleaningChecklistUtils";

/** Aplana las actividades de todas las secciones, en orden. */
const flatten = (sections: ChecklistSection[]) =>
  sections.flatMap((section) => section.items);

describe("parseCleaningChecklist — comillas", () => {
  it("respeta las comas dentro de un campo entrecomillado", () => {
    // La línea canario: es texto real de la plantilla de producción.
    const [section] = parseCleaningChecklist([
      'Baño,"Dejar abierta (con cuña plástica) la puerta de entrada a la unidad unos minutos para que se ventile, al menos mientras se abren las ventanas",4',
    ]);

    expect(section.items).toHaveLength(1);
    expect(section.items[0].text).toBe(
      "Dejar abierta (con cuña plástica) la puerta de entrada a la unidad unos minutos para que se ventile, al menos mientras se abren las ventanas",
    );
    expect(section.items[0].minutes).toBe(4);
  });

  it("convierte `\"\"` en una comilla literal", () => {
    const [section] = parseCleaningChecklist(['Baño,"Usar el spray ""verde""",3']);

    expect(section.items[0].text).toBe('Usar el spray "verde"');
    expect(section.items[0].minutes).toBe(3);
  });

  it("trata una comilla a mitad de campo como texto, no como sintaxis", () => {
    const [section] = parseCleaningChecklist(['Cocina,Revisar tubo de 5" de alto,2']);

    expect(section.items[0].text).toBe('Revisar tubo de 5" de alto');
    expect(section.items[0].minutes).toBe(2);
  });

  it("no pierde texto si la comilla nunca se cierra", () => {
    const [section] = parseCleaningChecklist(['Baño,"Limpiar sin cerrar,3']);

    expect(section.items[0].text).toBe("Limpiar sin cerrar,3");
    expect(section.items[0].minutes).toBeNull();
  });
});

describe("parseCleaningChecklist — separador", () => {
  it("entiende una plantilla exportada con punto y coma", () => {
    const sections = parseCleaningChecklist([
      "Titulo;Actividad;Minutos",
      "Baño;Barrer;3",
      "Baño;Trapear;2",
      "Cocina;Lavar;4",
    ]);

    expect(sections).toHaveLength(2);
    expect(countChecklistActivities(sections)).toBe(3);
    expect(sections[0].title).toBe("Baño");
    expect(sections[0].items[0].text).toBe("Barrer");
    expect(sections[0].totalMinutes).toBe(5);
  });

  it("no confunde el separador cuando el texto está lleno de comas", () => {
    // El caso que rompe un detector que solo cuenta caracteres: acá hay más
    // comas que puntos y coma, pero el separador real es el punto y coma.
    const sections = parseCleaningChecklist([
      "Baño;Frotar paredes, azulejos, grifería y mamparas;8",
      "Cocina;Lavar, secar y guardar platos, ollas y sartenes;12",
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[0].items[0].text).toBe(
      "Frotar paredes, azulejos, grifería y mamparas",
    );
    expect(sections[0].items[0].minutes).toBe(8);
    expect(sections[1].items[0].text).toBe(
      "Lavar, secar y guardar platos, ollas y sartenes",
    );
    expect(sections[1].items[0].minutes).toBe(12);
  });

  it("lee el decimal con coma cuando el separador es punto y coma", () => {
    // Es el combo natural de Excel en español: `;` separa y `,` decimaliza.
    const [section] = parseCleaningChecklist(["Baño;Barrer;2,5"]);

    expect(section.items[0].minutes).toBe(2.5);
  });

  it("sigue prefiriendo la coma cuando ambos separadores empatan", () => {
    const [section] = parseCleaningChecklist(["Baño,Barrer; trapear,3"]);

    expect(section.title).toBe("Baño");
    expect(section.items[0].text).toBe("Barrer; trapear");
    expect(section.items[0].minutes).toBe(3);
  });

  it("respeta las comillas también con punto y coma", () => {
    const [section] = parseCleaningChecklist([
      'Baño;"Frotar paredes; azulejos y grifería";8',
    ]);

    expect(section.items[0].text).toBe("Frotar paredes; azulejos y grifería");
    expect(section.items[0].minutes).toBe(8);
  });
});

describe("parseCleaningChecklist — comas sin entrecomillar", () => {
  it("reúne el texto y conserva los minutos cuando el último campo es numérico", () => {
    const [section] = parseCleaningChecklist([
      "Baño,Frotar paredes, azulejos y grifería,8",
    ]);

    expect(section.items[0].text).toBe("Frotar paredes, azulejos y grifería");
    expect(section.items[0].minutes).toBe(8);
  });

  it("deja el último campo como parte del texto si no es numérico", () => {
    const [section] = parseCleaningChecklist(["Baño,Poner toallas, 2 por persona"]);

    expect(section.items[0].text).toBe("Poner toallas, 2 por persona");
    expect(section.items[0].minutes).toBeNull();
  });
});

describe("parseCleaningChecklist — cabecera", () => {
  it("descarta la cabecera cuando está presente", () => {
    const sections = parseCleaningChecklist([
      "Titulo,Actividad,Minutos",
      "Baño,Barrer,3",
    ]);

    expect(countChecklistActivities(sections)).toBe(1);
    expect(sections[0].items[0].text).toBe("Barrer");
  });

  it("acepta la cabecera con tildes y en otras grafías", () => {
    const sections = parseCleaningChecklist([
      "Sección,Tarea,Minutos",
      "Baño,Barrer,3",
    ]);

    expect(countChecklistActivities(sections)).toBe(1);
  });

  // Encabezado real de la primera plantilla subida a openMAINT. El plural
  // "Actividades" no estaba contemplado y la fila se colaba como una sección.
  it("descarta la cabecera en plural y con punto y coma", () => {
    const sections = parseCleaningChecklist([
      "Seccion;Actividades;tiempo",
      "Seccion 1;el 1;23",
      "seccion 1;el 2;12",
    ]);

    expect(countChecklistActivities(sections)).toBe(2);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Seccion 1");
    // El parser capitaliza el texto visible de cada actividad.
    expect(sections[0].items.map((item) => item.text)).toEqual(["El 1", "El 2"]);
  });

  it("acepta 'elementos' y 'tareas' como columna de actividad", () => {
    expect(
      countChecklistActivities(
        parseCleaningChecklist(["Titulo,Elementos,Minutos", "Baño,Barrer,3"]),
      ),
    ).toBe(1);
    expect(
      countChecklistActivities(
        parseCleaningChecklist(["Secciones,Tareas,Minutos", "Baño,Barrer,3"]),
      ),
    ).toBe(1);
  });

  it("funciona igual sin cabecera", () => {
    const sections = parseCleaningChecklist(["Baño,Barrer,3"]);

    expect(countChecklistActivities(sections)).toBe(1);
  });

  it("no descarta una fila que parece cabecera si no es la primera", () => {
    const sections = parseCleaningChecklist([
      "Baño,Barrer,3",
      "Titulo,Actividad,Minutos",
    ]);

    expect(countChecklistActivities(sections)).toBe(2);
  });
});

describe("parseCleaningChecklist — minutos", () => {
  it.each([
    ["Baño,Barrer,3", 3],
    ['Baño,Barrer,"2,5"', 2.5],
    ["Baño,Barrer,0", 0],
  ])("lee %s como %s", (line, expected) => {
    const [section] = parseCleaningChecklist([line]);
    expect(section.items[0].minutes).toBe(expected);
  });

  it.each([
    "Baño,Barrer,5 min",
    "Baño,Barrer,dos",
    "Baño,Barrer,-1",
    "Baño,Barrer,",
    "Baño,Barrer",
  ])("deja %s sin minutos", (line) => {
    const [section] = parseCleaningChecklist([line]);
    expect(section.items[0].minutes).toBeNull();
  });

  it("suma el total de la sección y marca cuando es parcial", () => {
    const [completa, parcial] = parseCleaningChecklist([
      "Baño,Barrer,3",
      "Baño,Trapear,2",
      "Cocina,Lavar,4",
      "Cocina,Secar",
    ]);

    expect(completa.totalMinutes).toBe(5);
    expect(completa.hasPartialMinutes).toBe(false);
    expect(parcial.totalMinutes).toBe(4);
    expect(parcial.hasPartialMinutes).toBe(true);
  });

  it("deja el total en null si ninguna actividad trae minutos", () => {
    const [section] = parseCleaningChecklist(["Baño,Barrer", "Baño,Trapear"]);

    expect(section.totalMinutes).toBeNull();
    expect(section.hasPartialMinutes).toBe(false);
  });
});

describe("parseCleaningChecklist — secciones", () => {
  it("agrupa las filas consecutivas con el mismo título", () => {
    const sections = parseCleaningChecklist([
      "Baño,Barrer,3",
      "Baño,Trapear,2",
      "Cocina,Lavar,4",
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("Baño");
    expect(sections[0].items).toHaveLength(2);
    expect(sections[1].title).toBe("Cocina");
  });

  it("hereda el título cuando la celda viene vacía", () => {
    const sections = parseCleaningChecklist(["Baño,Barrer,3", ",Trapear,2"]);

    expect(sections).toHaveLength(1);
    expect(sections[0].items).toHaveLength(2);
  });

  it("abre una sección nueva si el título reaparece más abajo", () => {
    const sections = parseCleaningChecklist([
      "Baño,Barrer,3",
      "Cocina,Lavar,4",
      "Baño,Revisar,1",
    ]);

    expect(sections).toHaveLength(3);
    expect(sections.map((section) => section.title)).toEqual([
      "Baño",
      "Cocina",
      "Baño",
    ]);
  });

  it("agrupa títulos que solo difieren en mayúsculas o tildes, mostrando el primero", () => {
    const sections = parseCleaningChecklist(["Baño,Barrer,3", "BAÑO,Trapear,2"]);

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Baño");
  });

  it("pone las filas previas al primer título en una sección sin título", () => {
    const sections = parseCleaningChecklist([",Ponerse guantes,1", "Baño,Barrer,3"]);

    expect(sections[0].title).toBeNull();
    expect(sections[0].items[0].text).toBe("Ponerse guantes");
    expect(sections[1].title).toBe("Baño");
  });
});

describe("parseCleaningChecklist — filas raras", () => {
  it("toma una línea sin comas como actividad que hereda el título", () => {
    const sections = parseCleaningChecklist(["Baño,Barrer,3", "Trapear"]);

    expect(sections).toHaveLength(1);
    expect(sections[0].items[1].text).toBe("Trapear");
    expect(sections[0].items[1].minutes).toBeNull();
  });

  it.each([",,", "Baño,", ",,,"])("descarta la fila %s", (line) => {
    expect(parseCleaningChecklist([line])).toEqual([]);
  });

  it("recorta los espacios de cada celda", () => {
    const [section] = parseCleaningChecklist(["  Baño , Barrer , 3 "]);

    expect(section.title).toBe("Baño");
    expect(section.items[0].text).toBe("Barrer");
    expect(section.items[0].minutes).toBe(3);
  });

  it("muestra una plantilla sin convertir tal cual, con asteriscos", () => {
    // Falla ruidosa a propósito: obliga a arreglar la plantilla en openMAINT.
    const sections = parseCleaningChecklist(["*Cama*", "Tender sábanas"]);

    expect(sections[0].items[0].text).toBe("*Cama*");
    expect(sections[0].items[1].text).toBe("Tender sábanas");
  });

  it.each([[[]], [["Titulo,Actividad,Minutos"]]])(
    "devuelve vacío para %j",
    (activities) => {
      expect(parseCleaningChecklist(activities)).toEqual([]);
    },
  );
});

describe("checkableIndex", () => {
  it("es denso y arranca en 0, cruzando secciones", () => {
    const sections = parseCleaningChecklist([
      "Titulo,Actividad,Minutos",
      "Baño,Barrer,3",
      "Baño,Trapear,2",
      "Cocina,Lavar,4",
      ",Secar,1",
    ]);
    const indices = flatten(sections).map((item) => item.checkableIndex);

    expect(indices).toEqual([0, 1, 2, 3]);
  });

  it("no deja huecos aunque haya filas descartadas en el medio", () => {
    // El invariante del que depende todo lo demás: el mapa de progreso del store
    // se inicializa como 0..count-1 y tiene que calzar clave por clave.
    const sections = parseCleaningChecklist([
      "Baño,Barrer,3",
      ",,",
      "Baño,",
      "Cocina,Lavar,4",
    ]);
    const indices = flatten(sections).map((item) => item.checkableIndex);

    expect(indices).toEqual([0, 1]);
    expect(countChecklistActivities(sections)).toBe(indices.length);
  });

  it("conserva originalIndex como la posición real en el array de entrada", () => {
    const sections = parseCleaningChecklist([
      "Titulo,Actividad,Minutos",
      "Baño,Barrer,3",
      ",,",
      "Cocina,Lavar,4",
    ]);

    expect(flatten(sections).map((item) => item.originalIndex)).toEqual([1, 3]);
  });
});

describe("agregación por sección", () => {
  // Dos secciones: "Baño" con las actividades 0 y 1, "Cocina" con la 2.
  const SECTIONS = parseCleaningChecklist([
    "Baño,Barrer,3",
    "Baño,Trapear,2",
    "Cocina,Lavar,4",
  ]);

  it("no da por completa una sección a la que le falta una actividad", () => {
    // Es el caso del comando de voz confirmando de a uno: el bloque sigue sin
    // marcarse hasta que estén todas.
    expect(isSectionComplete(SECTIONS[0], { 0: true })).toBe(false);
    expect(countCompletedSections(SECTIONS, { 0: true })).toBe(0);
  });

  it("da por completa la sección cuando están todas sus actividades", () => {
    expect(isSectionComplete(SECTIONS[0], { 0: true, 1: true })).toBe(true);
    expect(countCompletedSections(SECTIONS, { 0: true, 1: true })).toBe(1);
  });

  it("cuenta cada sección por separado", () => {
    expect(countCompletedSections(SECTIONS, { 0: true, 1: true, 2: true })).toBe(2);
    // Solo la segunda sección completa.
    expect(countCompletedSections(SECTIONS, { 2: true })).toBe(1);
  });

  it("trata un progreso vacío como nada completo", () => {
    expect(isSectionComplete(SECTIONS[0], {})).toBe(false);
    expect(countCompletedSections(SECTIONS, {})).toBe(0);
  });

  it("no se confunde con actividades en false explícito", () => {
    expect(isSectionComplete(SECTIONS[0], { 0: true, 1: false })).toBe(false);
  });

  it("devuelve los índices de la sección para marcarla entera", () => {
    expect(getSectionIndices(SECTIONS[0])).toEqual([0, 1]);
    expect(getSectionIndices(SECTIONS[1])).toEqual([2]);
  });

  it("marcar todos los índices de todas las secciones completa el checklist", () => {
    const progress = Object.fromEntries(
      SECTIONS.flatMap(getSectionIndices).map((index) => [index, true]),
    );

    expect(countCompletedSections(SECTIONS, progress)).toBe(SECTIONS.length);
  });
});

describe("getChecklistSignature", () => {
  it("es igual para la misma plantilla", () => {
    const activities = ["Baño,Barrer,3", "Cocina,Lavar,4"];

    expect(getChecklistSignature(parseCleaningChecklist(activities))).toBe(
      getChecklistSignature(parseCleaningChecklist(activities)),
    );
  });

  it("cambia si cambia el texto de una actividad", () => {
    const uno = getChecklistSignature(parseCleaningChecklist(["Baño,Barrer,3"]));
    const dos = getChecklistSignature(parseCleaningChecklist(["Baño,Trapear,3"]));

    expect(uno).not.toBe(dos);
  });

  it("cambia si se agrega una actividad", () => {
    const uno = getChecklistSignature(parseCleaningChecklist(["Baño,Barrer,3"]));
    const dos = getChecklistSignature(
      parseCleaningChecklist(["Baño,Barrer,3", "Baño,Trapear,2"]),
    );

    expect(uno).not.toBe(dos);
  });

  it("no cambia si solo cambian los minutos", () => {
    // Los minutos no alteran qué tiene que hacer el empleado, así que el progreso
    // marcado sigue siendo válido: no hay motivo para descartarlo.
    const uno = getChecklistSignature(parseCleaningChecklist(["Baño,Barrer,3"]));
    const dos = getChecklistSignature(parseCleaningChecklist(["Baño,Barrer,9"]));

    expect(uno).toBe(dos);
  });
});

describe("formatMinutes", () => {
  it.each([
    [3, "3 min"],
    [2.5, "3 min"],
    [0.4, "1 min"],
    [0, "1 min"],
  ])("formatea %s como %s", (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});
