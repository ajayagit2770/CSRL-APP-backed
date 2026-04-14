import mongoose from 'mongoose';

const SubjectWeakSchema = new mongoose.Schema({
  strongWeak: { type: [String], default: [] },
  mediumWeak: { type: [String], default: [] },
}, { _id: false });

const StudentWeakTopicsSchema = new mongoose.Schema({
  studentId:  { type: String, required: true },
  testId:     { type: String, required: true },
  centerId:   { type: String, required: true },
  weakTopics: {
    Physics:     { type: SubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: SubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: SubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },
  computedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Unique compound index per student+test
StudentWeakTopicsSchema.index({ studentId: 1, testId: 1 }, { unique: true });

export default mongoose.models.StudentWeakTopics || mongoose.model('StudentWeakTopics', StudentWeakTopicsSchema);
