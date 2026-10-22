import { BadRequestException, Injectable } from '@nestjs/common';
import { OpenmaintClient } from './openmaint.client';
import { OpenmaintServiceSession } from './openmaint.service-session';

type CategoryCard = {
  _id: number;
  Code?: string | null;
  Description?: string | null;
};

type SubcategoryCard = CategoryCard & { Category?: number | null };

type CardsResponse<T> = { data?: T[] };

export type MaintSubcategory = { id: number; name: string; isOther: boolean };

export type MaintCategory = {
  id: number;
  code: string;
  name: string;
  subcategories: MaintSubcategory[];
};

export type ResolvedCategory = {
  category: MaintCategory;
  subcategory: MaintSubcategory;
};

const CACHE_TTL_MS = 15 * 60 * 1000;

/** «MNT - Mantenimiento» → «Mantenimiento». */
export const cleanCategoryName = (value?: string | null): string =>
  (value ?? '').replace(/^[A-Z0-9_]{2,8}\s+-\s+/, '').trim();

export const isOtherSubcategory = (...values: (string | null | undefined)[]) =>
  values.some((value) => /^otr[oa]s?\b/i.test((value ?? '').trim()));

type CategoryFields = {
  Category?: number | null;
  _Category_description?: string | null;
  Subcategory?: number | null;
  _Subcategory_description?: string | null;
};

/** Categoría y subcategoría de una ficha de correctivo, listas para la interfaz. */
export const toCategoryRefs = (card: CategoryFields) => ({
  category: card.Category
    ? {
        id: card.Category,
        name: cleanCategoryName(card._Category_description),
      }
    : null,
  subcategory: card.Subcategory
    ? {
        id: card.Subcategory,
        name: cleanCategoryName(card._Subcategory_description),
        isOther: isOtherSubcategory(card._Subcategory_description),
      }
    : null,
});

/** Título del correctivo: la subcategoría o, si es «Otro», el texto escrito. */
export const correctiveTitle = (
  subcategory: MaintSubcategory,
  otherText?: string | null,
): string => {
  if (!subcategory.isOther) {
    return subcategory.name;
  }

  const text = (otherText ?? '').trim();

  if (!text) {
    throw new BadRequestException(
      'Escribe qué tipo de novedad es cuando la subcategoría es «Otro»',
    );
  }

  return text;
};

/**
 * Categorías y subcategorías de mantenimiento (`MaintCategory` y
 * `MaintSubcategory`). Se leen con la cuenta de servicio y se cachean: cambian
 * muy poco y los grupos de los usuarios no siempre pueden listarlas.
 */
@Injectable()
export class MaintCategoryCatalogService {
  private cache: MaintCategory[] | null = null;
  private cachedAt = 0;

  constructor(
    private readonly client: OpenmaintClient,
    private readonly serviceSession: OpenmaintServiceSession,
  ) {}

  async list(): Promise<MaintCategory[]> {
    if (this.cache && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cache;
    }

    try {
      const sessionId = await this.serviceSession.get();
      const [categories, subcategories] = await Promise.all([
        this.client.get(
          '/classes/MaintCategory/cards?limit=500',
          sessionId,
        ) as Promise<CardsResponse<CategoryCard>>,
        this.client.get(
          '/classes/MaintSubcategory/cards?limit=1000',
          sessionId,
        ) as Promise<CardsResponse<SubcategoryCard>>,
      ]);

      this.cache = this.build(
        categories?.data ?? [],
        subcategories?.data ?? [],
      );
      this.cachedAt = Date.now();

      return this.cache;
    } catch (error) {
      if (this.cache) {
        return this.cache;
      }
      throw error;
    }
  }

  /** Comprueba que la subcategoría pertenece a la categoría. */
  async resolve(
    categoryId: number,
    subcategoryId: number,
  ): Promise<ResolvedCategory> {
    const categories = await this.list();
    const category = categories.find((item) => item.id === categoryId);
    const subcategory = category?.subcategories.find(
      (item) => item.id === subcategoryId,
    );

    if (!category || !subcategory) {
      throw new BadRequestException(
        'La subcategoría no pertenece a la categoría elegida',
      );
    }

    return { category, subcategory };
  }

  private build(
    categories: CategoryCard[],
    subcategories: SubcategoryCard[],
  ): MaintCategory[] {
    return categories
      .map((card) => ({
        id: card._id,
        code: (card.Code ?? '').trim(),
        name: cleanCategoryName(card.Description ?? card.Code),
        subcategories: subcategories
          .filter((sub) => sub.Category === card._id)
          .map((sub) => ({
            id: sub._id,
            name: cleanCategoryName(sub.Description ?? sub.Code),
            isOther: isOtherSubcategory(sub.Code, sub.Description),
          }))
          // «Otro» siempre al final.
          .sort(
            (a, b) =>
              Number(a.isOther) - Number(b.isOther) ||
              a.name.localeCompare(b.name, 'es'),
          ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
}
