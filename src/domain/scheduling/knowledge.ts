import type {
  CareType,
  Climate,
  FertilizerMode,
  IntervalDays,
  KnowledgeEntry,
  Season,
} from './types';

export interface WateringKnowledgeOptions {
  baseIntervalDays: number;
  seasonalModel?: 'GROWING_DORMANT' | 'YEAR_ROUND';
  fertilizerModes?: readonly FertilizerMode[];
}

export interface GrowingDormantKnowledgeOptions {
  growingIntervalDays: number;
  dormantIntervalDays: number;
}

function positiveInterval(days: number): IntervalDays {
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('Interval days must be a positive integer');
  }

  return days as IntervalDays;
}

function createKnowledge(
  intervalFor: (climate: Climate, season: Season, careType: CareType) => IntervalDays,
  seasonalModel: KnowledgeEntry['seasonalModel'],
  fertilizerModes: readonly FertilizerMode[] = ['NONE'],
): KnowledgeEntry {
  return {
    genus: 'Fixtureus',
    species: 'fixtureus contractus',
    taxonomicLevel: 'SPECIES',
    seasonalModel,
    fertilizationApplicable: fertilizerModes.some((mode) => mode !== 'NONE'),
    fertilizerModes,
    intervalFor,
  };
}

export function wateringKnowledge(
  options: WateringKnowledgeOptions,
): KnowledgeEntry {
  const interval = positiveInterval(options.baseIntervalDays);
  const seasonalModel = options.seasonalModel ?? 'YEAR_ROUND';

  return createKnowledge(
    (_climate, _season, _careType) => interval,
    seasonalModel,
    options.fertilizerModes,
  );
}

export function yearRoundKnowledge(
  options: Pick<WateringKnowledgeOptions, 'baseIntervalDays'>,
): KnowledgeEntry {
  return wateringKnowledge({
    ...options,
    seasonalModel: 'YEAR_ROUND',
  });
}

export function growingDormantKnowledge(
  options: GrowingDormantKnowledgeOptions,
): KnowledgeEntry {
  const growingInterval = positiveInterval(options.growingIntervalDays);
  const dormantInterval = positiveInterval(options.dormantIntervalDays);

  return createKnowledge(
    (_climate, season, _careType) =>
      season === 'GROWING' ? growingInterval : dormantInterval,
    'GROWING_DORMANT',
  );
}