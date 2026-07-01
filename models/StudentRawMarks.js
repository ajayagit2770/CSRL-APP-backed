import mongoose from 'mongoose';

const StudentRawMarksSchema = new mongoose.Schema({
  studentId:   { type: String, required: true }, // roll_no from CSV
  testId:      { type: String, required: true }, // e.g. "CAT5"
  // NOTE: paper field removed — a test now has exactly one mark-set per student.
  centerId:    { type: String, required: true }, // Location from CSV (e.g. "KNP")
  studentName: { type: String, default: '' },    // Name from CSV
  marks:       { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  // marks stores: positive number = correct, 0 = unattempted/wrong, negative = wrong+penalty,
  // null = blank/missing (excluded from calculation — NOT treated as 0).
}, { timestamps: true });

// Index for bulk queries by testId
StudentRawMarksSchema.index({ testId: 1 });

// Unique per student+test (one record per student per test, no paper branching)
StudentRawMarksSchema.index({ studentId: 1, testId: 1 }, { unique: true });

export default mongoose.models.StudentRawMarks || mongoose.model('StudentRawMarks', StudentRawMarksSchema);
