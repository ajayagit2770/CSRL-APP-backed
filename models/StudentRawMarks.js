import mongoose from 'mongoose';

const StudentRawMarksSchema = new mongoose.Schema({
  studentId:   { type: String, required: true }, // roll_no from CSV
  testId:      { type: String, required: true }, // e.g. "CAT5"
  paper:       { type: String, required: true }, // "paper1" or "paper2"
  centerId:    { type: String, required: true }, // Location from CSV (e.g. "KNP")
  studentName: { type: String, default: '' },   // Name from CSV
  marks:       { type: Map, of: Number, default: {} }, // { "Q1": 3, "Q2": 0, "Q3": -1 }
}, { timestamps: true });

// Compound index for fast bulk queries
StudentRawMarksSchema.index({ testId: 1, paper: 1 });

// Unique compound index per student+test+paper
StudentRawMarksSchema.index({ studentId: 1, testId: 1, paper: 1 }, { unique: true });

export default mongoose.models.StudentRawMarks || mongoose.model('StudentRawMarks', StudentRawMarksSchema);
