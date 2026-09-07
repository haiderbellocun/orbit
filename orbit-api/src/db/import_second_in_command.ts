import * as XLSX from 'xlsx';
import { pool } from './connection';
import { resolveCoreSchemaMode } from '../lib/coreSchema';
import { normalizeSecondInCommandScopes } from '../lib/secondInCommand';

// Explicit import, never run at startup: later manual reassignments must be preserved.
async function main() {
  const file = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  if (!file) throw new Error('Uso: npm run import:second-in-command -- <archivo.xlsx> [--apply]');
  const workbook = XLSX.readFile(file);
  const sheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === 'segundos al mando');
  if (!sheetName) throw new Error('No se encontró la hoja Segundos al mando');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, blankrows: false });
  const assignments = new Map<string, string[]>();
  for (const row of rows) {
    const document = String(row[5] ?? '').trim();
    if (!/^\d+$/.test(document) || !row[4] || !row[3]) continue;
    assignments.set(document, normalizeSecondInCommandScopes([...(assignments.get(document) ?? []), String(row[3])]));
  }
  if (!assignments.size) throw new Error('El archivo no contiene asignaciones válidas');
  console.log(`${assignments.size} personas, ${[...assignments.values()].flat().length} asignaciones`);
  const mode = await resolveCoreSchemaMode();
  if (!mode) throw new Error('Catálogo no disponible');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resolved: { id: number; scopes: string[] }[] = [];
    const problems: string[] = [];
    for (const [document, scopes] of assignments) {
      const { rows: people } = await client.query(`SELECT id FROM ${mode}.person WHERE TRIM(document) = $1 FOR UPDATE`, [document]);
      if (people.length !== 1) problems.push(`${document}: ${people.length} coincidencias`);
      else resolved.push({ id: people[0].id, scopes });
    }
    if (problems.length) throw new Error(`No se importó ninguna asignación. Resolver documentos: ${problems.join('; ')}`);
    if (process.argv.includes('--apply')) {
      for (const person of resolved) {
        await client.query(`UPDATE ${mode}.person SET second_in_command_scopes = ARRAY(SELECT DISTINCT unnest(second_in_command_scopes || $1::text[])), updated_at = NOW() WHERE id = $2`, [person.scopes, person.id]);
      }
      await client.query('COMMIT');
      console.log('Asignaciones importadas');
    } else {
      await client.query('ROLLBACK');
      console.log('Validación completada. Usa --apply para guardar.');
    }
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
