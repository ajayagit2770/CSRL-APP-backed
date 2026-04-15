import mongoose from 'mongoose';

const CenterOverallTopicStatSchema = new mongoose.Schema({
  topic:             { type: String, required: true },
  avgWeakPercentage: { type: Number, required: true },
  strongWeakCount:   { type: Number, required: true },
  mediumWeakCount:   { type: Number, required: true },
  testedCount:       { type: Number, required: true },
}, { _id: false });

const CenterOverallSubjectWeakSchema = new mongoose.Schema({
  strongWeak: { type: [CenterOverallTopicStatSchema], default: [] },
  mediumWeak: { type: [CenterOverallTopicStatSchema], default: [] },
}, { _id: false });

const CenterOverallWeakTopicsSchema = new mongoose.Schema({
  centerId:      { type: String, required: true },
  testsIncluded: { type: [String], default: [] },
  totalTests:    { type: Number, default: 0 },
  overallWeakTopics: {
    Physics:     { type: CenterOverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: CenterOverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: CenterOverallSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },
  computedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Unique index per center
CenterOverallWeakTopicsSchema.index({ centerId: 1 }, { unique: true });

export default mongoose.models.CenterOverallWeakTopics || mongoose.model('CenterOverallWeakTopics', CenterOverallWeakTopicsSchema);
