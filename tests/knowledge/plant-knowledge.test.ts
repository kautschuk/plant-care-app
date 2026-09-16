import { expect, it } from 'vitest';

import { findPlantKnowledge } from '../../src/domain/knowledge';

it('returns an explicit unsupported result for an unknown genus', () => {
  expect(findPlantKnowledge({ genus: 'NotAPlant' })).toEqual({
    status: 'UNSUPPORTED',
    requestedGenus: 'NotAPlant',
  });
});