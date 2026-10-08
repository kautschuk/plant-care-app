import initSqlJs, { type Database, type SqlValue } from 'sql.js';

import type {
  SQLiteDriver,
  SQLiteExecutor,
  SQLiteRunResult,
  SQLiteValue,
} from '../../src/adapters/sqlite/driver';

export async function createSqliteTestDriver(): Promise<SQLiteDriver> {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  const executor = createExecutor(database);

  return {
    ...executor,
    async transaction<T>(operation: (transaction: SQLiteExecutor) => Promise<T>) {
      database.run('BEGIN IMMEDIATE');
      try {
        const result = await operation(executor);
        database.run('COMMIT');
        return result;
      } catch (error) {
        try {
          database.run('ROLLBACK');
        } catch {
          // Preserve the operation error if rollback itself fails.
        }
        throw error;
      }
    },
  };
}

function createExecutor(database: Database): SQLiteExecutor {
  return {
    async exec(sql) {
      database.run(sql);
    },

    async run(sql, parameters = []) {
      database.run(sql, toSqlValues(parameters));
      const row = database.exec('SELECT last_insert_rowid() AS id')[0];
      return {
        changes: database.getRowsModified(),
        lastInsertRowId: Number(row?.values[0]?.[0] ?? 0),
      } satisfies SQLiteRunResult;
    },

    async getFirst<T extends object>(
      sql: string,
      parameters: readonly SQLiteValue[] = [],
    ): Promise<T | null> {
      const statement = database.prepare(sql);
      try {
        statement.bind(toSqlValues(parameters));
        if (!statement.step()) return null;
        return statement.getAsObject() as T;
      } finally {
        statement.free();
      }
    },

    async getAll<T extends object>(
      sql: string,
      parameters: readonly SQLiteValue[] = [],
    ): Promise<readonly T[]> {
      const statement = database.prepare(sql);
      try {
        statement.bind(toSqlValues(parameters));
        const rows: T[] = [];
        while (statement.step()) rows.push(statement.getAsObject() as T);
        return rows;
      } finally {
        statement.free();
      }
    },
  };
}

function toSqlValues(values: readonly SQLiteValue[]): SqlValue[] {
  return values.map((value) => value as SqlValue);
}