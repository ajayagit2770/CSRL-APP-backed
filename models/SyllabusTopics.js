import mongoose from 'mongoose';

const SyllabusTopicsSchema = new mongoose.Schema({
  subject: { type: String, required: true }, // "Physics" / "Chemistry" / "Mathematics"
  topics:  { type: [String], default: [] },  // list of all topic names for this subject
}, { timestamps: true });

export default mongoose.models.SyllabusTopics || mongoose.model('SyllabusTopics', SyllabusTopicsSchema);
