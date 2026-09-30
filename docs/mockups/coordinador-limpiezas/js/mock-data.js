/*
 * Coordinador de limpiezas — prototipo.
 * Datos de ejemplo y API simulada. Nada sale del navegador.
 *
 * Cada función de `Coord.api` corresponde a un endpoint real o propuesto (ver
 * API_CATALOG) y devuelve la misma forma de respuesta que ese endpoint. Las
 * fechas se arman relativas al día real, con la hora fija en 10:30 (Guayaquil).
 */
(function () {
  "use strict";

  var Coord = (window.Coord = window.Coord || {});
  var D = Coord.domain;

  // ───────────────────────────────────────────────────────────────────────────
  // Reloj simulado
  // ───────────────────────────────────────────────────────────────────────────

  var TODAY = D.todayYmd();
  var NOW_HM = "10:30";
  var NOW_ISO = D.isoAt(TODAY, NOW_HM);
  var YEAR = TODAY.slice(0, 4);

  var day = function (offset) {
    return D.addDays(TODAY, offset);
  };
  var at = function (offset, hm) {
    return D.isoAt(day(offset), hm);
  };

  // Cada acción de la sesión avanza un segundo, para ordenar lo que se crea.
  var tick = 0;
  var nextNowIso = function () {
    tick += 1;
    return new Date(Date.parse(NOW_ISO) + tick * 1000).toISOString();
  };

  Coord.clock = {
    today: TODAY,
    nowIso: NOW_ISO,
    nowMs: Date.parse(NOW_ISO),
    nowHm: NOW_HM,
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Catálogos (openMAINT y Hostaway)
  // ───────────────────────────────────────────────────────────────────────────

  var BUILDINGS = [
    { id: 101, code: "TA", name: "Torre A", description: "Torre A" },
    { id: 102, code: "TB", name: "Torre B", description: "Torre B" },
    { id: 103, code: "TC", name: "Torre C", description: "Torre C" },
    { id: 104, code: "PR", name: "Pradera", description: "Edificio Pradera" },
  ];

  var FLOORS = [
    { id: 1011, buildingId: 101, name: "Piso 1" },
    { id: 1013, buildingId: 101, name: "Piso 3" },
    { id: 1022, buildingId: 102, name: "Piso 2" },
    { id: 1034, buildingId: 103, name: "Piso 4" },
    { id: 1040, buildingId: 104, name: "Planta baja" },
    { id: 1041, buildingId: 104, name: "Suites" },
  ];

  /** `listingId` = atributo HostawayListingID de la Unit en openMAINT. */
  var UNITS = [
    { id: 5101, code: "UNIT-101", name: "Apto 101", buildingId: 101, floorId: 1011, listingId: "412101" },
    { id: 5102, code: "UNIT-102", name: "Apto 102", buildingId: 101, floorId: 1011, listingId: "412102" },
    { id: 5110, code: "UNIT-310", name: "Apto 310", buildingId: 101, floorId: 1013, listingId: "412310" },
    { id: 5111, code: "UNIT-311", name: "Apto 311", buildingId: 101, floorId: 1013, listingId: "412311" },
    // Registro viejo de la misma unidad: deja el listing 412311 ambiguo.
    { id: 5199, code: "UNIT-311-A", name: "Apto 311 (registro antiguo)", buildingId: 101, floorId: 1013, listingId: "412311" },
    { id: 5205, code: "UNIT-205", name: "Apto 205", buildingId: 102, floorId: 1022, listingId: "412205" },
    { id: 5206, code: "UNIT-206", name: "Apto 206", buildingId: 102, floorId: 1022, listingId: "412206" },
    { id: 5208, code: "UNIT-208", name: "Apto 208", buildingId: 102, floorId: 1022, listingId: "412208" },
    { id: 5402, code: "UNIT-402", name: "Apto 402", buildingId: 103, floorId: 1034, listingId: "412402" },
    { id: 5405, code: "UNIT-405", name: "Apto 405", buildingId: 103, floorId: 1034, listingId: "412405" },
    { id: 5410, code: "UNIT-410", name: "Apto 410", buildingId: 103, floorId: 1034, listingId: "412410" },
    { id: 5901, code: "PR-I41", name: "Suite I41", buildingId: 104, floorId: 1041, listingId: null },
    { id: 5902, code: "PR-P02", name: "Suite P02", buildingId: 104, floorId: 1041, listingId: null },
  ];

  var COMMON_AREAS = [{ id: 5950, code: "PR-LOBBY", name: "Lobby", buildingId: 104, floorId: 1040 }];

  /** Listings de Hostaway (listingMapId → nombre). 412507 no tiene unidad en openMAINT. */
  var LISTINGS = {
    "412101": "Apto 101 - Torre A",
    "412102": "Apto 102 - Torre A",
    "412310": "Apto 310 - Torre A",
    "412311": "Apto 311 - Torre A",
    "412205": "Apto 205 - Torre B",
    "412206": "Apto 206 - Torre B",
    "412208": "Apto 208 - Torre B",
    "412402": "Apto 402 - Torre C",
    "412405": "Apto 405 - Torre C",
    "412410": "Apto 410 - Torre C",
    "412507": "Apto 507 - Torre D",
  };

  /** Hostaway manda la hora como número (11) o texto ("10:00"); se mezclan a propósito. */
  var CHECKOUT_TIMES = {
    "412101": 11,
    "412102": 11,
    "412310": "12:00",
    "412311": 11,
    "412205": "10:00",
    "412206": 9,
    "412208": 11,
    "412402": "11:30",
    "412405": 11,
    "412410": "12:00",
    "412507": 11,
  };

  var TEAMS = {
    801: { id: 801, name: "Limpieza Torres A-B" },
    802: { id: 802, name: "Limpieza Torre C y Pradera" },
  };

  /** Solo personal de limpieza que usa la app: los proveedores no aparecen. */
  var EMPLOYEES = [
    { id: 7001, name: "maria.lopez", team: TEAMS[801] },
    { id: 7002, name: "jose.quinde", team: TEAMS[801] },
    { id: 7003, name: "carmen.vera", team: TEAMS[801] },
    { id: 7004, name: "luis.cedeno", team: TEAMS[802] },
    { id: 7005, name: "ana.tomala", team: TEAMS[802] },
    { id: 7006, name: "rosa.pincay", team: TEAMS[802] },
    { id: 7007, name: "diego.mora", team: null },
  ];
  var EMPLOYEE_BY_NAME = {};
  EMPLOYEES.forEach(function (e) {
    EMPLOYEE_BY_NAME[e.name] = e.id;
  });

  var unitsForListing = function (listingId) {
    return UNITS.filter(function (u) {
      return listingId && u.listingId === listingId;
    });
  };

  /** Lo que haría openMAINT con HostawayListingID: vincular si hay exactamente una unidad. */
  var resolveUnitId = function (listingId) {
    var matches = unitsForListing(listingId);
    return matches.length === 1 ? matches[0].id : null;
  };

  var unitMatch = function (listingId) {
    var n = unitsForListing(listingId).length;
    return n === 1 ? "ok" : n === 0 ? "none" : "ambiguous";
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Checklists (CleaningActivity)
  // ───────────────────────────────────────────────────────────────────────────

  var T1_CSV = [
    "Titulo;Actividad;Minutos",
    "Ingreso;Abrir ventanas y ventilar la unidad;2",
    "Ingreso;Revisar daños u objetos olvidados y reportarlos;3",
    "Dormitorio;Retirar sábanas y fundas usadas;4",
    "Dormitorio;Separar la cama del espaldar;2",
    "Dormitorio;Tender la cama con juego limpio;8",
    "Dormitorio;Limpiar veladores y lámparas;3",
    "Dormitorio;Aspirar bajo la cama y la alfombra;5",
    "Baño;Frotar las paredes para sacar sarro de mamparas, azulejos y grifería;8",
    "Baño;Lavar y desinfectar el inodoro;5",
    "Baño;Limpiar lavamanos y espejo;4",
    "Baño;Reponer papel higiénico, jabón y toallas;3",
    "Cocina;Lavar la vajilla y guardarla;6",
    "Cocina;Limpiar mesón, cocina y campana;7",
    "Cocina;Limpiar el interior del refrigerador y el microondas;6",
    "Cocina;Sacar la basura y cambiar fundas;2",
    "Sala y comedor;Sacudir muebles y superficies;5",
    "Sala y comedor;Barrer y trapear pisos;10",
    "Cierre;Verificar inventario (controles, llaves, toallas);3",
    "Cierre;Cerrar ventanas, apagar luces y aire acondicionado;2",
  ].join("\r\n");

  // Encabezado como el de la primera plantilla real ("Seccion;Actividades;tiempo"),
  // títulos heredados, coma decimal, una sección que reaparece y celdas de minutos
  // vacías (lo que Excel escribe cuando la celda queda en blanco).
  var T2_CSV = [
    "Seccion;Actividades;tiempo",
    "Dormitorio;Desmontar y lavar cortinas;15",
    ";Aspirar el colchón y voltearlo;10",
    ";Limpiar los clósets por dentro;12",
    "Baño;Descalcificar grifería y ducha;15",
    ";Limpiar juntas de azulejos con cepillo;20",
    ";Lavar la cortina o la mampara;",
    "Cocina;Desengrasar campana y filtros;20",
    ";Limpiar el horno por dentro;15",
    ";Descongelar y limpiar el refrigerador;",
    "Sala y comedor;Lavar la tapicería de los muebles;25",
    ';Limpiar rieles de ventanas;"7,5"',
    "Baño;Reponer amenities y revisar desagües;5",
    "Cierre;Tomar fotos del antes y el después;",
  ].join("\n");

  var T3_DETALLE = [
    "Titulo,Actividad",
    "Dormitorio,Estirar la cama y cambiar fundas",
    "Baño,Limpiar inodoro y lavamanos",
    "Baño,Reponer papel y toallas",
    "Cocina,Lavar la vajilla",
    "General,Barrer y trapear",
    "General,Sacar la basura",
  ].join("\n");

  var baseChecklists = function () {
    return [
      {
        id: 9001,
        code: "CHK-STD",
        description: "Limpieza de salida para departamentos de un dormitorio.",
        templateName: "Checkout estándar (1 dormitorio)",
        detalle: "",
        plantilla: { fileName: "checkout-estandar.csv", bytes: D.encodeLatin1(T1_CSV) },
      },
      {
        id: 9002,
        code: "CHK-PROF",
        description: "Limpieza a fondo: cortinas, colchón, horno y refrigerador.",
        templateName: "Limpieza profunda",
        detalle: "",
        plantilla: { fileName: "limpieza-profunda.csv", bytes: D.encodeUtf8(T2_CSV, true) },
      },
      {
        id: 9003,
        code: "CHK-REP",
        description: "Repaso entre estancias cortas.",
        templateName: "Repaso rápido (estancia corta)",
        detalle: T3_DETALLE,
        plantilla: null,
      },
    ];
  };

  /** Igual que el backend: si hay archivo y se puede leer, gana el archivo; si no, `Detalle`. */
  var resolveChecklistRows = function (checklist) {
    if (checklist.plantilla) {
      var read = D.readCsvTemplate(checklist.plantilla.bytes);
      if (read.ok) {
        return { rows: read.rows, source: "archivo", encoding: read.encoding, fileError: null };
      }
      return { rows: D.detalleToRows(checklist.detalle), source: "detalle", encoding: null, fileError: read.reason };
    }
    return { rows: D.detalleToRows(checklist.detalle), source: "detalle", encoding: null, fileError: null };
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Reservas de Hostaway (estado actual)
  // ───────────────────────────────────────────────────────────────────────────

  // [reserva, listing, día de checkout]. Faltan a propósito 58201706 (cancelada
  // en Hostaway) y 58201763 (su limpieza CT.2026.1203 quedó huérfana).
  var RESERVATIONS = [
    ["58201701", "412101", -3],
    ["58201702", "412205", -3],
    ["58201703", "412402", -2],
    ["58201704", "412310", -1],
    ["58201705", "412206", -1],
    ["58201707", "412405", -1],
    ["58201708", "412311", -1],
    ["58201741", "412206", 0],
    ["58201742", "412205", 0],
    ["58201743", "412102", 0],
    ["58201744", "412101", 0],
    ["58201745", "412402", 0],
    ["58201746", "412410", 0],
    ["58201747", "412310", 0],
    ["58201748", "412507", 0],
    ["58201749", "412208", 0], // reservada después de la sincronización de las 08:15
    ["58201751", "412206", 1],
    ["58201752", "412102", 1],
    ["58201753", "412405", 1],
    ["58201754", "412101", 1],
    ["58201761", "412402", 2],
    ["58201762", "412208", 2],
    ["58201777", "412101", 3], // falló en la sincronización de ayer
    ["58201771", "412205", 4],
    ["58201790", "412310", 5],
    ["58201791", "412311", 5],
    ["58201781", "412410", 6],
    ["58201782", "412102", 7], // su limpieza CT.2026.1214 todavía dice +6
    ["58201801", "412402", 8],
    ["58201802", "412205", 9],
    ["58201803", "412101", 10],
    ["58201804", "412507", 12],
    ["58201805", "412410", 13],
  ];

  var baseReservations = function () {
    return RESERVATIONS.map(function (r) {
      return {
        reservationId: r[0],
        listingId: r[1],
        listingName: LISTINGS[r[1]],
        checkoutDate: day(r[2]),
        checkoutTime: CHECKOUT_TIMES[r[1]],
      };
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Limpiezas (CleaningTask). El id sigue el orden de creación.
  // ───────────────────────────────────────────────────────────────────────────

  var emptyTask = function () {
    return {
      id: 0,
      taskNumber: "",
      description: "",
      phase: "Assigned",
      generatedDate: TODAY,
      createdAt: NOW_ISO,
      checkoutDate: null,
      hostawayReservation: null,
      hostawayListingId: null,
      source: "Hostaway",
      unitId: null,
      employeeId: null,
      plannedStartTime: null,
      plannedEndTime: null,
      actualStartTime: null,
      actualEndTime: null,
      executionTime: null,
      delayTime: null,
      observations: null,
      teamObservations: null,
      supervisionObserv: null,
      notes: null,
      checklistId: null,
    };
  };

  var mk = function (spec) {
    var t = emptyTask();
    t.id = spec.id;
    t.taskNumber = "CT." + YEAR + "." + spec.num;
    t.generatedDate = day(spec.gen[0]);
    t.createdAt = at(spec.gen[0], spec.gen[1]);
    t.phase = spec.phase || "Assigned";

    if (spec.res) {
      t.source = "Hostaway";
      t.hostawayReservation = spec.res;
      t.hostawayListingId = spec.listing;
      t.description = "Limpieza - " + LISTINGS[spec.listing];
      t.checkoutDate = day(spec.co);
      t.unitId = resolveUnitId(spec.listing);
    } else {
      t.source = "Manual";
      t.description = spec.description;
      t.unitId = spec.unit || null;
    }

    if (spec.emp) t.employeeId = EMPLOYEE_BY_NAME[spec.emp];
    if (spec.plan) {
      t.plannedStartTime = at(spec.plan[0], spec.plan[1]);
      t.plannedEndTime = at(spec.plan[0], spec.plan[2]);
    }
    if (spec.actual) {
      t.actualStartTime = at(spec.actual[0], spec.actual[1]);
      t.actualEndTime = spec.actual[2] ? at(spec.actual[0], spec.actual[2]) : null;
    }
    if (spec.exec != null) t.executionTime = spec.exec;
    if (spec.delay != null) t.delayTime = spec.delay;
    if (spec.team) t.teamObservations = spec.team;
    if (spec.sup) t.supervisionObserv = spec.sup;
    if (spec.notes) t.notes = spec.notes;
    if (spec.obs) t.observations = spec.obs;
    if (spec.chk) t.checklistId = spec.chk;
    return t;
  };

  var pauseMark = "[Pausado: " + day(0) + " | 10:20]: Se acabó el detergente, voy a la bodega de la Torre B.";

  var baseTasks = function () {
    return [
      // Creada a mano hace 5 días.
      mk({ id: 2310001, num: "3861", gen: [-5, "10:12"], description: "Limpieza profunda - Pradera, Suite I41", unit: 5901, phase: "Reviewed", emp: "ana.tomala", plan: [-2, "09:00", "11:30"], actual: [-2, "09:00", "11:40"], exec: 160, delay: 0, chk: 9002, obs: "Pedido del propietario antes de su visita.", sup: "Nota 1: [Aprobado] Muy bien, sin observaciones." }),
      // Sincronización de hace 4 días (página de openMAINT).
      mk({ id: 2310002, num: "7310", gen: [-4, "17:40"], res: "58201701", listing: "412101", co: -3, phase: "Reviewed", emp: "maria.lopez", plan: [-3, "11:00", "12:30"], actual: [-3, "11:05", "12:20"], exec: 75, delay: 5, chk: 9001, sup: "Nota 1: [Aprobado] Conforme." }),
      mk({ id: 2310003, num: "0457", gen: [-4, "17:40"], res: "58201702", listing: "412205", co: -3, phase: "Reviewed", emp: "jose.quinde", plan: [-3, "10:00", "11:30"], actual: [-3, "10:20", "11:45"], exec: 85, delay: 20, chk: 9001, team: "Llegué tarde por el ascensor de la Torre B.", sup: "Nota 1: [Aprobado] Conforme." }),
      mk({ id: 2310004, num: "9128", gen: [-4, "17:40"], res: "58201703", listing: "412402", co: -2, phase: "Reviewed", emp: "luis.cedeno", plan: [-2, "11:30", "13:00"], actual: [-2, "11:32", "12:58"], exec: 86, delay: 2, chk: 9001, sup: "Nota 1: [Aprobado] Conforme." }),
      mk({ id: 2310005, num: "5902", gen: [-4, "17:40"], res: "58201704", listing: "412310", co: -1, phase: "Completed", emp: "carmen.vera", plan: [-1, "12:00", "13:30"], actual: [-1, "12:10", "13:25"], exec: 75, delay: 10, chk: 9001, team: "Faltaban dos toallas de mano; avisé a recepción." }),
      mk({ id: 2310006, num: "2214", gen: [-4, "17:40"], res: "58201705", listing: "412206", co: -1, phase: "Completed", emp: "jose.quinde", plan: [-1, "10:00", "11:30"], actual: [-1, "10:05", "11:20"], exec: 75, delay: 5, chk: 9001 }),
      mk({ id: 2310007, num: "6675", gen: [-4, "17:40"], res: "58201706", listing: "412208", co: -1, phase: "Cancelled", emp: "rosa.pincay", plan: [-1, "11:00", "12:30"], chk: 9001, notes: "La reserva se canceló en Hostaway." }),
      mk({ id: 2310008, num: "8093", gen: [-4, "17:40"], res: "58201707", listing: "412405", co: -1, phase: "Assigned", emp: "rosa.pincay", plan: [-1, "14:00", "15:30"], actual: [-1, "14:05", null], exec: 65, chk: 9001, team: "Terminé baño y dormitorio.", sup: "Nota 1: [Reabierto] Faltó limpiar el interior del refrigerador. Repetir cocina." }),
      mk({ id: 2310009, num: "1048", gen: [-4, "17:40"], res: "58201708", listing: "412311", co: -1 }),
      // Creadas a mano.
      mk({ id: 2310010, num: "3375", gen: [-2, "16:05"], description: "Limpieza profunda - Pradera, Suite P02 (pedido del propietario)", unit: 5902, emp: "ana.tomala", plan: [0, "15:00", "17:30"], chk: 9002 }),
      mk({ id: 2310011, num: "5540", gen: [-1, "17:02"], description: "Limpieza profunda - Apto 310 después del cambio de grifería", unit: 5110, emp: "carmen.vera", plan: [3, "09:00", "12:00"], chk: 9002, obs: "Mantenimiento termina el día anterior; confirmar con la supervisora." }),
      // Sincronización de ayer 18:10 (coordinador), de hoy a +6.
      mk({ id: 2310012, num: "4417", gen: [-1, "18:10"], res: "58201741", listing: "412206", co: 0, phase: "InExecution", emp: "maria.lopez", plan: [0, "09:00", "10:30"], actual: [0, "09:12", null], delay: 12, chk: 9001 }),
      mk({ id: 2310013, num: "7736", gen: [-1, "18:10"], res: "58201742", listing: "412205", co: 0, emp: "jose.quinde", plan: [0, "10:00", "11:30"], actual: [0, "10:02", null], exec: 18, delay: 2, chk: 9001, team: pauseMark }),
      mk({ id: 2310014, num: "2590", gen: [-1, "18:10"], res: "58201743", listing: "412102", co: 0, emp: "carmen.vera", plan: [0, "10:00", "11:30"], chk: 9001 }),
      mk({ id: 2310015, num: "4821", gen: [-1, "18:10"], res: "58201744", listing: "412101", co: 0, emp: "maria.lopez", plan: [0, "11:00", "12:30"], chk: 9001 }),
      mk({ id: 2310016, num: "6032", gen: [-1, "18:10"], res: "58201745", listing: "412402", co: 0, emp: "luis.cedeno", plan: [0, "11:30", "13:00"], chk: 9001 }),
      mk({ id: 2310017, num: "6039", gen: [-1, "18:10"], res: "58201746", listing: "412410", co: 0, emp: "luis.cedeno", plan: [0, "12:30", "14:00"], chk: 9001 }),
      mk({ id: 2310018, num: "6047", gen: [-1, "18:10"], res: "58201747", listing: "412310", co: 0 }),
      mk({ id: 2310019, num: "6051", gen: [-1, "18:10"], res: "58201748", listing: "412507", co: 0 }),
      mk({ id: 2310020, num: "1180", gen: [-1, "18:10"], res: "58201751", listing: "412206", co: 1 }),
      mk({ id: 2310021, num: "1184", gen: [-1, "18:10"], res: "58201752", listing: "412102", co: 1 }),
      mk({ id: 2310022, num: "1187", gen: [-1, "18:10"], res: "58201753", listing: "412405", co: 1 }),
      mk({ id: 2310023, num: "1191", gen: [-1, "18:10"], res: "58201754", listing: "412101", co: 1, emp: "maria.lopez", plan: [1, "11:00", "12:30"], chk: 9001 }),
      mk({ id: 2310024, num: "1195", gen: [-1, "18:10"], res: "58201761", listing: "412402", co: 2 }),
      mk({ id: 2310025, num: "1199", gen: [-1, "18:10"], res: "58201762", listing: "412208", co: 2, emp: "carmen.vera", plan: [2, "11:00", "12:30"], chk: 9001 }),
      mk({ id: 2310026, num: "1203", gen: [-1, "18:10"], res: "58201763", listing: "412206", co: 2 }),
      mk({ id: 2310027, num: "1207", gen: [-1, "18:10"], res: "58201771", listing: "412205", co: 4 }),
      mk({ id: 2310028, num: "1210", gen: [-1, "18:10"], res: "58201781", listing: "412410", co: 6 }),
      mk({ id: 2310029, num: "1214", gen: [-1, "18:10"], res: "58201782", listing: "412102", co: 6 }),
    ];
  };

  var run = function (id, offset, hm, user, from, to, total, created, skipped, failed, errors) {
    return {
      id: id,
      startedAt: at(offset, hm),
      user: user,
      dateFrom: day(from),
      dateTo: day(to),
      total: total,
      created: created,
      skipped: skipped,
      failed: failed,
      errors: errors || [],
      status: "ok",
    };
  };

  var OPENMAINT_PAGE = null; // la página ExtJS llama sin sesión: no hay usuario

  var baseRuns = function () {
    return [
      run(6, 0, "08:15", "coordinador.demo", 0, 0, 8, 0, 8, 0),
      run(5, -1, "18:10", "coordinador.demo", 0, 6, 19, 18, 0, 1, [
        { reservationId: "58201777", listingName: LISTINGS["412101"], message: "Error al crear tarea para reserva 58201777" },
      ]),
      run(4, -2, "08:50", OPENMAINT_PAGE, -2, -2, 1, 0, 1, 0),
      run(3, -3, "09:30", OPENMAINT_PAGE, -3, -3, 2, 0, 2, 0),
      run(2, -4, "17:40", OPENMAINT_PAGE, -3, -1, 8, 8, 0, 0),
      run(1, -5, "16:20", OPENMAINT_PAGE, -5, -4, 6, 6, 0, 0),
    ];
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Escenarios
  // ───────────────────────────────────────────────────────────────────────────

  var SCENARIOS = [
    { id: "normal", label: "Día normal" },
    { id: "sync-errores", label: "Sincronización con errores" },
    { id: "sin-pendientes", label: "Sin pendientes" },
    { id: "sin-checklists", label: "Sin checklists" },
    { id: "hostaway-caido", label: "Hostaway caído" },
  ];

  var db = null;
  var scenarioId = "normal";

  var baseDb = function () {
    return {
      tasks: baseTasks(),
      checklists: baseChecklists(),
      reservations: baseReservations(),
      syncRuns: baseRuns(),
      failReservations: new Set(),
      hostawayDown: false,
      seq: { task: 2310030, checklist: 9004, run: 7, number: 0 },
    };
  };

  var newTaskNumber = function () {
    var taken = new Set(
      db.tasks.map(function (t) {
        return t.taskNumber;
      })
    );
    var candidate;
    do {
      db.seq.number += 1;
      candidate = "CT." + YEAR + "." + String((4620 + db.seq.number * 137) % 10000).padStart(4, "0");
    } while (taken.has(candidate));
    return candidate;
  };

  var createFromReservation = function (reservation, createdAt) {
    var t = emptyTask();
    t.id = db.seq.task++;
    t.taskNumber = newTaskNumber();
    t.description = "Limpieza - " + reservation.listingName;
    t.generatedDate = TODAY;
    t.createdAt = createdAt;
    t.checkoutDate = reservation.checkoutDate;
    t.hostawayReservation = reservation.reservationId;
    t.hostawayListingId = reservation.listingId;
    t.unitId = resolveUnitId(reservation.listingId);
    db.tasks.push(t);
    return t;
  };

  /** Deja el día en orden: todo asignado, sin huérfanas ni superposiciones. */
  var tidyUp = function () {
    var byNumber = function (num) {
      return db.tasks.find(function (t) {
        return t.taskNumber === "CT." + YEAR + "." + num;
      });
    };

    // La de ayer ya se hizo y se revisó.
    var yesterday = byNumber("1048");
    yesterday.phase = "Reviewed";
    yesterday.employeeId = EMPLOYEE_BY_NAME["jose.quinde"];
    yesterday.plannedStartTime = at(-1, "15:00");
    yesterday.plannedEndTime = at(-1, "16:30");
    yesterday.actualStartTime = at(-1, "15:05");
    yesterday.actualEndTime = at(-1, "16:20");
    yesterday.executionTime = 75;
    yesterday.delayTime = 5;
    yesterday.checklistId = 9001;
    yesterday.supervisionObserv = "Nota 1: [Aprobado] Conforme.";

    var orphan = byNumber("1203");
    orphan.phase = "Cancelled";
    orphan.notes = "La reserva ya no está en Hostaway.";

    byNumber("1214").checkoutDate = day(7);

    var late = byNumber("2590");
    late.phase = "InExecution";
    late.actualStartTime = at(0, "10:05");
    late.delayTime = 5;

    var clash = byNumber("6039");
    clash.plannedStartTime = at(0, "14:00");
    clash.plannedEndTime = at(0, "15:30");

    ["58201749", "58201777", "58201790", "58201791"].forEach(function (id) {
      var reservation = db.reservations.find(function (r) {
        return r.reservationId === id;
      });
      createFromReservation(reservation, at(0, "08:15"));
    });

    var teamFor = function (task) {
      var unit = UNITS.find(function (u) {
        return u.id === task.unitId;
      });
      return unit && (unit.buildingId === 101 || unit.buildingId === 102) ? 801 : 802;
    };

    db.tasks
      .filter(function (t) {
        return t.phase === "Assigned" && !t.employeeId && !t.actualStartTime;
      })
      .forEach(function (task) {
        var date = task.checkoutDate;
        var team = teamFor(task);
        var members = EMPLOYEES.filter(function (e) {
          return e.team && e.team.id === team;
        });
        // Quien menos limpiezas tenga ese día; el primer hueco libre desde las 11:00.
        var load = function (employeeId) {
          return db.tasks.filter(function (t) {
            return t.employeeId === employeeId && t.plannedStartTime && D.ymdOf(t.plannedStartTime) === date;
          });
        };
        members.sort(function (a, b) {
          return load(a.id).length - load(b.id).length;
        });
        var employee = members[0];
        var busy = load(employee.id);
        var start = "11:00";
        var fits = function (s) {
          var startIso = D.isoAt(date, s);
          var endIso = D.isoAt(date, D.addMinutesToHm(s, 90));
          return !busy.some(function (t) {
            return Date.parse(startIso) < Date.parse(t.plannedEndTime) && Date.parse(t.plannedStartTime) < Date.parse(endIso);
          });
        };
        while (!fits(start)) start = D.addMinutesToHm(start, 30);
        task.employeeId = employee.id;
        task.plannedStartTime = D.isoAt(date, start);
        task.plannedEndTime = D.isoAt(date, D.addMinutesToHm(start, 90));
        task.checklistId = 9001;
      });
  };

  var buildDb = function (id) {
    db = baseDb();
    switch (id) {
      case "sync-errores":
        db.failReservations = new Set(["58201749", "58201791"]);
        db.syncRuns[0] = run(6, 0, "08:15", "coordinador.demo", 0, 0, 9, 0, 8, 1, [
          { reservationId: "58201749", listingName: LISTINGS["412208"], message: "Error al crear tarea para reserva 58201749" },
        ]);
        break;
      case "sin-pendientes":
        tidyUp();
        break;
      case "sin-checklists":
        db.checklists = [];
        db.tasks.forEach(function (t) {
          t.checklistId = null;
        });
        db.syncRuns = [];
        break;
      case "hostaway-caido":
        db.hostawayDown = true;
        break;
      default:
        break;
    }
    scenarioId = id;
  };

  buildDb("normal");

  // ───────────────────────────────────────────────────────────────────────────
  // Vistas (forma de respuesta del backend, en camelCase)
  // ───────────────────────────────────────────────────────────────────────────

  var findUnit = function (id) {
    return UNITS.find(function (u) {
      return u.id === id;
    });
  };
  var buildingName = function (id) {
    var b = BUILDINGS.find(function (x) {
      return x.id === id;
    });
    return b ? b.name : null;
  };
  var findEmployee = function (id) {
    return EMPLOYEES.find(function (e) {
      return e.id === id;
    });
  };
  var findChecklist = function (id) {
    return db.checklists.find(function (c) {
      return c.id === id;
    });
  };

  var unitView = function (id) {
    var u = findUnit(id);
    if (!u) return null;
    return { id: u.id, code: u.code, description: u.name, name: u.name, building: buildingName(u.buildingId), buildingId: u.buildingId };
  };

  var toApiTask = function (t) {
    var employee = findEmployee(t.employeeId);
    var checklist = t.checklistId ? findChecklist(t.checklistId) : null;
    return {
      id: t.id,
      type: "CleaningTask",
      taskNumber: t.taskNumber,
      description: t.description,
      phase: t.phase,
      generatedDate: t.generatedDate,
      plannedStartTime: t.plannedStartTime,
      plannedEndTime: t.plannedEndTime,
      actualStartTime: t.actualStartTime,
      actualEndTime: t.actualEndTime,
      executionTime: t.executionTime,
      delayTime: t.delayTime,
      taskObservations: t.observations,
      supervisionObserv: t.supervisionObserv,
      teamObservations: t.teamObservations,
      isPaused: D.derivePaused(t.phase, t.teamObservations),
      sessionStartedAt: null,
      sessionBaseMinutes: 0,
      hostawayReservation: t.hostawayReservation,
      checkoutDate: t.checkoutDate,
      source: t.source,
      unit: unitView(t.unitId),
      employee: employee ? { id: employee.id, name: employee.name } : null,
      // Propuestas: hoy el backend no devuelve estos campos en el listado.
      hostawayListingId: t.hostawayListingId,
      listingName: t.hostawayListingId ? LISTINGS[t.hostawayListingId] : null,
      checklist: checklist ? { id: checklist.id, templateName: checklist.templateName } : null,
      createdAt: t.createdAt,
    };
  };

  var checklistView = function (c, withText) {
    var resolved = resolveChecklistRows(c);
    var view = {
      id: c.id,
      code: c.code,
      description: c.description,
      templateName: c.templateName,
      detalle: c.detalle,
      plantilla: c.plantilla
        ? { fileName: c.plantilla.fileName, size: c.plantilla.bytes.length, encoding: resolved.encoding }
        : null,
      source: resolved.source,
      fileError: resolved.fileError,
      activities: resolved.rows,
    };
    if (withText && c.plantilla) view.plantillaBytes = c.plantilla.bytes.slice();
    return view;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Transporte simulado
  // ───────────────────────────────────────────────────────────────────────────

  var LATENCY_MS = 400;

  function ApiError(status, message) {
    this.name = "ApiError";
    this.status = status;
    this.message = message;
  }
  ApiError.prototype = Object.create(Error.prototype);

  /** Avisos hacia la interfaz: peticiones en curso, cambios en los datos y registro de llamadas. */
  var bus = { inflight: 0, listeners: [] };
  var emit = function (event) {
    bus.listeners.forEach(function (fn) {
      fn(event);
    });
  };

  var failNext = false;
  var callLog = [];

  var clone = function (value) {
    return value === undefined ? undefined : structuredClone(value);
  };

  var delay = function (ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  };

  var call = function (name, args, fn, options) {
    var mutation = Boolean(options && options.mutation);
    var started = Date.now();
    bus.inflight += 1;
    emit({ type: "inflight", count: bus.inflight });

    return delay(LATENCY_MS)
      .then(function () {
        if (mutation && failNext) {
          failNext = false;
          emit({ type: "fail-next", value: false });
          throw new ApiError(500, "El servidor respondió con un error (simulado desde el panel del prototipo). Intenta de nuevo.");
        }
        return clone(fn.apply(null, clone(args)));
      })
      .then(
        function (result) {
          record(name, true, started);
          if (mutation) emit({ type: "change" });
          return result;
        },
        function (error) {
          record(name, false, started, error);
          throw error instanceof ApiError ? error : new ApiError(500, String(error && error.message ? error.message : error));
        }
      )
      .finally(function () {
        bus.inflight -= 1;
        emit({ type: "inflight", count: bus.inflight });
      });
  };

  var record = function (name, ok, started, error) {
    var entry = API_CATALOG[name] || {};
    callLog.unshift({
      name: name,
      method: entry.method,
      path: entry.path,
      tag: entry.tag,
      ok: ok,
      status: ok ? 200 : (error && error.status) || 500,
      ms: Date.now() - started,
    });
    callLog = callLog.slice(0, 12);
    emit({ type: "log" });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // API simulada
  // ───────────────────────────────────────────────────────────────────────────

  var findTaskOr404 = function (id) {
    var t = db.tasks.find(function (x) {
      return x.id === Number(id);
    });
    if (!t) throw new ApiError(404, "No se encontró la limpieza " + id + ".");
    return t;
  };

  var editBlockReason = function (view) {
    if (view.phase === "Cancelled") return "está cancelada";
    if (view.phase === "Reviewed") return "ya fue revisada";
    if (view.phase === "Completed") return "ya se completó";
    if (view.phase === "InExecution") return "está en ejecución";
    if (view.isPaused) return "está en pausa";
    if (view.actualStartTime) return "fue reabierta por supervisión";
    return null;
  };

  var validateRange = function (dateFrom, dateTo) {
    if (!dateFrom || !dateTo) throw new ApiError(400, "Rango incompleto: selecciona la fecha de inicio y la de fin.");
    if (dateTo < dateFrom) throw new ApiError(400, "Rango inválido: la fecha de fin es anterior a la de inicio.");
    var span = D.diffDays(dateFrom, dateTo) + 1;
    if (span > 92) throw new ApiError(400, "El rango solicitado (" + span + " días) supera el máximo de 92 días.");
  };

  var reservationsInRange = function (dateFrom, dateTo) {
    return db.reservations
      .filter(function (r) {
        return r.checkoutDate >= dateFrom && r.checkoutDate <= dateTo;
      })
      .sort(function (a, b) {
        return a.checkoutDate === b.checkoutDate ? a.listingName.localeCompare(b.listingName) : a.checkoutDate < b.checkoutDate ? -1 : 1;
      });
  };

  var taskForReservation = function (reservationId) {
    return db.tasks.find(function (t) {
      return t.hostawayReservation === reservationId;
    });
  };

  var api = {
    getAllTasks: function () {
      return call("getAllTasks", [], function () {
        var data = db.tasks
          .slice()
          .sort(function (a, b) {
            return b.id - a.id;
          })
          .map(toApiTask);
        return { success: true, data: data, meta: { total: data.length, limit: 500, offset: 0 } };
      });
    },

    getTaskDetail: function (id) {
      return call("getTaskDetail", [id], function (taskId) {
        var t = findTaskOr404(taskId);
        var view = toApiTask(t);
        var checklist = t.checklistId ? findChecklist(t.checklistId) : null;
        view.checklistDetail = checklist
          ? {
              id: checklist.id,
              code: checklist.code,
              description: checklist.description,
              templateName: checklist.templateName,
              activities: resolveChecklistRows(checklist).rows,
            }
          : null;
        view.cancelReason = t.notes; // propuesta: hoy Notes no se devuelve
        return view;
      });
    },

    updateTask: function (id, patch) {
      return call(
        "updateTask",
        [id, patch],
        function (taskId, changes) {
          var t = findTaskOr404(taskId);
          var blocked = editBlockReason(toApiTask(t));
          if (blocked) throw new ApiError(409, "Esta limpieza ya no se puede editar porque " + blocked + ".");

          var start = "plannedStartTime" in changes ? changes.plannedStartTime : t.plannedStartTime;
          var end = "plannedEndTime" in changes ? changes.plannedEndTime : t.plannedEndTime;
          if (start && end && Date.parse(end) <= Date.parse(start)) {
            throw new ApiError(400, "El fin planificado debe ser posterior al inicio.");
          }
          if ("employeeId" in changes && !changes.employeeId && t.employeeId) {
            throw new ApiError(400, "No se puede quitar el empleado de una limpieza.");
          }

          var previousEmployee = t.employeeId;
          if ("description" in changes) t.description = changes.description;
          if ("checkoutDate" in changes) t.checkoutDate = changes.checkoutDate;
          if ("unitId" in changes) t.unitId = changes.unitId;
          if ("plannedStartTime" in changes) t.plannedStartTime = changes.plannedStartTime;
          if ("plannedEndTime" in changes) t.plannedEndTime = changes.plannedEndTime;
          if ("employeeId" in changes) t.employeeId = changes.employeeId;
          if ("cleaningChecklistId" in changes) t.checklistId = changes.cleaningChecklistId;
          if ("observations" in changes) t.observations = changes.observations || null;

          var notified = changes.employeeId && changes.employeeId !== previousEmployee ? findEmployee(changes.employeeId).name : null;
          return { updated: true, taskId: t.id, notified: notified };
        },
        { mutation: true }
      );
    },

    cancelTask: function (id, body) {
      return call(
        "cancelTask",
        [id, body],
        function (taskId, payload) {
          var t = findTaskOr404(taskId);
          var blocked = editBlockReason(toApiTask(t));
          if (blocked) throw new ApiError(409, "Esta limpieza no se puede cancelar porque " + blocked + ".");
          if (!payload || !String(payload.reason || "").trim()) throw new ApiError(400, "Escribe el motivo de la cancelación.");
          t.phase = "Cancelled";
          t.notes = String(payload.reason).trim();
          return { cancelled: true, taskId: t.id };
        },
        { mutation: true }
      );
    },

    createManualTask: function (dto) {
      return call(
        "createManualTask",
        [dto],
        function (payload) {
          if (!String(payload.description || "").trim()) throw new ApiError(400, "Describe la limpieza.");
          if (!payload.plannedStartTime || !payload.plannedEndTime) throw new ApiError(400, "Completa el horario planificado.");
          if (Date.parse(payload.plannedEndTime) <= Date.parse(payload.plannedStartTime)) {
            throw new ApiError(400, "El fin planificado debe ser posterior al inicio.");
          }
          var t = emptyTask();
          t.id = db.seq.task++;
          t.taskNumber = newTaskNumber();
          t.source = "Manual";
          t.description = String(payload.description).trim();
          t.generatedDate = TODAY;
          t.createdAt = nextNowIso();
          t.unitId = payload.unitId || null;
          t.employeeId = payload.employeeId || null;
          t.plannedStartTime = payload.plannedStartTime;
          t.plannedEndTime = payload.plannedEndTime;
          t.checklistId = payload.cleaningChecklistId || null;
          t.observations = payload.observations || null;
          db.tasks.push(t);
          return { created: true, taskId: t.id, taskNumber: t.taskNumber };
        },
        { mutation: true }
      );
    },

    getCheckouts: function (query) {
      return call("getCheckouts", [query], function (q) {
        validateRange(q.dateFrom, q.dateTo);
        if (db.hostawayDown) throw new ApiError(503, "No se pudo conectar con Hostaway. Intenta más tarde.");

        var list = reservationsInRange(q.dateFrom, q.dateTo);
        var checkouts = list.map(function (r) {
          return {
            reservationId: r.reservationId,
            guestName: null, // viene de Hostaway; por decisión no se muestra
            listingName: r.listingName,
            listingId: r.listingId,
            checkoutDate: r.checkoutDate,
            checkoutTime: r.checkoutTime,
          };
        });

        // Propuesta: el estado de cada checkout frente a las limpiezas creadas.
        var rows = list.map(function (r) {
          var t = taskForReservation(r.reservationId);
          return {
            reservationId: r.reservationId,
            listingName: r.listingName,
            listingId: r.listingId,
            checkoutDate: r.checkoutDate,
            checkoutTime: D.normalizeCheckoutTime(r.checkoutTime),
            hostawayCheckoutDate: r.checkoutDate,
            status: !t ? "por-crear" : t.checkoutDate !== r.checkoutDate ? "cambio" : "creada",
            task: t ? toApiTask(t) : null,
            unitMatch: unitMatch(r.listingId),
            outOfRange: false,
          };
        });

        var listed = new Set(
          list.map(function (r) {
            return r.reservationId;
          })
        );
        db.tasks
          .filter(function (t) {
            return (
              t.source === "Hostaway" &&
              t.phase !== "Cancelled" &&
              t.checkoutDate >= q.dateFrom &&
              t.checkoutDate <= q.dateTo &&
              !listed.has(t.hostawayReservation)
            );
          })
          .forEach(function (t) {
            var r = db.reservations.find(function (x) {
              return x.reservationId === t.hostawayReservation;
            });
            rows.push({
              reservationId: t.hostawayReservation,
              listingName: LISTINGS[t.hostawayListingId],
              listingId: t.hostawayListingId,
              checkoutDate: t.checkoutDate,
              checkoutTime: r ? D.normalizeCheckoutTime(r.checkoutTime) : null,
              hostawayCheckoutDate: r ? r.checkoutDate : null,
              status: r ? "cambio" : "huerfana",
              task: toApiTask(t),
              unitMatch: unitMatch(t.hostawayListingId),
              outOfRange: Boolean(r),
            });
          });

        rows.sort(function (a, b) {
          return a.checkoutDate === b.checkoutDate ? a.listingName.localeCompare(b.listingName) : a.checkoutDate < b.checkoutDate ? -1 : 1;
        });

        return { date: q.dateFrom, dateFrom: q.dateFrom, dateTo: q.dateTo, checkouts: checkouts, count: checkouts.length, rows: rows };
      });
    },

    postSync: function (body) {
      return call(
        "postSync",
        [body],
        function (b) {
          validateRange(b.dateFrom, b.dateTo);
          var startedAt = nextNowIso();

          if (db.hostawayDown) {
            db.syncRuns.unshift({
              id: db.seq.run++,
              startedAt: startedAt,
              user: "coordinador.demo",
              dateFrom: b.dateFrom,
              dateTo: b.dateTo,
              total: 0,
              created: 0,
              skipped: 0,
              failed: 0,
              errors: [],
              status: "error",
              message: "Hostaway no respondió; no se creó ninguna limpieza.",
            });
            throw new ApiError(503, "No se pudo conectar con Hostaway. Intenta más tarde.");
          }

          var list = reservationsInRange(b.dateFrom, b.dateTo);
          var created = 0;
          var skipped = 0;
          var failed = 0;
          var errors = [];
          var createdIds = [];

          list.forEach(function (r) {
            if (taskForReservation(r.reservationId)) {
              skipped += 1;
              return;
            }
            if (db.failReservations.has(r.reservationId)) {
              failed += 1;
              errors.push({ reservationId: r.reservationId, listingName: r.listingName, message: "Error al crear tarea para reserva " + r.reservationId });
              return;
            }
            createdIds.push(createFromReservation(r, startedAt).id);
            created += 1;
          });

          var entry = {
            id: db.seq.run++,
            startedAt: startedAt,
            user: "coordinador.demo",
            dateFrom: b.dateFrom,
            dateTo: b.dateTo,
            total: list.length,
            created: created,
            skipped: skipped,
            failed: failed,
            errors: errors,
            status: "ok",
          };
          db.syncRuns.unshift(entry);

          return {
            dateFrom: b.dateFrom,
            dateTo: b.dateTo,
            total: list.length,
            created: created,
            skipped: skipped,
            failed: failed,
            // Propuestas: hoy la respuesta trae solo los contadores.
            runId: entry.id,
            errors: errors,
            createdIds: createdIds,
          };
        },
        { mutation: true }
      );
    },

    getSyncRuns: function () {
      return call("getSyncRuns", [], function () {
        return { data: db.syncRuns.slice() };
      });
    },

    listEmployees: function () {
      return call("listEmployees", [], function () {
        var data = EMPLOYEES.map(function (e) {
          return { id: e.id, name: e.name, team: e.team, isSupplier: false };
        });
        return { success: true, data: data, meta: { total: data.length } };
      });
    },

    getBuildings: function () {
      return call("getBuildings", [], function () {
        return BUILDINGS.slice();
      });
    },

    getBuildingLocations: function (buildingId) {
      return call("getBuildingLocations", [buildingId], function (id) {
        var floors = FLOORS.filter(function (f) {
          return f.buildingId === Number(id);
        }).map(function (f) {
          var areas = UNITS.filter(function (u) {
            return u.floorId === f.id;
          })
            .map(function (u) {
              return { id: u.id, code: u.code, name: u.name, description: u.name, label: u.name + " (" + u.code + ")", kind: "Unit", floorId: f.id };
            })
            .concat(
              COMMON_AREAS.filter(function (a) {
                return a.floorId === f.id;
              }).map(function (a) {
                return { id: a.id, code: a.code, name: a.name, description: a.name, label: a.name, kind: "CommonArea", floorId: f.id };
              })
            );
          return { id: f.id, code: null, name: f.name, description: null, label: f.name, areas: areas };
        });
        return { buildingId: Number(id), floors: floors, unassignedAreas: [] };
      });
    },

    listChecklists: function () {
      return call("listChecklists", [], function () {
        return {
          data: db.checklists.map(function (c) {
            return checklistView(c, false);
          }),
        };
      });
    },

    getChecklist: function (id) {
      return call("getChecklist", [id], function (checklistId) {
        var c = findChecklist(Number(checklistId));
        if (!c) throw new ApiError(404, "No se encontró el checklist " + checklistId + ".");
        return checklistView(c, true);
      });
    },

    saveChecklist: function (payload) {
      return call(
        "saveChecklist",
        [payload],
        function (p) {
          var name = String(p.templateName || "").trim();
          if (!name) throw new ApiError(400, "Escribe el nombre de la plantilla.");

          var existing = p.id ? findChecklist(Number(p.id)) : null;
          if (p.id && !existing) throw new ApiError(404, "No se encontró el checklist " + p.id + ".");

          var plantilla = p.plantilla === undefined ? (existing ? existing.plantilla : null) : p.plantilla;
          if (plantilla && plantilla.bytes && !(plantilla.bytes instanceof Uint8Array)) {
            plantilla = { fileName: plantilla.fileName, bytes: new Uint8Array(plantilla.bytes) };
          }
          if (plantilla) {
            var read = D.readCsvTemplate(plantilla.bytes);
            if (!read.ok) throw new ApiError(400, "No se pudo leer el archivo: " + read.reason + ".");
          }

          var candidate = { detalle: String(p.detalle || ""), plantilla: plantilla };
          if (resolveChecklistRows(candidate).rows.length === 0) {
            throw new ApiError(400, "Agrega actividades en el Detalle o sube el archivo de la plantilla.");
          }

          var target = existing || { id: db.seq.checklist++ };
          target.code = String(p.code || "").trim() || null;
          target.description = String(p.description || "").trim() || null;
          target.templateName = name;
          target.detalle = String(p.detalle || "");
          target.plantilla = plantilla;
          if (!existing) db.checklists.push(target);
          return { saved: true, id: target.id, created: !existing };
        },
        { mutation: true }
      );
    },
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Catálogo de endpoints (para las anotaciones)
  // existe = hay backend hoy · ajuste = existe pero requiere rol/guard/filtro ·
  // propuesta = requiere desarrollo
  // ───────────────────────────────────────────────────────────────────────────

  var API_CATALOG = {
    getAllTasks: {
      method: "GET",
      path: "/cleaning-tasks/all",
      tag: "ajuste",
      note: "Existe solo para supervisión, 50 por página y filtra por GeneratedDate (UTC). Falta el rol Coordinator, filtros por fecha planificada y de checkout, y el checklist en cada fila.",
    },
    getTaskDetail: {
      method: "GET",
      path: "/cleaning-tasks/:taskId",
      tag: "ajuste",
      note: "Existe. Para roles que no son de supervisión exige x-cleaning-employee-id; el coordinador necesita entrar sin él. No devuelve Notes (motivo de cancelación).",
    },
    updateTask: {
      method: "PUT",
      path: "/cleaning-tasks/:id",
      tag: "ajuste",
      note: "Hoy guarda empleado (como texto), horario y observaciones, y no pide sesión ni rol. Falta: unidad, checklist, descripción y fecha de checkout; employeeId numérico; exigir sesión y rol.",
    },
    cancelTask: {
      method: "PATCH",
      path: "/cleaning-tasks/:taskId/cancel",
      tag: "ajuste",
      note: "Existe con motivo obligatorio (se guarda en Notes), pero solo para roles de supervisión.",
    },
    createManualTask: {
      method: "POST",
      path: "/cleaning-tasks/manual",
      tag: "propuesta",
      note: "No existe. Crea la limpieza con Source Manual; empleado y unidad opcionales. El DTO sin trackear sirve de base.",
    },
    getCheckouts: {
      method: "GET",
      path: "/cleaning-tasks/checkouts",
      tag: "existe",
      note: "Existe (sin sesión). El estado de cada fila frente a las limpiezas creadas es propuesta.",
    },
    postSync: {
      method: "POST",
      path: "/cleaning-tasks/sync",
      tag: "existe",
      note: "Existe (sin sesión). Se llama con la fecha de Guayaquil. Falta guardar HostawayListingID en la tarjeta y registrar el historial con sus errores.",
    },
    getSyncRuns: {
      method: "GET",
      path: "/cleaning-tasks/sync/runs",
      tag: "propuesta",
      note: "No existe: hoy no se guarda ni el historial ni el detalle de errores.",
    },
    listEmployees: {
      method: "GET",
      path: "/cleaning-tasks/employees",
      tag: "propuesta",
      note: "No existe para limpieza. El mapeo ya existe en maintenance-supervision (getEmployees). Sin proveedores.",
    },
    getBuildings: { method: "GET", path: "/buildings", tag: "existe", note: "Existe (header Authorization)." },
    getBuildingLocations: {
      method: "GET",
      path: "/buildings/:id/locations",
      tag: "existe",
      note: "Existe. Las unidades vienen como áreas con kind = Unit.",
    },
    listChecklists: {
      method: "GET",
      path: "/cleaning-tasks/checklists",
      tag: "propuesta",
      note: "No existe: el backend solo lee un CleaningActivity por id, desde la limpieza.",
    },
    getChecklist: {
      method: "GET",
      path: "/cleaning-tasks/checklists/:id",
      tag: "propuesta",
      note: "No existe como endpoint propio. La lectura del archivo Plantilla (readCsvTemplate) sí existe.",
    },
    saveChecklist: {
      method: "POST/PUT",
      path: "/cleaning-tasks/checklists",
      tag: "propuesta",
      note: "No existe. Multipart con NombrePlantilla, Code, Description, Detalle y el archivo Plantilla.",
    },
  };

  var ASSUMPTIONS = [
    "Pendiente = asignada, sin empezar, sin pausa, y sin empleado o sin horario. La unidad no cuenta.",
    "Obligatorios en una limpieza manual: descripción, fecha, inicio y fin. Unidad, empleado y checklist son opcionales.",
    "Una limpieza reabierta queda en manos de supervisión: el coordinador no la edita.",
    "El coordinador cancela solo limpiezas que no empezaron (incluidas las pendientes).",
    "Asignar avisa al empleado (eso ya existe). Reprogramar no avisa, como hoy.",
    "Las listas muestran primero lo recién creado (id descendente).",
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // Archivos de ejemplo para el editor de checklists
  // (una página publicada no puede descargar archivos: se cargan directo)
  // ───────────────────────────────────────────────────────────────────────────

  var EXAMPLE_CSV = [
    "Titulo;Actividad;Minutos",
    "Ingreso;Abrir ventanas y ventilar la unidad;2",
    "Dormitorio;Tender la cama con juego limpio;8",
    "Baño;Lavar y desinfectar el inodoro;5",
    "Baño;Reponer papel higiénico, jabón y toallas;3",
    "Cocina;Limpiar mesón, cocina y campana;7",
    "Cierre;Cerrar ventanas y apagar luces;2",
  ].join("\r\n");

  var TEST_FILES = [
    {
      id: "excel",
      label: "CSV de Excel (Windows-1252)",
      fileName: "repaso-salida.csv",
      build: function () {
        return D.encodeLatin1(
          [
            "Titulo;Actividad;Minutos",
            "Dormitorio;Cambiar sábanas y fundas;6",
            "Dormitorio;Ordenar el clóset y revisar perchas;3",
            "Baño;Limpiar ducha y mampara;8",
            "Baño;Reponer toallas y amenities;3",
            "Cocina;Lavar la vajilla y secar el mesón;6",
            "Sala;Aspirar el sofá y los cojines;4",
            "Sala;Trapear el piso;6",
          ].join("\r\n")
        );
      },
    },
    {
      id: "problemas",
      label: "CSV con problemas",
      fileName: "plantilla-con-problemas.csv",
      build: function () {
        return D.encodeUtf8(
          [
            "Titulo,Actividad,Minutos",
            ",Ventilar la unidad,2",
            "Dormitorio,Tender la cama con juego limpio,8",
            ",Limpiar veladores, lámparas y espejo,4",
            "Baño,Lavar el inodoro,cinco",
            "Baño,Limpiar el espejo,",
            "Terraza,",
            'Cocina,Limpiar el refrigerador,"7,5"',
            "Dormitorio,Aspirar la alfombra,5",
          ].join("\n"),
          false
        );
      },
    },
    {
      id: "unicode",
      label: "Texto Unicode (UTF-16)",
      fileName: "plantilla-unicode.txt",
      build: function () {
        return D.encodeUtf16le(
          ["Titulo\tActividad\tMinutos", "Baño\tLimpiar ducha\t8", "Cocina\tLavar la vajilla\t6"].join("\r\n"),
          true
        );
      },
    },
    {
      id: "xlsx",
      label: "Archivo .xlsx",
      fileName: "plantilla.xlsx",
      build: function () {
        var bytes = new Uint8Array(2048);
        bytes.set([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00], 0);
        return bytes;
      },
    },
  ];

  Coord.data = {
    TODAY: TODAY,
    SCENARIOS: SCENARIOS,
    API_CATALOG: API_CATALOG,
    ASSUMPTIONS: ASSUMPTIONS,
    EXAMPLE_CSV: EXAMPLE_CSV,
    TEST_FILES: TEST_FILES,
    LISTINGS: LISTINGS,
    bus: bus,
    getScenario: function () {
      return scenarioId;
    },
    setScenario: function (id) {
      buildDb(id);
      tick = 0;
      callLog = [];
      emit({ type: "change" });
      emit({ type: "log" });
    },
    reset: function () {
      buildDb(scenarioId);
      tick = 0;
      emit({ type: "change" });
    },
    getFailNext: function () {
      return failNext;
    },
    setFailNext: function (value) {
      failNext = Boolean(value);
      emit({ type: "fail-next", value: failNext });
    },
    getCallLog: function () {
      return callLog.slice();
    },
    subscribe: function (fn) {
      bus.listeners.push(fn);
      return function () {
        bus.listeners = bus.listeners.filter(function (x) {
          return x !== fn;
        });
      };
    },
    /** Solo para pruebas automáticas: el estado interno, sin latencia. */
    _debug: function () {
      return db;
    },
  };

  Coord.api = api;
  Coord.ApiError = ApiError;
})();
