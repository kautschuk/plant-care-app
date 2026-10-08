import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

export type SQLiteValue = string | number | null | Uint8Array;

export interface SQLiteRunResult {
  readonly changes: number;
  readonly lastInsertRowId: number;
}

export interface SQLiteExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, parameters?: readonly SQLiteValue[]): Promise<SQLiteRunResult>;
  getFirst<T extends object>(
    sql: string,
    parameters?: readonly SQLiteValue[],
  ): Promise<T | null>;
  getAll<T extends object>(
    sql: string,
    parameters?: readonly SQLiteValue[],
  ): Promise<readonly T[]>;
}

export interface SQLiteDriver extends SQLiteExecutor {
  transaction<T>(operation: (executor: SQLiteExecutor) => Promise<T>): Promise<T>;
}

type ExpoExecutor = Pick<
  SQLite.SQLiteDatabase,
  'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync'
>;

export function createExpoSQLiteDriver(
  database: SQLite.SQLiteDatabase,
): SQLiteDriver {
  const executor = createExpoExecutor(database);

  return {
    ...executor,
    async transaction<T>(
      operation: (executor: SQLiteExecutor) => Promise<T>,
    ): Promise<T> {
      let result!: T;
      if (Platform.OS === 'web') {
        await database.withTransactionAsync(async () => {
          result = await operation(executor);
        });
      } else {
        await database.withExclusiveTransactionAsync(async (transaction) => {
          result = await operation(createExpoExecutor(transaction));
        });
      }
      return result;
    },
  };
}

function createExpoExecutor(database: ExpoExecutor): SQLiteExecutor {
  return {
    async exec(sql) {
      await database.execAsync(sql);
    },

    async run(sql, parameters = []) {
      const result = await database.runAsync(sql, [...parameters]);
      return {
        changes: result.changes,
        lastInsertRowId: result.lastInsertRowId,
      };
    },

    async getFirst<T extends object>(
      sql: string,
      parameters: readonly SQLiteValue[] = [],
    ): Promise<T | null> {
      return database.getFirstAsync<T>(sql, [...parameters]);
    },

    async getAll<T extends object>(
      sql: string,
      parameters: readonly SQLiteValue[] = [],
    ): Promise<readonly T[]> {
      return database.getAllAsync<T>(sql, [...parameters]);
    },
  };
}