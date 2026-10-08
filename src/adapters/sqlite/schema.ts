import { PersistenceError } from '../../domain/persistence/errors';
import type { SQLiteDriver, SQLiteExecutor } from './driver';

export const CURRENT_SCHEMA_VERSION = 1;

const VERSION_ONE_SCHEMA = `
CREATE TABLE household_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  knowledge_level TEXT NOT NULL,
  commitment_level TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  climate TEXT NOT NULL CHECK (climate IN (
    'TROPICAL', 'ARID', 'MEDITERRANEAN', 'TEMPERATE', 'CONTINENTAL', 'POLAR'
  )),
  climate_used_fallback INTEGER NOT NULL CHECK (climate_used_fallback IN (0, 1))
);

CREATE TABLE plants (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  genus TEXT NOT NULL,
  species TEXT,
  taxonomic_level TEXT NOT NULL CHECK (taxonomic_level IN ('SPECIES', 'GENUS')),
  archived INTEGER NOT NULL CHECK (archived IN (0, 1))
);

CREATE TABLE care_configurations (
  plant_id TEXT PRIMARY KEY NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  scheduling_enabled INTEGER NOT NULL CHECK (scheduling_enabled IN (0, 1)),
  fertilizer_mode TEXT NOT NULL CHECK (fertilizer_mode IN ('NONE', 'LIQUID', 'LONG_TERM'))
);

CREATE TABLE schedule_states (
  plant_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  care_type TEXT NOT NULL CHECK (care_type IN ('WATERING', 'FERTILIZING')),
  state_json TEXT NOT NULL,
  PRIMARY KEY (plant_id, care_type)
);

CREATE TABLE care_events (
  id TEXT PRIMARY KEY NOT NULL,
  plant_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'WATERING', 'FERTILIZING', 'REPOTTING', 'PROPAGATION'
  )),
  event_date TEXT NOT NULL
);

CREATE INDEX care_events_plant_date_idx ON care_events (plant_id, event_date);
`;

export async function readSchemaVersion(
  database: SQLiteExecutor,
): Promise<number> {
  const row = await database.getFirst<{ user_version: number }>(
    'PRAGMA user_version',
  );
  if (!row || !Number.isInteger(row.user_version) || row.user_version < 0) {
    throw new PersistenceError(
      'DATABASE_FAILURE',
      'Could not read the SQLite schema version',
    );
  }
  return row.user_version;
}

export async function initializeSchema(database: SQLiteDriver): Promise<void> {
  await database.exec('PRAGMA foreign_keys = ON');
  await database.exec('PRAGMA journal_mode = WAL');

  const version = await readSchemaVersion(database);
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new PersistenceError(
      'DATABASE_FAILURE',
      `Database schema version ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}`,
    );
  }
  if (version === CURRENT_SCHEMA_VERSION) return;

  try {
    await database.transaction(async (transaction) => {
      await transaction.exec(VERSION_ONE_SCHEMA);
      await transaction.exec('PRAGMA user_version = 1');
    });
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError(
      'DATABASE_FAILURE',
      'Could not apply SQLite schema migration 1',
      error,
    );
  }
}