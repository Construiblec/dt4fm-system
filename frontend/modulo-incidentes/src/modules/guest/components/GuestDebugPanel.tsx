import type { GuestPortalData } from "../services/guestPortalService";

/**
 * Solo con `?debug=1`. Deja ver lo que no aparece en ninguna pantalla: listings
 * sin mapear a openMAINT o credenciales que no llegaron a la puerta.
 */
export const GuestDebugPanel = ({ data }: { data: GuestPortalData }) => (
  <details className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-600">
    <summary className="cursor-pointer font-semibold">Diagnóstico</summary>
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      <dt>Estancia</dt>
      <dd className="break-all">{data.stayId}</dd>
      <dt>Listing Hostaway</dt>
      <dd>{data.listingId}</dd>
      <dt>Unidad openMAINT</dt>
      <dd>{data.openmaintUnitId ?? "(listing sin mapear)"}</dd>
      <dt>Edificio</dt>
      <dd>{data.buildingId ?? "(sin resolver)"}</dd>
      <dt>Credencial</dt>
      <dd className="break-all">{data.credentialId ?? "(ninguna)"}</dd>
      <dt>Sincronización</dt>
      <dd>{data.syncState ?? "(no aplica)"}</dd>
    </dl>
    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify({ ...data, pin: data.pin ? "••••" : null }, null, 2)}
    </pre>
  </details>
);
