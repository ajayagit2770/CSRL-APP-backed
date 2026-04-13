import fs from 'fs';
import csv from 'csv-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Import our MongoDB schemas exactly as the application uses them
import Profile from './models/Profile.js';
import TestScore from './models/TestScore.js';
import { upsertProfileDoc, upsertTestDoc } from './services/dbService.js';
import { initMongo } from './services/mongoInit.js';

dotenv.config();

const type = process.argv[2];
const filePath = process.argv[3];

if (!['profile', 'test'].includes(type) || !filePath) {
  console.error('\n❌ Invalid Usage!');
  console.log('Usage to import Profiles:  node importCsv.js profile <path-to-csv>');
  console.log('Usage to import Tests:     node importCsv.js test <path-to-csv>\n');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`\n❌ Error: Cannot find file '${filePath}'\n`);
  process.exit(1);
}

async function runImport() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not found in your .env file!');
    process.exit(1);
  }

  console.log('🔄 Connecting to MongoDB...');
  await initMongo();

  const results = [];

  console.log(`📂 Reading ${type} data from ${filePath}...`);
  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      console.log(`✅ Finished parsing! Found ${results.length} rows.`);
      
      let successCount = 0;
      let errorCount = 0;

      for (const row of results) {
        // Standardize keys dynamically for safety
        const rollKey = row['ROLL_KEY'] || row['rollKey'] || row['ROLL_NO'] || row['rollNo'];
        const centerCode = row['centerCode'] || row['centreCode'];

        if (!rollKey || !centerCode) {
          console.warn(`⚠️ Skipping row: Missing ROLL_KEY or centerCode. Data ->`, row);
          errorCount++;
          continue;
        }

        // Clean keys because MongoDB strictly forbids '.' inside field names
        const cleanRow = {};
        for (const [key, val] of Object.entries(row)) {
          const cleanKey = key.replace(/\./g, ' ').trim();
          cleanRow[cleanKey] = val;
        }

        // Inject the strictly correct naming into the row object so the backend reads it flawlessly
        cleanRow.ROLL_KEY = rollKey;
        cleanRow.centerCode = centerCode;

        try {
          if (type === 'profile') {
            await upsertProfileDoc(cleanRow);
          } else if (type === 'test') {
            // For tests, your system expects flattened scores in the root object, which the CSV provides perfectly natively!
            await upsertTestDoc(centerCode, rollKey, cleanRow);
          }
          successCount++;
        } catch (e) {
          console.error(`❌ Error importing row for ${rollKey}:`, e.message);
          errorCount++;
        }
      }

      console.log('\n🎉 Import Completed!');
      console.log(`✅ Successfully uploaded: ${successCount}`);
      if (errorCount > 0) console.log(`⚠️ Skips/Errors: ${errorCount}`);
      
      process.exit(0);
    });
}

runImport();
