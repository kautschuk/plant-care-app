import { describe, expect, it } from 'vitest';
import { getPlantTaxonomyOptions, findPlantKnowledge } from '../../src/domain/knowledge';
import { allCatalogEntries } from '../../src/domain/knowledge/catalog';

describe('plant taxonomy options', () => {
  it('includes every catalog genus once and preserves common plant coverage', () => {
    const options = getPlantTaxonomyOptions();
    const genera = options.map((option) => option.genus);

    expect(new Set(genera).size).toBe(genera.length);
    expect(genera).toEqual(expect.arrayContaining([
      'Monstera',
      'Sansevieria',
      'Phalaenopsis',
      'Philodendron',
      'Ficus',
      'Hoya',
      'Epipremnum',
      'Zamioculcas',
    ]));
    expect(allCatalogEntries().length).toBeGreaterThanOrEqual(100);
  });

  it('keeps species choices specific to their genus with canonical values', () => {
    const monstera = getPlantTaxonomyOptions().find(
      (option) => option.genus === 'Monstera',
    );

    expect(monstera?.species).toEqual([
      { label: 'Deliciosa', value: 'Monstera deliciosa' },
      { label: 'Adansonii', value: 'Monstera adansonii' },
      { label: 'Dubia', value: 'Monstera dubia' },
    ]);
    expect(monstera?.species).not.toContainEqual(
      expect.objectContaining({ label: 'trifasciata' }),
    );
    expect(monstera?.genusLevelAvailable).toBe(false);
  });

  it('supports species choices alongside genus-level fallback', () => {
    const phalaenopsis = getPlantTaxonomyOptions().find(
      (option) => option.genus === 'Phalaenopsis',
    );

    expect(phalaenopsis?.genusLevelAvailable).toBe(true);
    expect(phalaenopsis?.species).toContainEqual({
      label: 'Amabilis',
      value: 'Phalaenopsis amabilis',
    });
    expect(findPlantKnowledge({ genus: 'Phalaenopsis' }).status).toBe('FOUND');
    expect(findPlantKnowledge({
      genus: 'Phalaenopsis',
      species: 'Phalaenopsis amabilis',
    }).status).toBe('FOUND');
  });
});
