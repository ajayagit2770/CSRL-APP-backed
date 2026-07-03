import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import Profile from './models/Profile.js';
import TestScore from './models/TestScore.js';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const pRes = await Profile.updateMany({ centerCode: 'KNP' }, { $set: { centerCode: 'GAIL' } });
  console.log('Updated profiles:', pRes.modifiedCount);

  const tRes = await TestScore.updateMany({ centerCode: 'KNP' }, { $set: { centerCode: 'GAIL' } });
  console.log('Updated test scores:', tRes.modifiedCount);

  process.exit(0);
}
run();
