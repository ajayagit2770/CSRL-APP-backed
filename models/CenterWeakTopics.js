import mongoose from 'mongoose';

// Per-topic stat at the center level
const TopicStatSchema = new mongoose.Schema({
  topic:      { type: String, required: true },
  count:      { type: Number, required: true },   // studentsWeakInTopic
  percentage: { type: Number, required: true },   // (count / totalStudentsTested) * 100
}, { _id: false });

// Per-subject stat at the center level (for weakSubjects)
const SubjectStatSchema = new mongoose.Schema({
  subject:    { type: String, required: true },
  count:      { type: Number, required: true },   // studentsWeakInSubject
  percentage: { type: Number, required: true },   // (count / totalStudentsTested) * 100
}, { _id: false });

const CenterSubjectWeakTopicSchema = new mongoose.Schema({
  strongWeak: { type: [TopicStatSchema], default: [] }, // >= 50% of students weak
  mediumWeak: { type: [TopicStatSchema], default: [] }, // > 39% and < 50% of students weak
}, { _id: false });

const CenterSubjectWeakSubjectSchema = new mongoose.Schema({
  strongWeak: { type: [SubjectStatSchema], default: [] }, // >= 50% of students weak in subject
  mediumWeak: { type: [SubjectStatSchema], default: [] }, // > 39% and < 50%
}, { _id: false });

const CenterWeakTopicsSchema = new mongoose.Schema({
  centerId:           { type: String, required: true },
  testId:             { type: String, required: true },
  // RENAMED from totalStudents → totalStudentsTested to be explicit:
  // only students who actually attempted this test (non-absent) are counted.
  totalStudentsTested: { type: Number, required: true },

  // Per-topic weak classification
  weakTopics: {
    Physics:     { type: CenterSubjectWeakTopicSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: CenterSubjectWeakTopicSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: CenterSubjectWeakTopicSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },

  // Per-subject weak classification (question-accuracy based)
  weakSubjects: {
    Physics:     { type: CenterSubjectWeakSubjectSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Chemistry:   { type: CenterSubjectWeakSubjectSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
    Mathematics: { type: CenterSubjectWeakSubjectSchema, default: () => ({ strongWeak: [], mediumWeak: [] }) },
  },

  computedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Unique compound index per center+test
CenterWeakTopicsSchema.index({ centerId: 1, testId: 1 }, { unique: true });

export default mongoose.models.CenterWeakTopics || mongoose.model('CenterWeakTopics', CenterWeakTopicsSchema);
