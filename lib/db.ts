import { Pool, types } from "pg";

// How Postgres values arrive in JavaScript.
// DATE (type 1082): keep it as "YYYY-MM-DD" text, so a calendar date is
// never treated as a moment in time that could shift between time zones.
types.setTypeParser(1082, (value: string) => value);
// NUMERIC (1700) and COUNT results (20) arrive as text by default; make them numbers.
types.setTypeParser(1700, (value: string) => parseFloat(value));
types.setTypeParser(20, (value: string) => parseInt(value, 10));

// One shared connection pool for the whole app, reused across requests.
const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

// Run a SQL query and return its rows. Always pass values as params ($1, $2...).
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
