import type { KnowledgeEntry } from '../scheduling/types';

export type ClimateClassification =
  | 'TROPICAL'
  | 'ARID'
  | 'MEDITERRANEAN'
  | 'TEMPERATE'
  | 'CONTINENTAL'
  | 'POLAR';

export interface HouseholdLocation {
  readonly city: string;
  readonly country: string;
}

export interface ClimateResolution {
  readonly climate: ClimateClassification;
  readonly usedFallback: boolean;
}

export interface PlantKnowledgeQuery {
  readonly species?: string;
  readonly genus: string;
}

export type KnowledgeLookupResult =
  | { readonly status: 'FOUND'; readonly entry: KnowledgeEntry }
  | {
      readonly status: 'UNSUPPORTED';
      readonly requestedSpecies?: string;
      readonly requestedGenus?: string;
    };