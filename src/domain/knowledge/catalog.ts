import type {
  CareType,
  FertilizerMode,
  ISODateString,
  IntervalDays,
  KnowledgeEntry,
  Season,
  SeasonalModel,
  TaxonomicLevel,
} from '../scheduling/types';
import type {
  ClimateClassification,
  KnowledgeLookupResult,
  PlantKnowledgeQuery,
} from './types';

const CLIMATES: readonly ClimateClassification[] = [
  'TROPICAL',
  'ARID',
  'MEDITERRANEAN',
  'TEMPERATE',
  'CONTINENTAL',
  'POLAR',
];

type IntervalByClimate = Readonly<
  Record<ClimateClassification, Readonly<Partial<Record<Season, number>>>>
>;

export interface CatalogRecord {
  readonly genus: string;
  readonly species?: string;
  readonly taxonomicLevel: TaxonomicLevel;
  readonly seasonalModel: SeasonalModel;
  readonly wateringIntervals: IntervalByClimate;
  readonly fertilizingIntervals?: IntervalByClimate;
  readonly fertilizerModes: readonly FertilizerMode[];
  readonly fertilizationApplicable: boolean;
  readonly seasonFor: (climate: string, today: ISODateString) => Season;
}

function normalizeIdentity(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function positiveInterval(days: number, label: string): IntervalDays {
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return days as IntervalDays;
}

function seasonForCatalogRecord(
  seasonalModel: SeasonalModel,
  climate: string,
  today: ISODateString,
): Season {
  if (seasonalModel === 'YEAR_ROUND') {
    return 'GROWING';
  }

  const month = Number(today.slice(5, 7));
  if (climate === 'TROPICAL' || climate === 'ARID') {
    return 'GROWING';
  }
  if (climate === 'POLAR') {
    return month >= 5 && month <= 8 ? 'GROWING' : 'DORMANT';
  }
  return month >= 3 && month <= 10 ? 'GROWING' : 'DORMANT';
}

function validateIntervals(
  intervals: IntervalByClimate | undefined,
  label: string,
  seasonalModel: SeasonalModel,
): void {
  if (!intervals) {
    throw new Error(`${label} intervals are required`);
  }

  for (const climate of CLIMATES) {
    const climateIntervals = intervals[climate];
    if (!climateIntervals) {
      throw new Error(`${label} interval is missing for ${climate}`);
    }

    const seasons: readonly Season[] = seasonalModel === 'YEAR_ROUND'
      ? ['GROWING']
      : ['GROWING', 'DORMANT'];
    for (const season of seasons) {
      positiveInterval(
        climateIntervals[season] ?? 0,
        `${label} interval for ${climate} ${season}`,
      );
    }
  }
}

function validateCatalogRecord(record: CatalogRecord): void {
  const genus = normalizeIdentity(record.genus);
  if (!genus) {
    throw new Error('Catalog genus must be non-empty');
  }

  const species = record.species === undefined
    ? undefined
    : normalizeIdentity(record.species);
  if (record.taxonomicLevel === 'SPECIES' && !species) {
    throw new Error('Species-level catalog records require a species');
  }
  if (record.taxonomicLevel === 'GENUS' && record.species !== undefined) {
    throw new Error('Genus-level catalog records cannot define a species');
  }

  validateIntervals(record.wateringIntervals, 'Watering', record.seasonalModel);

  const nonNoneModes = record.fertilizerModes.filter((mode) => mode !== 'NONE');
  if (new Set(nonNoneModes).size !== nonNoneModes.length) {
    throw new Error('Fertilizer modes cannot contain duplicate non-NONE modes');
  }
  const fertilizationApplicable = nonNoneModes.length > 0;
  if (record.fertilizationApplicable !== fertilizationApplicable) {
    throw new Error('Fertilization applicability must agree with fertilizer modes');
  }
  if (fertilizationApplicable) {
    validateIntervals(
      record.fertilizingIntervals,
      'Fertilizing',
      record.seasonalModel,
    );
  } else if (record.fertilizingIntervals !== undefined) {
    throw new Error('Non-applicable fertilization cannot define intervals');
  }
}

function freezeIntervals(intervals: IntervalByClimate): IntervalByClimate {
  return Object.freeze(
    Object.fromEntries(
      CLIMATES.map((climate) => [
        climate,
        Object.freeze({ ...intervals[climate] }),
      ]),
    ),
  ) as IntervalByClimate;
}

function createKnowledgeEntry(record: CatalogRecord): KnowledgeEntry {
  validateCatalogRecord(record);
  const wateringIntervals = freezeIntervals(record.wateringIntervals);
  const fertilizingIntervals = record.fertilizingIntervals === undefined
    ? undefined
    : freezeIntervals(record.fertilizingIntervals);

  return Object.freeze({
    genus: record.genus.trim().replace(/\s+/g, ' '),
    ...(record.species === undefined
      ? {}
      : { species: record.species.trim().replace(/\s+/g, ' ') }),
    taxonomicLevel: record.taxonomicLevel,
    seasonalModel: record.seasonalModel,
    fertilizationApplicable: record.fertilizationApplicable,
    fertilizerModes: Object.freeze([...record.fertilizerModes]),
    seasonFor: record.seasonFor,
    intervalFor: (
      climate: string,
      season: Season,
      careType: CareType,
    ): IntervalDays => {
      const intervals = careType === 'WATERING'
        ? wateringIntervals
        : fertilizingIntervals;
      if (!intervals) {
        throw new Error(`${careType} interval is not available for this entry`);
      }

      const climateIntervals = intervals[climate as ClimateClassification];
      const interval = climateIntervals?.[
        record.seasonalModel === 'YEAR_ROUND' ? 'GROWING' : season
      ];
      if (interval === undefined) {
        throw new Error(
          `${careType} interval is not available for ${climate} ${season}`,
        );
      }
      return positiveInterval(interval, `${careType} interval`);
    },
  });
}

export function createKnowledgeCatalog(
  records: readonly CatalogRecord[],
): readonly KnowledgeEntry[] {
  const identities = new Set<string>();
  for (const record of records) {
    validateCatalogRecord(record);
    const identity = record.taxonomicLevel === 'SPECIES'
      ? `species:${normalizeIdentity(record.species ?? '')}`
      : `genus:${normalizeIdentity(record.genus)}`;
    if (identities.has(identity)) {
      throw new Error(`Duplicate normalized catalog identity: ${identity}`);
    }
    identities.add(identity);
  }

  return Object.freeze(records.map(createKnowledgeEntry));
}

function yearRoundIntervals(
  intervals: Readonly<Record<ClimateClassification, number>>,
): IntervalByClimate {
  return Object.fromEntries(
    CLIMATES.map((climate) => [climate, { GROWING: intervals[climate] }]),
  ) as IntervalByClimate;
}

function seasonalIntervals(
  growing: Readonly<Record<ClimateClassification, number>>,
  dormant: Readonly<Record<ClimateClassification, number>>,
): IntervalByClimate {
  return Object.fromEntries(
    CLIMATES.map((climate) => [
      climate,
      { GROWING: growing[climate], DORMANT: dormant[climate] },
    ]),
  ) as IntervalByClimate;
}

const CATALOG_RECORDS: readonly CatalogRecord[] = [
  {
    genus: 'Monstera',
    species: 'Monstera deliciosa',
    taxonomicLevel: 'SPECIES',
    seasonalModel: 'GROWING_DORMANT',
    wateringIntervals: seasonalIntervals(
      { TROPICAL: 5, ARID: 8, MEDITERRANEAN: 7, TEMPERATE: 10, CONTINENTAL: 12, POLAR: 14 },
      { TROPICAL: 10, ARID: 16, MEDITERRANEAN: 14, TEMPERATE: 18, CONTINENTAL: 21, POLAR: 24 },
    ),
    fertilizingIntervals: seasonalIntervals(
      { TROPICAL: 14, ARID: 21, MEDITERRANEAN: 21, TEMPERATE: 28, CONTINENTAL: 28, POLAR: 35 },
      { TROPICAL: 28, ARID: 35, MEDITERRANEAN: 42, TEMPERATE: 56, CONTINENTAL: 56, POLAR: 70 },
    ),
    fertilizerModes: ['LIQUID'],
    fertilizationApplicable: true,
    seasonFor: (climate, today) => seasonForCatalogRecord('GROWING_DORMANT', climate, today),
  },
  {
    genus: 'Monstera',
    species: 'Monstera adansonii',
    taxonomicLevel: 'SPECIES',
    seasonalModel: 'YEAR_ROUND',
    wateringIntervals: yearRoundIntervals({ TROPICAL: 7, ARID: 14, MEDITERRANEAN: 10, TEMPERATE: 14, CONTINENTAL: 18, POLAR: 21 }),
    fertilizerModes: ['NONE'],
    fertilizationApplicable: false,
    seasonFor: (climate, today) => seasonForCatalogRecord('YEAR_ROUND', climate, today),
  },
  {
    genus: 'Sansevieria',
    taxonomicLevel: 'GENUS',
    seasonalModel: 'YEAR_ROUND',
    wateringIntervals: yearRoundIntervals({ TROPICAL: 14, ARID: 28, MEDITERRANEAN: 21, TEMPERATE: 28, CONTINENTAL: 35, POLAR: 42 }),
    fertilizingIntervals: yearRoundIntervals({ TROPICAL: 60, ARID: 90, MEDITERRANEAN: 75, TEMPERATE: 90, CONTINENTAL: 100, POLAR: 120 }),
    fertilizerModes: ['LONG_TERM'],
    fertilizationApplicable: true,
    seasonFor: (climate, today) => seasonForCatalogRecord('YEAR_ROUND', climate, today),
  },
  {
    genus: 'Phalaenopsis',
    taxonomicLevel: 'GENUS',
    seasonalModel: 'GROWING_DORMANT',
    wateringIntervals: seasonalIntervals(
      { TROPICAL: 6, ARID: 9, MEDITERRANEAN: 8, TEMPERATE: 10, CONTINENTAL: 12, POLAR: 14 },
      { TROPICAL: 10, ARID: 16, MEDITERRANEAN: 14, TEMPERATE: 18, CONTINENTAL: 21, POLAR: 28 },
    ),
    fertilizingIntervals: seasonalIntervals(
      { TROPICAL: 14, ARID: 21, MEDITERRANEAN: 21, TEMPERATE: 28, CONTINENTAL: 28, POLAR: 35 },
      { TROPICAL: 42, ARID: 56, MEDITERRANEAN: 56, TEMPERATE: 70, CONTINENTAL: 84, POLAR: 90 },
    ),
    fertilizerModes: ['LIQUID'],
    fertilizationApplicable: true,
    seasonFor: (climate, today) => seasonForCatalogRecord('GROWING_DORMANT', climate, today),
  },
];

const KNOWLEDGE_CATALOG = createKnowledgeCatalog(CATALOG_RECORDS);

export function allCatalogEntries(): readonly KnowledgeEntry[] {
  return KNOWLEDGE_CATALOG;
}

export function findPlantKnowledge(
  query: PlantKnowledgeQuery,
): KnowledgeLookupResult {
  const normalizedSpecies = query.species === undefined
    ? undefined
    : normalizeIdentity(query.species);
  const normalizedGenus = normalizeIdentity(query.genus);
  const speciesEntry = normalizedSpecies
    ? KNOWLEDGE_CATALOG.find(
      (entry) => entry.taxonomicLevel === 'SPECIES'
        && normalizeIdentity(entry.species ?? '') === normalizedSpecies,
    )
    : undefined;
  const genusEntry = KNOWLEDGE_CATALOG.find(
    (entry) => entry.taxonomicLevel === 'GENUS'
      && normalizeIdentity(entry.genus) === normalizedGenus,
  );
  const entry = speciesEntry ?? genusEntry;
  if (entry) {
    return { status: 'FOUND', entry };
  }

  return {
    status: 'UNSUPPORTED',
    ...(query.species === undefined ? {} : { requestedSpecies: query.species }),
    requestedGenus: query.genus,
  };
}
