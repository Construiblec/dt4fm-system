export interface CompleteIncidentTemplateParams {
  incidentNumber: string;
  incidentLocation: string;
  incidentBuilding: string;
  incidentPriority: string;
  incidentCreatedAt: string;
  incidentNotes: string;
}

export function getTemplateCompleteIncident(
  params: CompleteIncidentTemplateParams,
): string {
  const {
    incidentNumber,
    incidentLocation,
    incidentBuilding,
    incidentPriority,
    incidentCreatedAt,
    incidentNotes,
  } = params;

  // ───────── SAFE PARSING ─────────
  const notes = incidentNotes || '';
  const parts = notes.split('--- Datos del visitante ---');

  const description = (parts[0] || '').trim();
  const visitorBlock = parts[1] || '';

  const nameMatch = visitorBlock.match(/Nombre:\s*(.*?)\s*Tel[eé]fono:/i);
  const phoneMatch = visitorBlock.match(/Tel[eé]fono:\s*(.*)/i);

  const visitorName = nameMatch?.[1]?.trim();
  const visitorPhone = phoneMatch?.[1]?.trim();

  // ───────── PRIORIDAD (TONOS FRIOS) ─────────
  const priorityMap: Record<string, { text: string; color: string }> = {
    high: { text: 'Alta', color: '#1d4ed8' },
    medium: { text: 'Media', color: '#2563eb' },
    low: { text: 'Baja', color: '#60a5fa' },
  };

  const normalizePriority = (v: string) => (v || '').trim().toLowerCase();

  const priority =
    priorityMap[normalizePriority(incidentPriority)] ?? priorityMap.low;

  // ───────── VISITANTE ─────────
  const visitorSection =
    visitorName || visitorPhone
      ? `
        <div style="margin-top:28px;">
          <div style="
            font-size:12px;
            letter-spacing:0.08em;
            color:#64748b;
            margin-bottom:10px;
          ">
            INFORMACIÓN DEL REPORTANTE
          </div>

          <div style="color:#0f172a;font-size:14px;line-height:1.6;">
            ${visitorName ? `<div><strong>Nombre:</strong> ${visitorName}</div>` : ''}
            ${visitorPhone ? `<div><strong>Teléfono:</strong> ${visitorPhone}</div>` : ''}
          </div>
        </div>
      `
      : '';

  // ───────── TEMPLATE ─────────
  return `
  <div style="
    font-family:Arial,sans-serif;
    max-width:520px;
    margin:auto;
    padding:20px;
    background:#ffffff;
    border-radius:10px;
    box-shadow:0 2px 10px rgba(15, 23, 42, 0.08);
  ">

    <!-- HEADER -->
    <h3 style="
      margin:0 0 14px 0;
      color:#0f172a;
      font-size:18px;
    ">
      Incidente ${incidentNumber}
    </h3>

    <!-- INFO -->
    <div style="font-size:13px;color:#334155;line-height:1.6;">

      <div style="margin-bottom:4px;">
        <span style="color:#64748b;">Edificio:</span>
        <span>${incidentBuilding}</span>
      </div>

      <div style="margin-bottom:4px;">
        <span style="color:#64748b;">Ubicación:</span>
        <span>${incidentLocation}</span>
      </div>

      <div style="margin-bottom:4px;">
        <span style="color:#64748b;">Prioridad:</span>
        <span style="color:${priority.color};font-weight:600;">
          ${priority.text}
        </span>
      </div>

      <div>
        <span style="color:#64748b;">Fecha:</span>
        <span>
          ${new Date(incidentCreatedAt).toLocaleString('es-EC')}
        </span>
      </div>

    </div>

    <!-- DIVIDER -->
    <div style="
      margin:14px 0;
      height:1px;
      background:#e2e8f0;
    "></div>

    <!-- DESCRIPTION -->
    <div style="font-size:13px;color:#0f172a;line-height:1.6;">

      <div style="
        font-weight:600;
        color:#1e293b;
        margin-bottom:6px;
      ">
        Descripción
      </div>

      <div style="
        margin-bottom: 15px;
        color:#334155;
      ">
        ${description || 'Sin descripción'}
      </div>

    </div>

    <!-- VISITOR -->
    ${visitorSection}

    <!-- FOOTER -->
    <div style="
      margin-top:18px;
      font-size:11px;
      color:#94a3b8;
      text-align:center;
    ">
      Sistema DT4FM · Notificación automática
    </div>

  </div>
`;
}
