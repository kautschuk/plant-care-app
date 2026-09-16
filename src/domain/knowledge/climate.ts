import type {
  ClimateClassification,
  ClimateResolution,
  HouseholdLocation,
} from './types';

const COUNTRY_CLIMATES: Readonly<Record<string, ClimateClassification>> = {
  'united kingdom': 'TEMPERATE',
  kenya: 'TROPICAL',
  egypt: 'ARID',
  spain: 'MEDITERRANEAN',
  canada: 'CONTINENTAL',
  iceland: 'POLAR',
};

const CITY_CLIMATE_OVERRIDES: Readonly<Record<string, ClimateClassification>> = {
  'cape town|south africa': 'MEDITERRANEAN',
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function resolveClimate(
  location: HouseholdLocation,
): ClimateResolution {
  const city = normalize(location.city);
  const country = normalize(location.country);

  if (!country) {
    return { climate: 'TEMPERATE', usedFallback: true };
  }

  const override = CITY_CLIMATE_OVERRIDES[`${city}|${country}`];
  const climate = override ?? COUNTRY_CLIMATES[country];

  if (!climate) {
    return { climate: 'TEMPERATE', usedFallback: true };
  }

  return { climate, usedFallback: false };
}