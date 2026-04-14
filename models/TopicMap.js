import mongoose from 'mongoose';

const TopicEntrySchema = new mongoose.Schema({
  topic:     { type: String, required: true },
  subject:   { type: String, required: true }, // "Physics" / "Chemistry" / "Mathematics"
  questions: { type: [String], required: true }, // e.g. ["Q7", "Q9"]
}, { _id: false });

const TopicMapSchema = new mongoose.Schema({
  testId: { type: String, required: true }, // e.g. "CAT5"
  paper:  { type: String, required: true }, // "paper1" or "paper2"
  topics: { type: [TopicEntrySchema], default: [] },
}, { timestamps: true });

// Compound index for fast lookup
TopicMapSchema.index({ testId: 1, paper: 1 });

export default mongoose.models.TopicMap || mongoose.model('TopicMap', TopicMapSchema);
