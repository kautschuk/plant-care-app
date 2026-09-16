import type {
  ClimateResolution,
  HouseholdLocation,
  KnowledgeLookupResult,
  PlantKnowledgeQuery,
} from './types';

export type {
  ClimateClassification,
  ClimateResolution,
  HouseholdLocation,
  KnowledgeLookupResult,
  PlantKnowledgeQuery,
} from './types';

export declare function resolveClimate(
  location: HouseholdLocation,
): ClimateResolution;

export declare function findPlantKnowledge(
  query: PlantKnowledgeQuery,
): KnowledgeLookupResult;