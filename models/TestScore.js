import mongoose from 'mongoose';

const TestScoreSchema = new mongoose.Schema({
  ROLL_KEY: { type: String, required: true },
  centerCode: { type: String, required: true },
  stream: { type: String, default: 'JEE' },
  tests: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { strict: false, timestamps: true });

TestScoreSchema.index({ centerCode: 1, ROLL_KEY: 1 }, { unique: true });

export default mongoose.models.TestScore || mongoose.model('TestScore', TestScoreSchema);
