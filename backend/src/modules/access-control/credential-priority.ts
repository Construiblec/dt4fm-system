import {
  AccessCredential,
  CredentialScope,
} from './entities/access-credential.entity';

const SCOPE_PRIORITY: CredentialScope[] = ['both', 'pedestrian', 'vehicular'];

/** La credencial de un huésped con varias vivas: gana la de mayor alcance y luego la más antigua. */
export function pickGuestCredential(
  live: AccessCredential[],
): AccessCredential | undefined {
  for (const scope of SCOPE_PRIORITY) {
    const match = live.find((credential) => credential.scope === scope);

    if (match) return match;
  }

  return undefined;
}
