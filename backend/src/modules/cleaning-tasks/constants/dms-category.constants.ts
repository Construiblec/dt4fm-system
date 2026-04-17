export const DMS_CATEGORY_IDS = {
  Document: 11,
  Image: 12,
  Photo: 390625,
  Signature: 390626,
} as const;

export type DmsCategoryCode = keyof typeof DMS_CATEGORY_IDS;
