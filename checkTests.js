import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { initMongo } from './services/mongoInit.js';
import TestScore from './models/TestScore.js';

dotenv.config();

async function run() {
  await initMongo();
  const docs = await TestScore.find({}).lean();
  const allTestNames = new Set();
  docs.forEach(doc => {
    if (doc.tests) {
      Object.keys(doc.tests).forEach(t => allTestNames.add(t));
    }
  });
  console.log('Tests found in DB:', Array.from(allTestNames));
  process.exit(0);
}

run();
