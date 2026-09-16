import type {
  ClimateResolution,
  HouseholdLocation,
  KnowledgeLookupResult,
  PlantKnowledgeQuery,
} from './types';

export { resolveClimate } from './climate';

export type {
  ClimateClassification,
  ClimateResolution,
  HouseholdLocation,
  KnowledgeLookupResult,
  PlantKnowledgeQuery,
} from './types';

export declare function findPlantKnowledge(
  query: PlantKnowledgeQuery,
): KnowledgeLookupResult;