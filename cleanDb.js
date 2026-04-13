import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { initMongo } from './services/mongoInit.js';
import Profile from './models/Profile.js';
import TestScore from './models/TestScore.js';

dotenv.config();

async function run() {
  await initMongo();
  console.log('Clearing database to reset corrupt schemas...');
  await Profile.deleteMany({});
  await TestScore.deleteMany({});
  console.log('✅ Database completely wiped clean!');
  process.exit(0);
}

run();
