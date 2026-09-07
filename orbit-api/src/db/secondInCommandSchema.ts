import { pool } from './connection';

export async function ensureSecondInCommandScopes() {
  for (const schema of ['public', 'core']) {
    const result = await pool.query('SELECT to_regclass($1) AS name', [`${schema}.person`]);
    if (result.rows[0].name) {
      await pool.query(`ALTER TABLE ${schema}.person ADD COLUMN IF NOT EXISTS second_in_command_scopes text[] NOT NULL DEFAULT '{}'`);
    }
  }
}
