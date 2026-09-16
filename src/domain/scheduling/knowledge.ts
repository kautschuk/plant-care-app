import type {
  CareType,
  Climate,
  FertilizerMode,
  ISODateString,
  IntervalDays,
  KnowledgeEntry,
  Season,
} from './types';

export interface WateringKnowledgeOptions {
  readonly baseIntervalDays: number;
  readonly seasonalModel?: 'YEAR_ROUND';
  readonly climateIntervals?: Readonly<Record<Climate, number>>;
  readonly fertilizerModes?: readonly FertilizerMode[];
}

export interface GrowingDormantKnowledgeOptions {
  readonly growingIntervalDays: number;
  readonly dormantIntervalDays: number;
  readonly fertilizerModes?: readonly FertilizerMode[];
  readonly seasonFor?: (climate: Climate, today: ISODateString) => Season;
}

function positiveInterval(days: number): IntervalDays {
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('Interval days must be a positive integer');
  }

  return days as IntervalDays;
}

function createKnowledge(
  seasonFor: (climate: Climate, today: ISODateString) => Season,
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
    seasonFor,
    intervalFor,
  };
}

export function wateringKnowledge(
  options: WateringKnowledgeOptions,
): KnowledgeEntry {
  const interval = positiveInterval(options.baseIntervalDays);
  const climateIntervals = Object.fromEntries(
    Object.entries(options.climateIntervals ?? {}).map(([climate, days]) => [
      climate,
      positiveInterval(days),
    ]),
  ) as Readonly<Record<Climate, IntervalDays>>;

  return createKnowledge(
    () => 'GROWING',
    (climate, _season, _careType) => climateIntervals[climate] ?? interval,
    'YEAR_ROUND',
    options.fertilizerModes,
  );
}

export function yearRoundKnowledge(
  options: Pick<WateringKnowledgeOptions, 'baseIntervalDays'>,
): KnowledgeEntry {
  return wateringKnowledge({
    ...options,
  });
}

export function growingDormantKnowledge(
  options: GrowingDormantKnowledgeOptions,
): KnowledgeEntry {
  const growingInterval = positiveInterval(options.growingIntervalDays);
  const dormantInterval = positiveInterval(options.dormantIntervalDays);

  return createKnowledge(
    options.seasonFor ?? calendarSeasonFor,
    (_climate, season, _careType) =>
      season === 'GROWING' ? growingInterval : dormantInterval,
    'GROWING_DORMANT',
    options.fertilizerModes,
  );
}

function calendarSeasonFor(
  _climate: Climate,
  today: ISODateString,
): Season {
  const month = Number(today.slice(5, 7));
  return month >= 3 && month <= 10 ? 'GROWING' : 'DORMANT';
}
