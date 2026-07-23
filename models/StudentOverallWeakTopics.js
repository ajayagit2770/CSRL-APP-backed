import mongoose from 'mongoose';

// Reused for both topic lists and subject lists in the overall rollup
const OverallSubjectWeakSchema = new mongoose.Schema({
  strongWeak: { type: [String], default: [] }, // topic/subject names flagged in >= 50% of tests
  mediumWeak: { type: [String], default: [] }, // topic/subject names flagged in >= 50% of tests (either tier)
}, { _id: false });

const SubjectMetricsSchema = new mongoose.Schema({
  attempted: { type: Number, default: 0 },
  correct:   { type: Number, default: 0 },
  wrong:     { type: Number, default: 0 },
}, { _id: false });

const StudentOverallWeakTopicsSchema = new mongoose.Schema({
  studentId:     { type: String, required: true },
  centerId:      { type: String, required: true },
  testsIncluded: { type: [String], default: [] }, // only tests student actually attempted
  totalTests:    { type: Number, default: 0 },

  // Overall question performance metrics aggregated across all included tests
  totalAttempted: { type: Number, default: 0 },
  totalCorrect:   { type: Number, default: 0 },
  totalWrong:     { type: Number, default: 0 },

  // Multi-test aggregate: subject-level metrics
  overallSubjectMetrics: {
    Physics:     { type: SubjectMetricsSchema, default: () => ({ attempted: 0, correct: 0, wrong: 0 }) },
    Chemistry:   { type: SubjectMetricsSchema, default: () => ({ attempted: 0, correct: 0, wrong: 0 }) },
    Mathematics: { type: SubjectMetricsSchema, default: () => ({ attempted: 0, correct: 0, wrong: 0 }) },
  },

  // Multi-test aggregate: topic-level (existing)
  overallWeakTopics: {
    Physics:     { type: OverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: OverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: OverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },

  // Multi-test aggregate: subject-level (new — question-accuracy based)
  overallWeakSubjects: {
    Physics:     { type: OverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: OverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: OverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },

  computedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Unique index per student
StudentOverallWeakTopicsSchema.index({ studentId: 1 }, { unique: true });

export default mongoose.models.StudentOverallWeakTopics || mongoose.model('StudentOverallWeakTopics', StudentOverallWeakTopicsSchema);
