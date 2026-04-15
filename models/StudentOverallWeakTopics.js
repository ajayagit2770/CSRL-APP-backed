import mongoose from 'mongoose';

const OverallSubjectWeakSchema = new mongoose.Schema({
  strongWeak: { type: [String], default: [] },
  mediumWeak: { type: [String], default: [] },
}, { _id: false });

const StudentOverallWeakTopicsSchema = new mongoose.Schema({
  studentId:     { type: String, required: true },
  centerId:      { type: String, required: true },
  testsIncluded: { type: [String], default: [] },
  totalTests:    { type: Number, default: 0 },
  overallWeakTopics: {
    Physics:     { type: OverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: OverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: OverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },
  computedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Unique index per student
StudentOverallWeakTopicsSchema.index({ studentId: 1 }, { unique: true });

export default mongoose.models.StudentOverallWeakTopics || mongoose.model('StudentOverallWeakTopics', StudentOverallWeakTopicsSchema);
