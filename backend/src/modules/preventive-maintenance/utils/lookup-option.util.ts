import { LookupValue } from '../preventive-maintenance.openmaint.service';

/** Opción de un desplegable poblado desde un lookup de OpenMAINT. */
export type LookupOption = {
  id: string;
  label: string;
};

export function toLookupOption(value: LookupValue): LookupOption {
  return {
    id: String(value._id),
    label:
      value._description_translation ??
      value.description ??
      value.code ??
      String(value._id),
  };
}
