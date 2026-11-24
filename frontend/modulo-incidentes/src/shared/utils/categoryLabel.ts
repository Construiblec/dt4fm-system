type CategoryRef = { name: string } | null | undefined;
type SubcategoryRef = { name: string; isOther: boolean } | null | undefined;

const isOtherName = (name: string) => /^otr[oa]s?\b/i.test(name.trim());

/** Única subcategoría de la categoría (p. ej. «Otros» → «Otro»), si solo tiene una. */
export const onlySubcategory = <T>(category: { subcategories: T[] } | null) =>
  category?.subcategories.length === 1 ? category.subcategories[0] : null;

/**
 * Fila «Categoría» del detalle. La subcategoría ya es el título, así que solo
 * se añade cuando es «Otro» (y la categoría no es ya «Otros»).
 */
export const categoryLabel = (
  category: CategoryRef,
  subcategory: SubcategoryRef,
): string | null => {
  if (!category?.name) {
    return null;
  }

  return subcategory?.isOther && !isOtherName(category.name)
    ? `${category.name} · ${subcategory.name}`
    : category.name;
};

/** Título del correctivo: la subcategoría o, con «Otro», el texto escrito. */
export const correctiveTitle = (
  subcategory: SubcategoryRef,
  otherText: string,
): string =>
  subcategory?.isOther ? otherText.trim() : (subcategory?.name ?? "");
