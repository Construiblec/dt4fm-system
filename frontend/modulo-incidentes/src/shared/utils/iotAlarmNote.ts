export type IotAlarm = {
  message: string;
  rows: { label: string; value: string }[];
  warnings: string[];
};

const IOT_HEADER = /^Alarma automática del Sistema IoT:\s*(.+?)\.?$/;
const IOT_ROW = /^([^:]{1,30}):\s+(.+?)\.?$/;

/**
 * Lee la nota que escribe el backend al abrir un correctivo por alarma IoT:
 * una cabecera y líneas `Etiqueta: valor.`. Otra nota cualquiera da `null`.
 */
export const parseIotAlarm = (notes: string): IotAlarm | null => {
  const [first, ...rest] = notes.split("\n").filter((line) => line.trim());
  const header = IOT_HEADER.exec(first?.trim() ?? "");

  if (!header) return null;

  const alarm: IotAlarm = { message: header[1], rows: [], warnings: [] };

  rest.forEach((line) => {
    const row = IOT_ROW.exec(line.trim());

    if (row && row[1] !== "AVISO") {
      alarm.rows.push({ label: row[1], value: row[2] });
    } else {
      alarm.warnings.push(line.trim().replace(/^AVISO:\s*/, ""));
    }
  });

  return alarm;
};
