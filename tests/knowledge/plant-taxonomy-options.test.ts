import { describe, expect, it } from 'vitest';
import { getPlantTaxonomyOptions } from '../../src/domain/knowledge';

describe('plant taxonomy options', () => {
  it('includes each catalog genus once in catalog order', () => {
    const options = getPlantTaxonomyOptions();

    expect(options.map((option) => option.genus)).toEqual([
      'Monstera',
      'Sansevieria',
      'Phalaenopsis',
    ]);
    expect(new Set(options.map((option) => option.genus)).size).toBe(options.length);
  });

  it('keeps species choices specific to their genus with canonical values', () => {
    const monstera = getPlantTaxonomyOptions().find(
      (option) => option.genus === 'Monstera',
    );

    expect(monstera?.species).toEqual([
      { label: 'Deliciosa', value: 'Monstera deliciosa' },
      { label: 'Adansonii', value: 'Monstera adansonii' },
    ]);
    expect(monstera?.species).not.toContainEqual(
      expect.objectContaining({ label: 'trifasciata' }),
    );
    expect(monstera?.genusLevelAvailable).toBe(false);
  });

  it('marks a genus-level catalog entry without inventing species options', () => {
    const phalaenopsis = getPlantTaxonomyOptions().find(
      (option) => option.genus === 'Phalaenopsis',
    );

    expect(phalaenopsis).toEqual({
      genus: 'Phalaenopsis',
      species: [],
      genusLevelAvailable: true,
    });
  });
});
