import admin from 'firebase-admin';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';

// Load .env file
dotenv.config();

// 1. Setup Firebase Configuration
const FIREBASE_CREDENTIALS_PATH = new URL('./config/serviceAccountKey.json', import.meta.url);

function initFirebase() {
  if (admin.apps.length) return true;

  try {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (existsSync(FIREBASE_CREDENTIALS_PATH)) {
      const cred = JSON.parse(readFileSync(FIREBASE_CREDENTIALS_PATH, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    } else if (json) {
      const cred = JSON.parse(json);
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    } else if (path && existsSync(path)) {
      const cred = JSON.parse(readFileSync(path, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    } else {
      console.error('[Firebase] No credentials found. Ensure serviceAccountKey.json exists.');
      return false;
    }
    console.log('[Firebase] Admin SDK initialized successfully.');
    return true;
  } catch (e) {
    console.error('[Firebase] Init failed:', e.message);
    return false;
  }
}

// 2. Setup MongoDB Models
const ProfileSchema = new mongoose.Schema({
  ROLL_KEY: { type: String, required: true },
  centerCode: { type: String, required: true }
}, { strict: false, timestamps: true });

const TestScoreSchema = new mongoose.Schema({
  ROLL_KEY: { type: String, required: true },
  centerCode: { type: String, required: true },
  stream: { type: String, default: 'JEE' },
  tests: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { strict: false, timestamps: true });

const Profile = mongoose.models.Profile || mongoose.model('Profile', ProfileSchema);
const TestScore = mongoose.models.TestScore || mongoose.model('TestScore', TestScoreSchema);

// 3. Migration Logic
async function runMigration() {
  if (!initFirebase()) {
    console.error('Migration aborted: Firebase not properly configured.');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Migration aborted: MONGODB_URI not set in environment.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('[MongoDB] Connected successfully.');
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err.message);
    process.exit(1);
  }

  const db = admin.firestore();

  // --- MIGRATE PROFILES ---
  console.log('--- Migrating Profiles (Students) ---');
  const pSnap = await db.collection('students').get();
  console.log(`Found ${pSnap.docs.length} profiles in Firebase.`);

  for (const doc of pSnap.docs) {
    const rawData = doc.data();
    if (!rawData.ROLL_KEY || !rawData.centerCode) continue;

    try {
      await Profile.findOneAndUpdate(
        { centerCode: rawData.centerCode, ROLL_KEY: rawData.ROLL_KEY },
        { $set: rawData },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch (e) {
      console.error(`Failed to migrate profile ${rawData.ROLL_KEY}:`, e.message);
    }
  }
  console.log('✅ Profiles migration completed.');


  // --- MIGRATE TEST SCORES ---
  console.log('\n--- Migrating Test Scores ---');
  const tSnap = await db.collection('testScores').get();
  console.log(`Found ${tSnap.docs.length} testscore documents in Firebase.`);

  for (const doc of tSnap.docs) {
    const rawData = doc.data();
    const rollKey = rawData.ROLL_KEY || rawData.rollKey;
    const cCode = rawData.centerCode || rawData.centreCode;
    
    if (!rollKey || !cCode) continue;

    try {
      await TestScore.findOneAndUpdate(
        { centerCode: cCode, ROLL_KEY: rollKey },
        { $set: rawData },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch (e) {
       console.error(`Failed to migrate test doc ${rollKey}:`, e.message);
    }
  }
  console.log('✅ Test Scores migration completed.');

  console.log('\n🎉 All Data Migrated Successfully!');
  process.exit(0);
}

runMigration();
