import * as SQLite from 'expo-sqlite';

import type { PersistenceStore } from '../../domain/persistence/repositories';
import { createPersistenceStore } from './repositories';
import { initializeSchema } from './schema';
import { createExpoSQLiteDriver } from './driver';

export async function openPersistenceStore(
  databaseName = 'plant-care.db',
): Promise<PersistenceStore> {
  const database = await SQLite.openDatabaseAsync(databaseName);
  const driver = createExpoSQLiteDriver(database);
  await initializeSchema(driver);
  return createPersistenceStore(driver);
}