import type { KnowledgeEntry } from '../scheduling/types';
import {
  allCatalogEntries,
  createKnowledgeCatalog,
  type CatalogRecord,
} from './catalog';

export interface CatalogRecordOverrides {
  readonly genus: string;
  readonly species?: string;
  readonly wateringIntervalDays?: number;
}

const BASE_INTERVALS = {
  TROPICAL: 7,
  ARID: 7,
  MEDITERRANEAN: 7,
  TEMPERATE: 7,
  CONTINENTAL: 7,
  POLAR: 7,
} as const;

function createCatalogRecordForTesting(
  overrides: CatalogRecordOverrides,
): CatalogRecord {
  const wateringIntervalDays = overrides.wateringIntervalDays ?? 7;
  const intervals = Object.fromEntries(
    Object.entries(BASE_INTERVALS).map(([climate]) => [
      climate,
      { GROWING: wateringIntervalDays },
    ]),
  ) as CatalogRecord['wateringIntervals'];

  return {
    genus: overrides.genus,
    ...(overrides.species === undefined ? {} : { species: overrides.species }),
    taxonomicLevel: overrides.species === undefined ? 'GENUS' : 'SPECIES',
    seasonalModel: 'YEAR_ROUND',
    wateringIntervals: intervals,
    fertilizerModes: ['NONE'],
    fertilizationApplicable: false,
    seasonFor: () => 'GROWING',
  };
}

export { createCatalogRecordForTesting };

export function createKnowledgeCatalogForTesting(
  records: readonly CatalogRecord[],
): readonly KnowledgeEntry[] {
  return createKnowledgeCatalog(records);
}

export function allCatalogEntriesForTesting(): readonly KnowledgeEntry[] {
  return allCatalogEntries();
}
