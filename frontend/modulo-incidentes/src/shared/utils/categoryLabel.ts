type CategoryRef = { name: string } | null | undefined;
type SubcategoryRef = { name: string; isOther: boolean } | null | undefined;

/**
 * Fila «Categoría» del detalle. La subcategoría ya es el título, así que solo
 * se añade cuando es «Otro».
 */
export const categoryLabel = (
  category: CategoryRef,
  subcategory: SubcategoryRef,
): string | null => {
  if (!category?.name) {
    return null;
  }

  return subcategory?.isOther
    ? `${category.name} · ${subcategory.name}`
    : category.name;
};

/** Título del correctivo: la subcategoría o, con «Otro», el texto escrito. */
export const correctiveTitle = (
  subcategory: SubcategoryRef,
  otherText: string,
): string =>
  subcategory?.isOther ? otherText.trim() : (subcategory?.name ?? "");
