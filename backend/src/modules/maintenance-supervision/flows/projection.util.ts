import { labelOrNull } from '../../../common/integrations/upstream.util';
import type { RawOpenmaintAttachment } from '../../../common/utils/openmaint-attachment.util';
import {
  MAINTENANCE_API_BASE_PATH,
  type MaintenanceReadAttachment,
  type MaintenanceRef,
} from '../maintenance-integration.types';

/** Sin id no hay referencia; el nombre solo sale si es texto de verdad. */
export const toRef = (
  id: number | null | undefined,
  description: string | null | undefined,
): MaintenanceRef | null =>
  id ? { id, name: labelOrNull(description) } : null;

/** La traducción que da OpenMAINT, o la descripción cruda si no hay. */
export const translated = (
  translation: string | null | undefined,
  description: string | null | undefined,
): string | null => labelOrNull(translation ?? description);

export const isClosedFlow = (flowStatus: string | null | undefined): boolean =>
  (flowStatus ?? '').startsWith('closed');

/** Vencida: sigue abierta y ya pasó su fecha límite. */
export const isOverdueDate = (
  dueDate: string | null,
  isClosed: boolean,
): boolean => {
  if (isClosed || !dueDate) return false;
  const due = Date.parse(dueDate);
  return Number.isFinite(due) && due < Date.now();
};

export const toReadAttachment = (
  path: 'correctives' | 'preventives',
  orderId: number,
  a: RawOpenmaintAttachment,
): MaintenanceReadAttachment => ({
  id: a._id,
  fileName: a.fileName || a.name || null,
  description: a.description ?? null,
  category: labelOrNull(a._category_description ?? a.category),
  uploadDate: a.created ?? a.modified ?? null,
  downloadUrl: `${MAINTENANCE_API_BASE_PATH}/${path}/${orderId}/attachments/${encodeURIComponent(a._id)}`,
});
