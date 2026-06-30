/**
 * seed-csv.ts — seeds the DB from recipes_clean.csv
 * Place recipes_clean.csv at the project root or apps/api/, then run:
 *   npm run seed:csv
 */
import * as path from 'path';
import * as fs from 'fs';
import { ingestRecipesFromCsv } from './modules/admin/upload.service';

async function main() {
  const candidates = [
    path.join(__dirname, '../../../../recipes_clean.csv'),
    path.join(__dirname, '../../../recipes_clean.csv'),
    path.join(__dirname, '../../recipes_clean.csv'),
    path.join(__dirname, '../recipes_clean.csv'),
    path.join(process.cwd(), 'recipes_clean.csv'),
  ];

  const csvPath = candidates.find(p => fs.existsSync(p));
  if (!csvPath) {
    console.error('❌  recipes_clean.csv not found. Place it at the project root or apps/api/ folder.');
    process.exit(1);
  }

  // Copy to a tmp path so the original is preserved
  const tmpPath = csvPath + '.seeding_tmp';
  fs.copyFileSync(csvPath, tmpPath);

  console.log(`📂  Found CSV at: ${csvPath}`);
  console.log('⏳  Ingesting recipes — this may take a few minutes for 6800+ rows…');

  try {
    const count = await ingestRecipesFromCsv(tmpPath);
    console.log(`✅  Done! ${count} recipes inserted into the database.`);
  } catch (e) {
    console.error('❌  Error during ingestion:', e);
    // Clean up tmp file on error
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    process.exit(1);
  }
}

main();
