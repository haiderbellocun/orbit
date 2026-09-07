import { pool } from './connection';
import { ensureSecondInCommandScopes } from './secondInCommandSchema';

async function main() {
  await ensureSecondInCommandScopes();
  console.log('Migración de segundos al mando completada');
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
