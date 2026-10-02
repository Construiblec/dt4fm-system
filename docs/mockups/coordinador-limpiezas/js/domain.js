/*
 * Coordinador de limpiezas — prototipo.
 * Funciones puras: sin DOM, sin estado. Se pueden cargar en Node para probarlas.
 *
 * Dos bloques son COPIAS de código real y deben seguir igual que el original:
 * - Checklist:  frontend/modulo-incidentes/src/modules/incidentes/utils/cleaningChecklistUtils.ts
 * - Plantilla:  backend/src/modules/cleaning-tasks/utils/csv-template.util.ts
 * Si el original cambia, este archivo queda desactualizado.
 */
(function () {
  "use strict";

  var root = typeof window !== "undefined" ? window : globalThis;
  var Coord = (root.Coord = root.Coord || {});

  // ───────────────────────────────────────────────────────────────────────────
  // Checklist (copia de cleaningChecklistUtils.ts)
  // ───────────────────────────────────────────────────────────────────────────

  var capitalizeFirstLetter = function (value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  };

  /** Minúsculas y sin tildes. Solo para comparar, nunca para mostrar. */
  var normalize = function (value) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim();
  };

  var HEADER_TITLE_CELLS = new Set([
    "titulo",
    "titulos",
    "seccion",
    "secciones",
    "title",
    "section",
  ]);
  var HEADER_ACTIVITY_CELLS = new Set([
    "actividad",
    "actividades",
    "activity",
    "activities",
    "tarea",
    "tareas",
    "elemento",
    "elementos",
  ]);

  var isHeaderRow = function (fields) {
    return (
      HEADER_TITLE_CELLS.has(normalize(fields[0] || "")) &&
      HEADER_ACTIVITY_CELLS.has(normalize(fields[1] || ""))
    );
  };

  /** Parte UNA línea CSV respetando comillas. */
  var splitCsvLine = function (line, delimiter) {
    var fields = [];
    var field = "";
    var inQuotes = false;

    for (var index = 0; index < line.length; index += 1) {
      var char = line[index];

      if (inQuotes) {
        if (char !== '"') {
          field += char;
          continue;
        }
        if (line[index + 1] === '"') {
          field += '"';
          index += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }

      if (char === '"' && field.trim() === "") {
        inQuotes = true;
        field = "";
        continue;
      }

      if (char === delimiter) {
        fields.push(field);
        field = "";
        continue;
      }

      field += char;
    }

    fields.push(field);
    return fields.map(function (value) {
      return value.trim();
    });
  };

  /** `"3"` → 3, `"2,5"` → 2.5, `"5 min"` / `""` / `"dos"` / `"-1"` → null. */
  var parseMinutes = function (raw) {
    var normalized = raw.replace(",", ".").trim();
    if (!normalized) return null;

    var value = Number(normalized);
    if (!Number.isFinite(value) || value < 0) return null;

    return value;
  };

  var detectDelimiter = function (activities) {
    var score = function (delimiter) {
      return activities.reduce(
        function (totals, line) {
          var fields = splitCsvLine(line, delimiter);
          var endsInNumber =
            fields.length >= 2 && parseMinutes(fields[fields.length - 1]) !== null;

          return {
            numeric: totals.numeric + (endsInNumber ? 1 : 0),
            exact: totals.exact + (fields.length === 3 ? 1 : 0),
            split: totals.split + (fields.length >= 2 ? 1 : 0),
          };
        },
        { numeric: 0, exact: 0, split: 0 }
      );
    };

    var comma = score(",");
    var semicolon = score(";");
    var keys = ["numeric", "exact", "split"];

    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (semicolon[key] !== comma[key]) {
        return semicolon[key] > comma[key] ? ";" : ",";
      }
    }

    return ",";
  };

  var toRow = function (fields, delimiter) {
    if (
      fields.every(function (field) {
        return field === "";
      })
    )
      return null;

    if (fields.length === 1) {
      return { title: "", text: fields[0], minutes: null };
    }

    var minutes = fields.length >= 3 ? parseMinutes(fields[fields.length - 1]) : null;
    var text = (minutes !== null ? fields.slice(1, -1) : fields.slice(1))
      .join(delimiter + " ")
      .trim();

    if (!text) return null;

    return { title: fields[0], text: text, minutes: minutes };
  };

  var parseCleaningChecklist = function (activities) {
    var sections = [];
    var delimiter = detectDelimiter(activities);
    var currentKey = null;
    var inheritedTitle = "";
    var checkableIndex = 0;

    activities.forEach(function (line, originalIndex) {
      var fields = splitCsvLine(line, delimiter);

      if (originalIndex === 0 && isHeaderRow(fields)) return;

      var row = toRow(fields, delimiter);
      if (!row) return;

      var rawTitle = row.title || inheritedTitle;
      inheritedTitle = rawTitle;

      var key = rawTitle ? normalize(rawTitle) : null;

      if (sections.length === 0 || key !== currentKey) {
        currentKey = key;
        sections.push({
          title: rawTitle ? capitalizeFirstLetter(rawTitle) : null,
          totalMinutes: null,
          hasPartialMinutes: false,
          items: [],
        });
      }

      sections[sections.length - 1].items.push({
        originalIndex: originalIndex,
        text: capitalizeFirstLetter(row.text),
        minutes: row.minutes,
        checkableIndex: checkableIndex,
      });
      checkableIndex += 1;
    });

    return sections.map(function (section) {
      var withMinutes = section.items.filter(function (item) {
        return item.minutes !== null;
      });

      return Object.assign({}, section, {
        totalMinutes:
          withMinutes.length > 0
            ? withMinutes.reduce(function (total, item) {
                return total + (item.minutes || 0);
              }, 0)
            : null,
        hasPartialMinutes:
          withMinutes.length > 0 && withMinutes.length < section.items.length,
      });
    });
  };

  var countChecklistActivities = function (sections) {
    return sections.reduce(function (total, section) {
      return total + section.items.length;
    }, 0);
  };

  var getChecklistTotalMinutes = function (sections) {
    var withMinutes = sections.filter(function (section) {
      return section.totalMinutes !== null;
    });

    if (withMinutes.length === 0) {
      return { minutes: null, isPartial: sections.length > 0 };
    }

    return {
      minutes: withMinutes.reduce(function (total, section) {
        return total + (section.totalMinutes || 0);
      }, 0),
      isPartial:
        withMinutes.length < sections.length ||
        withMinutes.some(function (section) {
          return section.hasPartialMinutes;
        }),
    };
  };

  var formatMinutes = function (minutes) {
    return Math.max(1, Math.round(minutes)) + " min";
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Plantilla CSV en bytes (copia de csv-template.util.ts)
  // Buffer de Node → Uint8Array. `code` es un agregado del prototipo para elegir
  // el mensaje de la interfaz; `reason` es el texto del backend tal cual.
  // ───────────────────────────────────────────────────────────────────────────

  var MAX_TEMPLATE_BYTES = 1024 * 1024;
  var BOM = String.fromCharCode(0xfeff);
  var REPLACEMENT = String.fromCharCode(0xfffd);

  var BINARY_SIGNATURES = [
    { bytes: [0x50, 0x4b, 0x03, 0x04], label: "xlsx/ods" },
    { bytes: [0xd0, 0xcf, 0x11, 0xe0], label: "xls" },
    { bytes: [0x25, 0x50, 0x44, 0x46], label: "pdf" },
  ];

  var startsWith = function (buffer, bytes) {
    return bytes.every(function (byte, index) {
      return buffer[index] === byte;
    });
  };

  /** Igual que `buffer.toString('latin1')` de Node: un byte, un carácter. */
  var decodeLatin1 = function (bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i += 4096) {
      out += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + 4096));
    }
    return out;
  };

  var decodeText = function (buffer) {
    if (buffer.length >= 2 && buffer.length % 2 === 0) {
      if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        return {
          text: new TextDecoder("utf-16le").decode(buffer.subarray(2)),
          encoding: "utf-16",
        };
      }
      if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        return {
          text: new TextDecoder("utf-16be").decode(buffer.subarray(2)),
          encoding: "utf-16",
        };
      }
    }

    var body = startsWith(buffer, [0xef, 0xbb, 0xbf]) ? buffer.subarray(3) : buffer;

    var utf8 = new TextDecoder("utf-8", { ignoreBOM: true }).decode(body);
    if (utf8.indexOf(REPLACEMENT) !== -1) {
      return { text: decodeLatin1(body), encoding: "windows-1252" };
    }

    return { text: utf8, encoding: "utf-8" };
  };

  var toLogicalRows = function (text) {
    var rows = [];
    var current = "";
    var insideQuotes = false;

    for (var char of text) {
      if (char === '"') {
        insideQuotes = !insideQuotes;
        current += char;
        continue;
      }

      if (char === "\n" || char === "\r") {
        if (insideQuotes) {
          current += " ";
        } else {
          if (current.trim()) rows.push(current.trim());
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (current.trim()) rows.push(current.trim());

    if (insideQuotes) {
      return text
        .split(/\r\n|\r|\n/)
        .map(function (line) {
          return line.trim();
        })
        .filter(Boolean);
    }

    return rows;
  };

  var readCsvTemplate = function (buffer) {
    if (!buffer || buffer.length === 0) {
      return { ok: false, code: "empty", reason: "la plantilla llegó vacía" };
    }

    if (buffer.length > MAX_TEMPLATE_BYTES) {
      return {
        ok: false,
        code: "too-big",
        reason:
          "la plantilla pesa " +
          buffer.length +
          " bytes, por encima del máximo de " +
          MAX_TEMPLATE_BYTES,
      };
    }

    var binary = BINARY_SIGNATURES.find(function (signature) {
      return startsWith(buffer, signature.bytes);
    });
    if (binary) {
      return {
        ok: false,
        code: "binary",
        label: binary.label,
        reason:
          "la plantilla es un archivo " +
          binary.label +
          ", no un CSV: hay que exportarla como CSV",
      };
    }

    var decoded = decodeText(buffer);
    var text = decoded.text;
    var rows = toLogicalRows(text.indexOf(BOM) === 0 ? text.slice(BOM.length) : text);

    if (rows.length === 0) {
      return {
        ok: false,
        code: "no-rows",
        reason: "la plantilla no tiene ninguna fila con contenido",
      };
    }

    return { ok: true, rows: rows, encoding: decoded.encoding };
  };

  /** Lo que hace el backend con `Detalle` cuando no hay archivo. */
  var detalleToRows = function (detalle) {
    return String(detalle || "")
      .split("\n")
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Revisión de plantillas (solo del prototipo)
  // Repite los pasos del parser para decirle a quien edita qué va a pasar con
  // cada fila. No cambia lo que muestra el parser.
  // ───────────────────────────────────────────────────────────────────────────

  var lintChecklist = function (rows) {
    var warnings = [];
    if (!rows || rows.length === 0) return { delimiter: ",", warnings: warnings };

    var delimiter = detectDelimiter(rows);
    var inherited = "";
    var currentKey = null;
    var seenTitles = new Map();
    var untitled = [];
    var withoutMinutes = 0;
    var activities = 0;
    var tabsWarned = false;

    rows.forEach(function (line, index) {
      var rowNumber = index + 1;
      var fields = splitCsvLine(line, delimiter);

      if (index === 0 && isHeaderRow(fields)) {
        warnings.push({
          level: "info",
          row: rowNumber,
          text: "Se detectó un encabezado («" + line + "»): no se muestra como actividad.",
        });
        return;
      }

      if (
        fields.every(function (field) {
          return field === "";
        })
      )
        return;

      if (!tabsWarned && fields.length === 1 && line.indexOf("\t") !== -1) {
        tabsWarned = true;
        warnings.push({
          level: "error",
          row: rowNumber,
          text:
            "El archivo parece separado por tabulaciones (lo que deja «Texto Unicode» de Excel): cada fila se ve como una sola actividad. Guárdalo como «CSV UTF-8 (delimitado por comas)».",
        });
      }

      if (fields.length === 1) {
        activities += 1;
        withoutMinutes += 1;
        if (!inherited) untitled.push(rowNumber);
        return;
      }

      var last = fields[fields.length - 1];
      var minutes = fields.length >= 3 ? parseMinutes(last) : null;

      if (fields.length >= 3) {
        if (last === "") {
          warnings.push({
            level: "warn",
            row: rowNumber,
            text:
              "Fila " +
              rowNumber +
              ": la celda de minutos está vacía y la actividad se verá con «" +
              delimiter +
              "» al final.",
          });
        } else if (minutes === null) {
          warnings.push({
            level: "warn",
            row: rowNumber,
            text:
              "Fila " +
              rowNumber +
              ": «" +
              last +
              "» no es un número de minutos; se toma como parte de la actividad.",
          });
        } else if (last.indexOf(",") !== -1) {
          warnings.push({
            level: "info",
            row: rowNumber,
            text:
              "Fila " + rowNumber + ": minutos con coma decimal (" + last + ") se leen como " + minutes + ".",
          });
        }

        if (minutes !== null && fields.length > 3) {
          warnings.push({
            level: "warn",
            row: rowNumber,
            text:
              "Fila " +
              rowNumber +
              ": tiene más de 3 columnas y se unió el texto de la actividad (¿un separador sin comillas dentro del texto?).",
          });
        }
      }

      var text = (minutes !== null ? fields.slice(1, -1) : fields.slice(1))
        .join(delimiter + " ")
        .trim();

      if (!text) {
        warnings.push({
          level: "info",
          row: rowNumber,
          text: "Fila " + rowNumber + ": tiene título («" + fields[0] + "») pero no actividad; se ignora.",
        });
        return;
      }

      activities += 1;
      if (minutes === null) withoutMinutes += 1;

      var rawTitle = fields[0] || inherited;
      inherited = rawTitle;
      if (!rawTitle) untitled.push(rowNumber);

      var key = rawTitle ? normalize(rawTitle) : null;
      if (key !== currentKey) {
        if (key && seenTitles.has(key)) {
          warnings.push({
            level: "info",
            row: rowNumber,
            text:
              "Fila " +
              rowNumber +
              ": la sección «" +
              rawTitle +
              "» vuelve a aparecer (ya estaba en la fila " +
              seenTitles.get(key) +
              "). Se muestra como una sección nueva, en ese orden.",
          });
        } else if (key) {
          seenTitles.set(key, rowNumber);
        }
        currentKey = key;
      }
    });

    if (untitled.length > 0) {
      warnings.push({
        level: "info",
        row: untitled[0],
        text:
          (untitled.length === 1 ? "La fila " + untitled[0] + " no tiene" : "Las filas " + untitled.join(", ") + " no tienen") +
          " título de sección: se muestran sin sección.",
      });
    }

    if (activities > 0 && withoutMinutes === activities) {
      warnings.push({
        level: "warn",
        text: "Ninguna actividad tiene minutos: el asistente de voz no hará recordatorios con este checklist.",
      });
    } else if (withoutMinutes > 0) {
      warnings.push({
        level: "warn",
        text:
          (withoutMinutes === 1 ? "1 actividad no tiene" : withoutMinutes + " actividades no tienen") +
          " minutos: no habrá recordatorio para " +
          (withoutMinutes === 1 ? "ella." : "ellas."),
      });
    }

    return { delimiter: delimiter, warnings: warnings };
  };

  /** Resumen para listas y selectores. */
  var summarizeChecklist = function (rows) {
    var sections = parseCleaningChecklist(rows || []);
    var total = getChecklistTotalMinutes(sections);
    return {
      sections: sections,
      sectionCount: sections.length,
      activityCount: countChecklistActivities(sections),
      minutes: total.minutes,
      isPartial: total.isPartial,
    };
  };

  var describeChecklistMinutes = function (summary) {
    if (!summary || summary.activityCount === 0) return "Sin actividades";
    if (summary.minutes === null) return "Sin minutos";
    return (summary.isPartial ? "~" : "") + formatMinutes(summary.minutes);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Bytes (para armar archivos de ejemplo)
  // ───────────────────────────────────────────────────────────────────────────

  var encodeLatin1 = function (text) {
    var out = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      out[i] = code <= 0xff ? code : 0x3f;
    }
    return out;
  };

  var encodeUtf8 = function (text, withBom) {
    var body = new TextEncoder().encode(text);
    if (!withBom) return body;
    var out = new Uint8Array(body.length + 3);
    out.set([0xef, 0xbb, 0xbf], 0);
    out.set(body, 3);
    return out;
  };

  var encodeUtf16le = function (text, withBom) {
    var offset = withBom ? 2 : 0;
    var out = new Uint8Array(offset + text.length * 2);
    if (withBom) {
      out[0] = 0xff;
      out[1] = 0xfe;
    }
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      out[offset + i * 2] = code & 0xff;
      out[offset + i * 2 + 1] = code >> 8;
    }
    return out;
  };

  var formatBytes = function (size) {
    if (size < 1024) return size + " B";
    return (size / 1024).toFixed(1).replace(".", ",") + " KB";
  };

  var ENCODING_LABELS = {
    "utf-8": "UTF-8",
    "utf-16": "UTF-16 (Texto Unicode)",
    "windows-1252": "Windows-1252 (Excel)",
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Fechas. Ecuador continental no tiene horario de verano: UTC−5 fijo.
  // ───────────────────────────────────────────────────────────────────────────

  var OFFSET_MS = 5 * 60 * 60 * 1000;
  var OFFSET = "-05:00";
  var WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  var WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var MONTHS = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  var pad2 = function (n) {
    return String(n).padStart(2, "0");
  };

  /** Fecha de hoy en Guayaquil, YYYY-MM-DD. */
  var todayYmd = function (nowMs) {
    return new Date((nowMs == null ? Date.now() : nowMs) - OFFSET_MS).toISOString().slice(0, 10);
  };

  var addDays = function (ymd, days) {
    var d = new Date(ymd + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  var diffDays = function (fromYmd, toYmd) {
    return Math.round((Date.parse(toYmd + "T12:00:00Z") - Date.parse(fromYmd + "T12:00:00Z")) / 86400000);
  };

  var isoAt = function (ymd, hhmm) {
    return ymd + "T" + hhmm + ":00" + OFFSET;
  };

  /** Fecha (Guayaquil) de un instante ISO. */
  var ymdOf = function (iso) {
    if (!iso) return null;
    return new Date(Date.parse(iso) - OFFSET_MS).toISOString().slice(0, 10);
  };

  /** Hora HH:MM (Guayaquil) de un instante ISO. */
  var hmOf = function (iso) {
    if (!iso) return null;
    return new Date(Date.parse(iso) - OFFSET_MS).toISOString().slice(11, 16);
  };

  var minutesOfDay = function (iso) {
    var hm = hmOf(iso);
    if (!hm) return null;
    return Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  };

  var addMinutesToHm = function (hhmm, minutes) {
    var total = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + Math.round(minutes);
    total = Math.max(0, Math.min(total, 23 * 60 + 59));
    return pad2(Math.floor(total / 60)) + ":" + pad2(total % 60);
  };

  var parts = function (ymd) {
    var d = new Date(ymd + "T12:00:00Z");
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() };
  };

  /** 30/09/2026 */
  var formatDate = function (ymd) {
    if (!ymd) return "—";
    var p = parts(ymd);
    return pad2(p.d) + "/" + pad2(p.m + 1) + "/" + p.y;
  };

  /** mié 30/09 */
  var formatDayShort = function (ymd) {
    if (!ymd) return "—";
    var p = parts(ymd);
    return WEEKDAYS_SHORT[p.w] + " " + pad2(p.d) + "/" + pad2(p.m + 1);
  };

  /** miércoles 30 de septiembre de 2026 */
  var formatLongDate = function (ymd) {
    var p = parts(ymd);
    return WEEKDAYS[p.w] + " " + p.d + " de " + MONTHS[p.m] + " de " + p.y;
  };

  /** "hoy", "mañana", "ayer" o "mié 30/09". */
  var relativeDay = function (ymd, today) {
    if (!ymd) return "—";
    var diff = diffDays(today, ymd);
    if (diff === 0) return "hoy";
    if (diff === 1) return "mañana";
    if (diff === -1) return "ayer";
    return formatDayShort(ymd);
  };

  var formatTime = function (iso) {
    return hmOf(iso) || "—";
  };

  var formatRange = function (startIso, endIso) {
    if (!startIso) return "Sin horario";
    return hmOf(startIso) + "–" + (endIso ? hmOf(endIso) : "?");
  };

  var formatDuration = function (minutes) {
    if (minutes == null) return "—";
    var m = Math.round(minutes);
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60);
    var rest = m % 60;
    return h + " h" + (rest ? " " + rest + " min" : "");
  };

  /** Hostaway manda 11 (número) o "11:00" (texto). Igual que el backend. */
  var normalizeCheckoutTime = function (value) {
    if (value == null || value === "") return null;
    if (typeof value === "number") return pad2(value) + ":00";
    return value.indexOf(":") !== -1 ? value : value.padStart(2, "0") + ":00";
  };

  var formatEmployeeName = function (name) {
    if (!name) return "Sin asignar";
    return name
      .split(".")
      .map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Reglas de la tarjeta de limpieza
  // ───────────────────────────────────────────────────────────────────────────

  /** Igual que isPausedTask del backend: fase Assigned y la última marca es de pausa. */
  var derivePaused = function (phase, teamObservations) {
    if (phase !== "Assigned") return false;
    var notes = String(teamObservations || "");
    var lastPause = notes.lastIndexOf("[Pausado");
    return lastPause !== -1 && lastPause > notes.lastIndexOf("[Reanudado");
  };

  /** Regla de la tarjeta del operario (CleaningTaskCard). */
  var isReopened = function (task) {
    return (
      !task.isPaused &&
      ((task.phase === "Assigned" && task.actualStartTime != null) ||
        (task.phase === "InExecution" && (task.executionTime || 0) > 0))
    );
  };

  /** Pendiente: asignada, sin empezar, sin pausa, y sin empleado o sin horario. */
  var isPending = function (task) {
    return (
      task.phase === "Assigned" &&
      !task.isPaused &&
      !task.actualStartTime &&
      (!task.employee || !task.plannedStartTime)
    );
  };

  var isOverdue = function (task, nowMs) {
    return (
      task.phase === "Assigned" &&
      !task.isPaused &&
      !isReopened(task) &&
      !task.actualStartTime &&
      Boolean(task.employee) &&
      Boolean(task.plannedStartTime) &&
      Date.parse(task.plannedStartTime) < nowMs
    );
  };

  var overdueMinutes = function (task, nowMs) {
    if (!isOverdue(task, nowMs)) return 0;
    return Math.round((nowMs - Date.parse(task.plannedStartTime)) / 60000);
  };

  /** El coordinador edita y cancela solo lo que no empezó. */
  var canEdit = function (task) {
    return task.phase === "Assigned" && !task.isPaused && !task.actualStartTime;
  };

  var STATUS = {
    pending: { label: "Por asignar", level: "pending" },
    assigned: { label: "Asignada", level: "assigned" },
    paused: { label: "En pausa", level: "paused" },
    inProgress: { label: "En ejecución", level: "inProgress" },
    review: { label: "Completada", level: "review" },
    done: { label: "Revisada", level: "done" },
    cancelled: { label: "Cancelada", level: "cancelled" },
  };

  var statusKey = function (task) {
    switch (task.phase) {
      case "Cancelled":
        return "cancelled";
      case "Reviewed":
        return "done";
      case "Completed":
        return "review";
      case "InExecution":
        return "inProgress";
      default:
        if (task.isPaused) return "paused";
        if (isPending(task)) return "pending";
        return "assigned";
    }
  };

  var hasPlan = function (task) {
    return Boolean(task.plannedStartTime && task.plannedEndTime);
  };

  var intervalsOverlap = function (aStart, aEnd, bStart, bEnd) {
    return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
  };

  /** Limpiezas del mismo empleado que se cruzan con [start, end). */
  var conflictsFor = function (employeeId, startIso, endIso, tasks, excludeIds) {
    if (!employeeId || !startIso || !endIso) return [];
    var exclude = excludeIds || [];
    return tasks.filter(function (task) {
      return (
        exclude.indexOf(task.id) === -1 &&
        task.phase !== "Cancelled" &&
        task.employee &&
        task.employee.id === employeeId &&
        hasPlan(task) &&
        intervalsOverlap(startIso, endIso, task.plannedStartTime, task.plannedEndTime)
      );
    });
  };

  /** Mapa id → limpiezas con las que se superpone. */
  var findOverlaps = function (tasks) {
    var map = new Map();
    var active = tasks.filter(function (task) {
      return task.phase !== "Cancelled" && task.employee && hasPlan(task);
    });
    active.forEach(function (a, i) {
      active.slice(i + 1).forEach(function (b) {
        if (
          a.employee.id === b.employee.id &&
          intervalsOverlap(a.plannedStartTime, a.plannedEndTime, b.plannedStartTime, b.plannedEndTime)
        ) {
          if (!map.has(a.id)) map.set(a.id, []);
          if (!map.has(b.id)) map.set(b.id, []);
          map.get(a.id).push(b);
          map.get(b.id).push(a);
        }
      });
    });
    return map;
  };

  /** Fecha de referencia de una limpieza: checkout, o el día planificado. */
  var taskDate = function (task) {
    return task.checkoutDate || ymdOf(task.plannedStartTime) || task.generatedDate;
  };

  /**
   * Bitácora del equipo (TeamObservations):
   *   [Pausado: 2026-08-19 | 10:20]: se acabó el detergente
   *   [Reanudado: 2026-08-19 | 10:34]
   *   [Reiniciado: 2026-08-19 | 10:34 | 25min]
   */
  var parseTeamLog = function (text) {
    var source = String(text || "");
    var pattern = /\[(Pausado|Reanudado|Reiniciado):\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d{1,2}:\d{2})(?:\s*\|\s*([\d.]+)\s*min)?\s*\](?::\s*)?/g;
    var entries = [];
    var lastIndex = 0;
    var previous = null;
    var match;

    var pushText = function (chunk) {
      var clean = chunk.trim();
      if (!clean) return;
      if (previous && previous.type === "pause" && !previous.text) {
        previous.text = clean;
      } else {
        entries.push({ type: "note", text: clean });
      }
    };

    while ((match = pattern.exec(source))) {
      pushText(source.slice(lastIndex, match.index));
      var kind = match[1] === "Pausado" ? "pause" : match[1] === "Reanudado" ? "resume" : "restart";
      previous = {
        type: kind,
        date: match[2],
        time: match[3].padStart(5, "0"),
        carryMinutes: match[4] ? Number(match[4]) : null,
        text: "",
      };
      entries.push(previous);
      lastIndex = pattern.lastIndex;
    }
    pushText(source.slice(lastIndex));
    return entries;
  };

  Coord.domain = {
    // checklist
    splitCsvLine: splitCsvLine,
    detectDelimiter: detectDelimiter,
    parseMinutes: parseMinutes,
    parseCleaningChecklist: parseCleaningChecklist,
    countChecklistActivities: countChecklistActivities,
    getChecklistTotalMinutes: getChecklistTotalMinutes,
    formatMinutes: formatMinutes,
    readCsvTemplate: readCsvTemplate,
    detalleToRows: detalleToRows,
    lintChecklist: lintChecklist,
    summarizeChecklist: summarizeChecklist,
    describeChecklistMinutes: describeChecklistMinutes,
    MAX_TEMPLATE_BYTES: MAX_TEMPLATE_BYTES,
    // bytes
    encodeLatin1: encodeLatin1,
    encodeUtf8: encodeUtf8,
    encodeUtf16le: encodeUtf16le,
    formatBytes: formatBytes,
    ENCODING_LABELS: ENCODING_LABELS,
    // fechas
    todayYmd: todayYmd,
    addDays: addDays,
    diffDays: diffDays,
    isoAt: isoAt,
    ymdOf: ymdOf,
    hmOf: hmOf,
    minutesOfDay: minutesOfDay,
    addMinutesToHm: addMinutesToHm,
    formatDate: formatDate,
    formatDayShort: formatDayShort,
    formatLongDate: formatLongDate,
    relativeDay: relativeDay,
    formatTime: formatTime,
    formatRange: formatRange,
    formatDuration: formatDuration,
    normalizeCheckoutTime: normalizeCheckoutTime,
    formatEmployeeName: formatEmployeeName,
    // tarjeta
    derivePaused: derivePaused,
    isReopened: isReopened,
    isPending: isPending,
    isOverdue: isOverdue,
    overdueMinutes: overdueMinutes,
    canEdit: canEdit,
    STATUS: STATUS,
    statusKey: statusKey,
    hasPlan: hasPlan,
    conflictsFor: conflictsFor,
    findOverlaps: findOverlaps,
    taskDate: taskDate,
    parseTeamLog: parseTeamLog,
  };
})();
