import mongoose from 'mongoose';

// Per-topic stat in the center overall rollup
const CenterOverallTopicStatSchema = new mongoose.Schema({
  topic:             { type: String, required: true },
  avgWeakPercentage: { type: Number, required: true }, // avg center-weak% across tests where flagged
  strongWeakCount:   { type: Number, required: true }, // # tests where >= 50% of students were weak
  mediumWeakCount:   { type: Number, required: true }, // # tests where > 39% & < 50% were weak
  testedCount:       { type: Number, required: true }, // # tests where topic was present
}, { _id: false });

// Per-subject stat in the center overall rollup
const CenterOverallSubjectStatSchema = new mongoose.Schema({
  subject:           { type: String, required: true },
  avgWeakPercentage: { type: Number, required: true },
  strongWeakCount:   { type: Number, required: true },
  mediumWeakCount:   { type: Number, required: true },
  testedCount:       { type: Number, required: true },
}, { _id: false });

const CenterOverallSubjectWeakTopicSchema = new mongoose.Schema({
  strongWeak: { type: [CenterOverallTopicStatSchema],   default: [] },
  mediumWeak: { type: [CenterOverallTopicStatSchema],   default: [] },
}, { _id: false });

const CenterOverallSubjectWeakSubjectSchema = new mongoose.Schema({
  strongWeak: { type: [CenterOverallSubjectStatSchema], default: [] },
  mediumWeak: { type: [CenterOverallSubjectStatSchema], default: [] },
}, { _id: false });

const CenterOverallWeakTopicsSchema = new mongoose.Schema({
  centerId:      { type: String, required: true },
  testsIncluded: { type: [String], default: [] },
  totalTests:    { type: Number, default: 0 },

  // Multi-test aggregate: topic-level (existing)
  overallWeakTopics: {
    Physics:     { type: CenterOverallSubjectWeakTopicSchema,   default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: CenterOverallSubjectWeakTopicSchema,   default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: CenterOverallSubjectWeakTopicSchema,   default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },

  // Multi-test aggregate: subject-level (new — question-accuracy based)
  overallWeakSubjects: {
    Physics:     { type: CenterOverallSubjectWeakSubjectSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: CenterOverallSubjectWeakSubjectSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: CenterOverallSubjectWeakSubjectSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },

  computedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Unique index per center
CenterOverallWeakTopicsSchema.index({ centerId: 1 }, { unique: true });

export default mongoose.models.CenterOverallWeakTopics || mongoose.model('CenterOverallWeakTopics', CenterOverallWeakTopicsSchema);
