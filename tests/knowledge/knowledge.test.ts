import { describe, expect, it } from 'vitest';
import { resolveClimate } from '../../src/domain/knowledge';

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
});