import {
  FINDING_RESOLVED_DESCRIPTION,
  isFindingResolved,
  normalizeResolvedAttribute,
  resolvedFields,
} from './finding-resolution.util';

describe('finding-resolution', () => {
  describe('sin atributo (marca provisional en Description)', () => {
    it('marcar escribe el texto y desmarcar lo borra', () => {
      expect(resolvedFields(true, null)).toEqual({
        Description: FINDING_RESOLVED_DESCRIPTION,
      });
      expect(resolvedFields(false, null)).toEqual({ Description: null });
    });

    it('lee la marca por Description', () => {
      expect(
        isFindingResolved({ Description: FINDING_RESOLVED_DESCRIPTION }, null),
      ).toBe(true);
      expect(isFindingResolved({ Description: null }, null)).toBe(false);
      expect(isFindingResolved({ Description: 'otra cosa' }, null)).toBe(false);
    });
  });

  describe('con el atributo booleano', () => {
    const attribute = 'ResolvedBySupervisor';

    it('escribe el booleano y limpia la marca provisional', () => {
      expect(resolvedFields(true, attribute)).toEqual({
        ResolvedBySupervisor: true,
        Description: null,
      });
      expect(resolvedFields(false, attribute)).toEqual({
        ResolvedBySupervisor: false,
        Description: null,
      });
    });

    it('lee el atributo y también la marca vieja en Description', () => {
      expect(isFindingResolved({ ResolvedBySupervisor: true }, attribute)).toBe(
        true,
      );
      expect(
        isFindingResolved(
          {
            ResolvedBySupervisor: false,
            Description: FINDING_RESOLVED_DESCRIPTION,
          },
          attribute,
        ),
      ).toBe(true);
      expect(
        isFindingResolved({ ResolvedBySupervisor: false }, attribute),
      ).toBe(false);
    });
  });

  it('una variable vacía equivale a no tener atributo', () => {
    expect(normalizeResolvedAttribute('  ')).toBeNull();
    expect(normalizeResolvedAttribute(undefined)).toBeNull();
    expect(normalizeResolvedAttribute(' Resuelto ')).toBe('Resuelto');
  });
});
