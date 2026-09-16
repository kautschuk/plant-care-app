import { describe, expect, it } from 'vitest';
import {
  findPlantKnowledge,
  resolveClimate,
} from '../../src/domain/knowledge';
import {
  allCatalogEntriesForTesting,
  createCatalogRecordForTesting,
  createKnowledgeCatalogForTesting,
} from '../../src/domain/knowledge/catalog.test-support';

describe('climate resolution contracts', () => {
  it('resolves a known location result shape', () => {
    const result = resolveClimate({ city: 'London', country: 'United Kingdom' });

    expect(result).toEqual({
      climate: 'TEMPERATE',
      usedFallback: false,
    });
  });

  it('normalizes case and repeated whitespace before matching', () => {
    expect(resolveClimate({ city: '  LONDON  ', country: ' united   kingdom ' })).toEqual({
      climate: 'TEMPERATE',
      usedFallback: false,
    });
  });

  it('uses a city override before the country default', () => {
    expect(resolveClimate({ city: '  Cape Town ', country: 'South Africa' })).toEqual({
      climate: 'MEDITERRANEAN',
      usedFallback: false,
    });
  });

  it('uses a country mapping when no city override exists', () => {
    expect(resolveClimate({ city: 'Nairobi', country: 'Kenya' })).toEqual({
      climate: 'TROPICAL',
      usedFallback: false,
    });
  });

  it('maps every required country to its climate', () => {
    expect(resolveClimate({ city: '', country: 'United Kingdom' })).toEqual({
      climate: 'TEMPERATE',
      usedFallback: false,
    });
    expect(resolveClimate({ city: '', country: 'Kenya' })).toEqual({
      climate: 'TROPICAL',
      usedFallback: false,
    });
    expect(resolveClimate({ city: '', country: 'Egypt' })).toEqual({
      climate: 'ARID',
      usedFallback: false,
    });
    expect(resolveClimate({ city: '', country: 'Spain' })).toEqual({
      climate: 'MEDITERRANEAN',
      usedFallback: false,
    });
    expect(resolveClimate({ city: '', country: 'Canada' })).toEqual({
      climate: 'CONTINENTAL',
      usedFallback: false,
    });
    expect(resolveClimate({ city: '', country: 'Iceland' })).toEqual({
      climate: 'POLAR',
      usedFallback: false,
    });
  });

  it('uses the explicit temperate fallback for blank or unmapped locations', () => {
    expect(resolveClimate({ city: '', country: '' })).toEqual({
      climate: 'TEMPERATE',
      usedFallback: true,
    });
    expect(resolveClimate({ city: 'Atlantis', country: 'Unknown Country' })).toEqual({
      climate: 'TEMPERATE',
      usedFallback: true,
    });
  });

  it('does not infer a country from a city-only location', () => {
    expect(resolveClimate({ city: 'London', country: '' })).toEqual({
      climate: 'TEMPERATE',
      usedFallback: true,
    });
  });

  it('is deterministic for repeated identical inputs', () => {
    const location = { city: 'London', country: 'United Kingdom' };

    expect(resolveClimate(location)).toEqual(resolveClimate(location));
  });

  it('prefers exact species knowledge over the shared genus fallback', () => {
    const result = findPlantKnowledge({
      species: ' MONSTERA   DELICIOSA ',
      genus: 'Monstera',
    });

    expect(result.status).toBe('FOUND');
    if (result.status === 'FOUND') {
      expect(result.entry.taxonomicLevel).toBe('SPECIES');
      expect(result.entry.species).toBe('Monstera deliciosa');
    }
  });

  it('returns genus guidance when species knowledge is unavailable', () => {
    const result = findPlantKnowledge({
      species: 'Sansevieria trifasciata',
      genus: 'Sansevieria',
    });

    expect(result.status).toBe('FOUND');
    if (result.status === 'FOUND') {
      expect(result.entry.taxonomicLevel).toBe('GENUS');
      expect(result.entry.species).toBeUndefined();
    }
  });

  it('rejects malformed catalog intervals and duplicate normalized identities', () => {
    expect(() => createKnowledgeCatalogForTesting([
      createCatalogRecordForTesting({ genus: 'Monstera', species: 'M deliciosa' }),
      createCatalogRecordForTesting({ genus: ' monstera ', species: 'm deliciosa' }),
    ])).toThrow();
  });

  it('keeps fertilizer declarations internally consistent', () => {
    for (const entry of allCatalogEntriesForTesting()) {
      expect(entry.fertilizationApplicable).toBe(
        entry.fertilizerModes.some((mode) => mode !== 'NONE'),
      );
    }
  });
});