import { createHash } from 'crypto';
import type { DeviceScope } from './access-iot.types';
import type {
  CredentialScope,
  SubjectType,
} from './entities/access-credential.entity';

/** Orden canónico de la API central: peatonal (incluye lavadoras) antes que vehicular. */
export const SCOPE_ORDER: readonly DeviceScope[] = ['pedestrian', 'vehicular'];

const PREFIX_BY_SUBJECT: Record<SubjectType, string> = {
  guest: 'G',
  tenant: 'T',
  employee: 'E',
};

export const scopesOf = (scope: CredentialScope): DeviceScope[] =>
  scope === 'both' ? [...SCOPE_ORDER] : [scope];

/** Conjunto → valor del `PUT`; `null` si está vacío. */
export const toWireScope = (
  scopes: readonly DeviceScope[],
): CredentialScope | null => {
  const set = normalizeScopes(scopes);

  if (set.length === 2) return 'both';

  return set[0] ?? null;
};

export const normalizeScopes = (
  scopes: readonly string[] | null | undefined,
): DeviceScope[] => SCOPE_ORDER.filter((scope) => scopes?.includes(scope));

export const subtractScopes = (
  from: readonly DeviceScope[],
  remove: readonly DeviceScope[],
): DeviceScope[] =>
  SCOPE_ORDER.filter(
    (scope) => from.includes(scope) && !remove.includes(scope),
  );

export const intersectScopes = (
  a: readonly DeviceScope[],
  b: readonly DeviceScope[],
): DeviceScope[] =>
  SCOPE_ORDER.filter((scope) => a.includes(scope) && b.includes(scope));

export const unionScopes = (
  a: readonly DeviceScope[],
  b: readonly DeviceScope[],
): DeviceScope[] =>
  SCOPE_ORDER.filter((scope) => a.includes(scope) || b.includes(scope));

export const sameScopes = (
  a: readonly DeviceScope[],
  b: readonly DeviceScope[],
): boolean => normalizeScopes(a).join(',') === normalizeScopes(b).join(',');

/** `DT4` + letra del sujeto + 8 hex en mayúsculas del SHA-256 del `credentialId`, como la VPS. */
export const deriveEmployeeNo = (
  credentialId: string,
  subjectType: SubjectType,
): string => {
  const digest = createHash('sha256')
    .update(credentialId)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();

  return `DT4${PREFIX_BY_SUBJECT[subjectType]}${digest}`;
};
