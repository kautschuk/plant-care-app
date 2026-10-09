import { describe, expect, it } from 'vitest';
import {
  findPlantKnowledge,
  resolveClimate,
} from '../../src/domain/knowledge';
import {
  initializeSchedule,
  projectSchedule,
  validateISODate,
} from '../../src/domain/scheduling';
import {
  allCatalogEntriesForTesting,
  createCatalogRecordForTesting,
  createKnowledgeCatalogForTesting,
} from '../../src/domain/knowledge/catalog.test-support';

const SUPPORTED_CLIMATES = [
  'TROPICAL',
  'ARID',
  'MEDITERRANEAN',
  'TEMPERATE',
  'CONTINENTAL',
  'POLAR',
] as const;

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

  it('rejects a known species when it is paired with a different genus', () => {
    expect(findPlantKnowledge({
      genus: 'Sansevieria',
      species: 'Monstera deliciosa',
    })).toEqual({
      status: 'UNSUPPORTED',
      requestedSpecies: 'Monstera deliciosa',
      requestedGenus: 'Sansevieria',
    });
  });

  it('returns a catalog entry usable by schedule initialization', () => {
    const result = findPlantKnowledge({
      species: 'Monstera deliciosa',
      genus: 'Monstera',
    });

    expect(result.status).toBe('FOUND');
    if (result.status !== 'FOUND') {
      throw new Error('Expected catalog knowledge');
    }

    const schedule = initializeSchedule({
      today: validateISODate('2026-09-16'),
      lastCompletedDate: validateISODate('2026-09-10'),
      knowledge: result.entry,
      climate: resolveClimate({ city: 'London', country: 'United Kingdom' }).climate,
    });

    expect(schedule.projection.baseIntervalDays).toBeGreaterThan(0);
    expect(schedule.projection.effectiveIntervalDays).toBeGreaterThanOrEqual(1);
  });

  it('keeps seasonal projection deterministic for identical snapshots', () => {
    const result = findPlantKnowledge({ genus: 'Phalaenopsis' });

    expect(result.status).toBe('FOUND');
    if (result.status !== 'FOUND') {
      throw new Error('Expected catalog knowledge');
    }

    const input = {
      today: validateISODate('2026-09-16'),
      state: {
        careSchedules: {
          WATERING: {
            lastCompletedDate: validateISODate('2026-09-10'),
            nextDueDate: validateISODate('2026-09-17'),
            learnedAdjustments: {
              model: 'GROWING_DORMANT' as const,
              growingDays: 0,
              dormantDays: 0,
            },
          },
        },
      },
      knowledge: result.entry,
      climate: 'TEMPERATE' as const,
    };

    expect(projectSchedule(input)).toEqual(projectSchedule(input));
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

  it('preserves unsupported lookup values without synthesizing knowledge', () => {
    expect(findPlantKnowledge({
      species: 'Unknown species',
      genus: 'Unknown genus',
    })).toEqual({
      status: 'UNSUPPORTED',
      requestedSpecies: 'Unknown species',
      requestedGenus: 'Unknown genus',
    });
  });

  it('uses deterministic growing and dormant boundaries for temperate climates', () => {
    const entries = allCatalogEntriesForTesting().filter(
      (candidate) => candidate.seasonalModel === 'GROWING_DORMANT',
    );
    expect(entries).not.toHaveLength(0);

    for (const entry of entries) {
      expect(entry.seasonFor('TEMPERATE', '2026-02-28' as never)).toBe('DORMANT');
      expect(entry.seasonFor('TEMPERATE', '2026-03-01' as never)).toBe('GROWING');
      expect(entry.seasonFor('TEMPERATE', '2026-10-31' as never)).toBe('GROWING');
      expect(entry.seasonFor('TEMPERATE', '2026-11-01' as never)).toBe('DORMANT');
      expect(entry.seasonFor('POLAR', '2026-04-30' as never)).toBe('DORMANT');
      expect(entry.seasonFor('POLAR', '2026-05-01' as never)).toBe('GROWING');
      expect(entry.seasonFor('POLAR', '2026-08-08' as never)).toBe('GROWING');
      expect(entry.seasonFor('POLAR', '2026-09-01' as never)).toBe('DORMANT');
      expect(entry.seasonFor('TROPICAL', '2026-01-01' as never)).toBe('GROWING');
      expect(entry.seasonFor('ARID', '2026-12-31' as never)).toBe('GROWING');
    }
  });

  it('uses deterministic growing and dormant boundaries for Mediterranean and Continental climates', () => {
    const entries = allCatalogEntriesForTesting().filter(
      (candidate) => candidate.seasonalModel === 'GROWING_DORMANT',
    );
    expect(entries).not.toHaveLength(0);

    for (const entry of entries) {
      for (const climate of ['MEDITERRANEAN', 'CONTINENTAL'] as const) {
        expect(entry.seasonFor(climate, '2026-02-28' as never)).toBe('DORMANT');
        expect(entry.seasonFor(climate, '2026-03-01' as never)).toBe('GROWING');
        expect(entry.seasonFor(climate, '2026-10-31' as never)).toBe('GROWING');
        expect(entry.seasonFor(climate, '2026-11-01' as never)).toBe('DORMANT');
      }
    }
  });

  it('keeps year-round entries growing for every climate and date', () => {
    const entry = allCatalogEntriesForTesting().find(
      (candidate) => candidate.species === 'Monstera adansonii',
    );
    expect(entry).toBeDefined();
    if (!entry) return;

    for (const climate of SUPPORTED_CLIMATES) {
      expect(entry.seasonFor(climate, '2026-01-01' as never)).toBe('GROWING');
      expect(entry.seasonFor(climate, '2026-12-31' as never)).toBe('GROWING');
    }
  });

  it('keeps year-round interval selection stable across seasons', () => {
    for (const entry of allCatalogEntriesForTesting()) {
      if (entry.seasonalModel !== 'YEAR_ROUND') continue;

      for (const climate of SUPPORTED_CLIMATES) {
        expect(entry.intervalFor(climate, 'GROWING', 'WATERING')).toBe(
          entry.intervalFor(climate, 'DORMANT', 'WATERING'),
        );
        if (entry.fertilizationApplicable) {
          expect(entry.intervalFor(climate, 'GROWING', 'FERTILIZING')).toBe(
            entry.intervalFor(climate, 'DORMANT', 'FERTILIZING'),
          );
        }
      }
    }
  });

  it('provides positive intervals for each climate and applicable season', () => {
    for (const entry of allCatalogEntriesForTesting()) {
      for (const climate of SUPPORTED_CLIMATES) {
        const seasons = entry.seasonalModel === 'YEAR_ROUND'
          ? ['GROWING'] as const
          : ['GROWING', 'DORMANT'] as const;
        for (const season of seasons) {
          const wateringInterval = entry.intervalFor(climate, season, 'WATERING');
          expect(wateringInterval).toBeGreaterThan(0);
          expect(Number.isInteger(wateringInterval)).toBe(true);
          if (entry.fertilizationApplicable) {
            const fertilizingInterval = entry.intervalFor(climate, season, 'FERTILIZING');
            expect(fertilizingInterval).toBeGreaterThan(0);
            expect(Number.isInteger(fertilizingInterval)).toBe(true);
          }
        }
      }
    }
  });

  it('declares the required fertilizer mode for each concrete catalog entry', () => {
    const entries = allCatalogEntriesForTesting();
    expect(entries.find((entry) => entry.species === 'Monstera deliciosa')?.fertilizerModes)
      .toEqual(['LIQUID']);
    expect(entries.find((entry) => entry.species === 'Monstera adansonii')?.fertilizerModes)
      .toEqual(['NONE']);
    expect(entries.find((entry) => entry.genus === 'Sansevieria')?.fertilizerModes)
      .toEqual(['LONG_TERM']);
    expect(entries.find((entry) => entry.genus === 'Phalaenopsis')?.fertilizerModes)
      .toEqual(['LIQUID']);
  });

  it('freezes exposed entries and detaches them from mutable catalog inputs', () => {
    const record = createCatalogRecordForTesting({ genus: 'Mutable' });
    const catalog = createKnowledgeCatalogForTesting([record]);
    const entry = catalog[0];

    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.fertilizerModes)).toBe(true);
    expect(Reflect.set(entry, 'genus', 'Changed')).toBe(false);
    expect(Reflect.set(entry.fertilizerModes, 0, 'LIQUID')).toBe(false);
    expect(entry.genus).toBe('Mutable');
    expect(entry.fertilizerModes).toEqual(['NONE']);

    (record.wateringIntervals.TROPICAL as { GROWING: number }).GROWING = 1;
    expect(entry.intervalFor('TROPICAL', 'GROWING', 'WATERING')).toBe(7);
  });
});