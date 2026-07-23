import mongoose from 'mongoose';

// Topic-level weak classification (arrays of topic name strings)
const SubjectWeakSchema = new mongoose.Schema({
  strongWeak: { type: [String], default: [] }, // "Weakest Topic" — notPositive/total >= 2/3
  mediumWeak: { type: [String], default: [] }, // "Weak Topic"    — notPositive/total >= 1/2 & < 2/3
}, { _id: false });

const SubjectMetricsSchema = new mongoose.Schema({
  attempted: { type: Number, default: 0 },
  correct:   { type: Number, default: 0 },
  wrong:     { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
}, { _id: false });

const StudentWeakTopicsSchema = new mongoose.Schema({
  studentId:  { type: String, required: true },
  testId:     { type: String, required: true },
  centerId:   { type: String, required: true },

  // Overall question performance metrics for this specific test
  attempted:  { type: Number, default: 0 },
  correct:    { type: Number, default: 0 },
  wrong:      { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },

  // Per-subject question performance metrics
  subjectMetrics: {
    Physics:     { type: SubjectMetricsSchema, default: () => ({ attempted: 0, correct: 0, wrong: 0 }) },
    Chemistry:   { type: SubjectMetricsSchema, default: () => ({ attempted: 0, correct: 0, wrong: 0 }) },
    Mathematics: { type: SubjectMetricsSchema, default: () => ({ attempted: 0, correct: 0, wrong: 0 }) },
  },

  // Per-topic classification grouped by subject
  weakTopics: {
    Physics:     { type: SubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: SubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: SubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },

  // Per-subject classification (question-accuracy based — separate from avg-marks method)
  // strongWeak: subject name string if notPositive/total >= 2/3 across all questions in subject
  // mediumWeak: subject name string if notPositive/total >= 1/2 across all questions in subject
  weakSubjects: {
    Physics:     { type: SubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: SubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: SubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },

  computedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Unique compound index per student+test
StudentWeakTopicsSchema.index({ studentId: 1, testId: 1 }, { unique: true });

export default mongoose.models.StudentWeakTopics || mongoose.model('StudentWeakTopics', StudentWeakTopicsSchema);
