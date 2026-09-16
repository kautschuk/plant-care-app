import { describe, expect, it } from 'vitest';
import {
  findPlantKnowledge,
  resolveClimate,
} from '../../src/domain/knowledge';

describe('knowledge and climate contracts', () => {
  it('resolves a known location result shape', () => {
    const result = resolveClimate({ city: 'London', country: 'United Kingdom' });

    expect(result).toEqual({
      climate: 'TEMPERATE',
      usedFallback: false,
    });
  });

  it('returns an explicit unsupported result for an unknown genus', () => {
    expect(findPlantKnowledge({ genus: 'NotAPlant' })).toEqual({
      status: 'UNSUPPORTED',
      requestedGenus: 'NotAPlant',
    });
  });
});