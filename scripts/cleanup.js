import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { initMongo } from '../services/mongoInit.js';
import TestScore from '../models/TestScore.js';
import StudentWeakTopics from '../models/StudentWeakTopics.js';
import CenterWeakTopics from '../models/CenterWeakTopics.js';
import TopicMap from '../models/TopicMap.js';
import StudentRawMarks from '../models/StudentRawMarks.js';
import StudentOverallWeakTopics from '../models/StudentOverallWeakTopics.js';
import CenterOverallWeakTopics from '../models/CenterOverallWeakTopics.js';

async function run() {
  await initMongo();
  console.log('Connected to MongoDB.');

  const badKeys = ['c', 'CAT-4', 'CAT4'];

  console.log('Cleaning TestScore collection...');
  let updateCount = 0;
  
  const testScores = await TestScore.find({});
  for (const doc of testScores) {
    let changed = false;
    const updateObj = { $unset: {} };
    
    for (const badKey of badKeys) {
      if (doc.get(badKey) !== undefined) {
        updateObj.$unset[badKey] = "";
        changed = true;
      }
      if (doc.tests && doc.tests[badKey] !== undefined) {
        updateObj.$unset[`tests.${badKey}`] = "";
        changed = true;
      }
      // Also look for flat key variations like CAT-4_Physics
      for (const key of Object.keys(doc.toObject())) {
        if (key.startsWith(`${badKey}_`) || key.startsWith(`tests.${badKey}_`)) {
          updateObj.$unset[key] = "";
          changed = true;
        }
      }
      if (doc.tests) {
        for (const testKey of Object.keys(doc.tests)) {
          if (testKey.startsWith(`${badKey}_`)) {
            updateObj.$unset[`tests.${testKey}`] = "";
            changed = true;
          }
        }
      }
    }

    if (changed) {
      await TestScore.updateOne({ _id: doc._id }, updateObj);
      updateCount++;
    }
  }
  console.log(`Updated ${updateCount} TestScore documents.`);

  console.log('Cleaning Weak Topics & Topic Maps...');
  for (const badTestId of badKeys) {
    const res1 = await StudentWeakTopics.deleteMany({ testId: badTestId });
    const res2 = await CenterWeakTopics.deleteMany({ testId: badTestId });
    const res3 = await TopicMap.deleteMany({ testId: badTestId });
    const res4 = await StudentRawMarks.deleteMany({ testId: badTestId });
    console.log(`Deleted testId: ${badTestId} | SWT: ${res1.deletedCount}, CWT: ${res2.deletedCount}, TM: ${res3.deletedCount}, SRM: ${res4.deletedCount}`);
  }

  // To be safe, clear all overall weak topics to force a recompute without the ghost tests
  console.log('Deleting overall weak topics caches to force recompute...');
  await StudentOverallWeakTopics.deleteMany({});
  await CenterOverallWeakTopics.deleteMany({});

  console.log('Cleanup complete.');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
