import mongoose from 'mongoose';

const TopicStatSchema = new mongoose.Schema({
  topic:      { type: String, required: true },
  count:      { type: Number, required: true },
  percentage: { type: Number, required: true },
}, { _id: false });

const CenterSubjectWeakSchema = new mongoose.Schema({
  strongWeak: { type: [TopicStatSchema], default: [] },
  mediumWeak: { type: [TopicStatSchema], default: [] },
}, { _id: false });

const CenterWeakTopicsSchema = new mongoose.Schema({
  centerId:      { type: String, required: true },
  testId:        { type: String, required: true },
  totalStudents: { type: Number, required: true }, // DYNAMIC from actual data
  weakTopics: {
    Physics:     { type: CenterSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: CenterSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: CenterSubjectWeakSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },
  computedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Unique compound index per center+test
CenterWeakTopicsSchema.index({ centerId: 1, testId: 1 }, { unique: true });

export default mongoose.models.CenterWeakTopics || mongoose.model('CenterWeakTopics', CenterWeakTopicsSchema);
