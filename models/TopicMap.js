import mongoose from 'mongoose';

const TopicEntrySchema = new mongoose.Schema({
  topic:         { type: String, required: true },
  subject:       { type: String, required: true }, // "Physics" / "Chemistry" / "Mathematics"
  questions:     { type: [String], required: true }, // e.g. ["Q7", "Q9"]
  questionCount: { type: Number, default: 0 },       // for diagnostics (edge-case #1 warnings)
}, { _id: false });

const TopicMapSchema = new mongoose.Schema({
  testId: { type: String, required: true }, // e.g. "CAT5"
  // NOTE: paper field removed — each test now has exactly one paper / one sheet upload.
  topics: { type: [TopicEntrySchema], default: [] },
}, { timestamps: true });

// One topic-map per test (unique on testId alone)
TopicMapSchema.index({ testId: 1 }, { unique: true });

export default mongoose.models.TopicMap || mongoose.model('TopicMap', TopicMapSchema);
