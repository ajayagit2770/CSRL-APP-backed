/**
 * services/weakTopicService.js
 *
 * Core logic for computing student and center weak topics + weak subjects.
 * Single-paper architecture: each test has exactly one mark-set per student.
 * All paper1/paper2 branching has been removed.
 *
 * Classification thresholds:
 *   Student-level (per topic or per subject):
 *     notPositive/total >= 2/3  → strongWeak ("Weakest")
 *     notPositive/total >= 1/2  → mediumWeak ("Weak")
 *     notPositive/total <  1/2  → not flagged
 *
 *   Center-level (per topic or per subject):
 *     studentsWeak/totalStudentsTested >= 0.50  → strongWeak ("Weakest")
 *     studentsWeak/totalStudentsTested >  0.39  → mediumWeak ("Weak")  [39% exclusive]
 *     studentsWeak/totalStudentsTested <= 0.39  → not flagged
 *
 * Edge cases handled:
 *   #1 — Small question count: warned in topicUtils, also surfaced in diagnostics
 *   #2 — Fraction comparison: integer math in topicUtils (no floats at boundary)
 *   #3 — Blank ≠ 0: null marks excluded from denominator; fully-absent students excluded entirely
 *   #4 — Divide-by-zero: guarded via classifyTopicForStudent / classifyCenterRatio
 *   #5 — Center rollup counts BOTH weak+weakest for studentsWeakInTopic
 *   #6 — Absent per test: excluded from that test; other tests unaffected
 */

import { initMongo } from './mongoInit.js';
import TopicMap from '../models/TopicMap.js';
import StudentRawMarks from '../models/StudentRawMarks.js';
import StudentWeakTopics from '../models/StudentWeakTopics.js';
import CenterWeakTopics from '../models/CenterWeakTopics.js';
import {
  classifyTopicForStudent,
  classifySubjectForStudent,
  isStudentAbsent,
  classifyCenterRatio,
  getMark,
} from '../utils/topicUtils.js';
import {
  computeStudentOverallWeakTopics,
  computeCenterOverallWeakTopics,
} from './overallWeakTopicService.js';

// ─── Known subjects ────────────────────────────────────────────────────────────
const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * marksToPlainObject — convert a Mongoose Map or plain object to { Q1: val, … }
 */
function marksToPlainObject(marksField) {
  const out = {};
  if (marksField instanceof Map) {
    for (const [k, v] of marksField) out[k] = v;
  } else if (marksField && typeof marksField === 'object') {
    Object.assign(out, marksField);
  }
  return out;
}

/**
 * buildEmptyWeakGrouped — create an empty weakTopics/weakSubjects structure
 */
function buildEmptyGrouped() {
  const out = {};
  for (const s of SUBJECTS) out[s] = { strongWeak: [], mediumWeak: [] };
  return out;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * computeWeakTopics — full pipeline for a single test.
 *
 * 1. Load TopicMap (single doc, no paper field)
 * 2. Load StudentRawMarks (no paper filter)
 * 3. For each student: classify topics + subjects; skip fully-absent students
 * 4. Bulk-upsert StudentWeakTopics
 * 5. Compute center-level weak topics + subjects
 * 6. Trigger overall (multi-test) rollup for affected students + centers
 *
 * @param {string} testId
 * @returns {Promise<{
 *   studentsProcessed: number,
 *   studentsAbsent: number,
 *   topicsFound: number,
 *   smallQuestionTopics: string[],
 *   centersProcessed: number
 * }>}
 */
export async function computeWeakTopics(testId) {
  await initMongo();

  // ── Step 1: Load topic map ───────────────────────────────────────────────────
  const topicMapDoc = await TopicMap.findOne({ testId }).lean();
  if (!topicMapDoc || !topicMapDoc.topics || topicMapDoc.topics.length === 0) {
    console.warn(`[WeakTopics] No TopicMap found for testId="${testId}". Aborting computation.`);
    return { studentsProcessed: 0, studentsAbsent: 0, topicsFound: 0, smallQuestionTopics: [], centersProcessed: 0 };
  }

  // Build lookup maps from the TopicMap doc
  const topicSubjectMap = {};  // { "Kinematics": "Physics", … }
  const topicQuestionsMap = {}; // { "Kinematics": ["Q1","Q14"], … }
  const subjectQuestionsMap = {}; // { "Physics": ["Q1","Q2",…], … }
  const questionSubjectMap = {}; // { "Q1": "Physics", … }
  const allTestQuestions = new Set();
  const smallQuestionTopics = [];

  for (const entry of topicMapDoc.topics) {
    topicSubjectMap[entry.topic]   = entry.subject;
    topicQuestionsMap[entry.topic] = entry.questions;
    for (const q of entry.questions) allTestQuestions.add(q);

    // Track small-question topics for diagnostic output
    if (entry.questions.length < 3) smallQuestionTopics.push(entry.topic);

    // Build subject→questions map
    if (!subjectQuestionsMap[entry.subject]) subjectQuestionsMap[entry.subject] = [];
    for (const q of entry.questions) {
      if (!subjectQuestionsMap[entry.subject].includes(q)) {
        subjectQuestionsMap[entry.subject].push(q);
      }
      questionSubjectMap[q] = entry.subject;
    }
  }

  const allQuestionsList = Array.from(allTestQuestions);

  // ── Step 2: Load raw marks ────────────────────────────────────────────────────
  const allMarksDocs = await StudentRawMarks.find({ testId }).lean();

  // ── Step 3: Classify per student ──────────────────────────────────────────────
  const allStudentResults = [];
  const bulkOps = [];
  let studentsAbsent = 0;

  for (const doc of allMarksDocs) {
    const marks = marksToPlainObject(doc.marks);

    // Edge case #3/#6: fully-absent students are excluded entirely
    if (isStudentAbsent(marks, allQuestionsList)) {
      studentsAbsent++;
      continue;
    }

    // ── Overall Performance Metrics ─────────────────────────────────────────
    let attempted = 0;
    let correct = 0;
    let wrong = 0;

    const subjectMetrics = {
      Physics:     { attempted: 0, correct: 0, wrong: 0 },
      Chemistry:   { attempted: 0, correct: 0, wrong: 0 },
      Mathematics: { attempted: 0, correct: 0, wrong: 0 },
    };

    for (const q of allQuestionsList) {
      const mark = getMark(marks, q);
      if (mark !== null) {
        const subj = questionSubjectMap[q];
        
        if (mark !== 0) {
          attempted++;
          if (subj && subjectMetrics[subj]) {
            subjectMetrics[subj].attempted++;
          }
        }

        if (mark > 0) {
          correct++;
          if (subj && subjectMetrics[subj]) subjectMetrics[subj].correct++;
        } else {
          wrong++;
          if (subj && subjectMetrics[subj]) subjectMetrics[subj].wrong++;
        }
      }
    }

    // ── Topic-level classification ──────────────────────────────────────────
    const weakTopics = buildEmptyGrouped();

    for (const [topic, questions] of Object.entries(topicQuestionsMap)) {
      const subject = topicSubjectMap[topic];
      if (!subject || !SUBJECTS.includes(subject)) continue;

      const classification = classifyTopicForStudent(marks, questions);
      if (classification === 'weakest') {
        weakTopics[subject].strongWeak.push(topic);
      } else if (classification === 'weak') {
        weakTopics[subject].mediumWeak.push(topic);
      }
    }

    // ── Subject-level classification ────────────────────────────────────────
    const weakSubjects = buildEmptyGrouped();

    for (const subject of SUBJECTS) {
      const subjectQs = subjectQuestionsMap[subject];
      if (!subjectQs || subjectQs.length === 0) continue;

      const classification = classifySubjectForStudent(marks, subjectQs);
      if (classification === 'weakest') {
        weakSubjects[subject].strongWeak.push(subject);
      } else if (classification === 'weak') {
        weakSubjects[subject].mediumWeak.push(subject);
      }
    }

    const result = {
      studentId: doc.studentId,
      testId,
      centerId:  doc.centerId,
      attempted,
      correct,
      wrong,
      subjectMetrics,
      weakTopics,
      weakSubjects,
    };
    allStudentResults.push(result);

    // Prepare upsert operation
    bulkOps.push({
      updateOne: {
        filter: { studentId: doc.studentId, testId },
        update: {
          $set: {
            centerId:     doc.centerId,
            attempted,
            correct,
            wrong,
            subjectMetrics,
            weakTopics,
            weakSubjects,
            computedAt:   new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  // ── Step 4: Bulk-upsert student weak topics ───────────────────────────────────
  if (bulkOps.length > 0) {
    await StudentWeakTopics.bulkWrite(bulkOps, { ordered: false });
    console.log(`[WeakTopics] Upserted ${bulkOps.length} student weak-topic docs for testId="${testId}"`);
  }

  // ── Step 5: Center-level aggregation ─────────────────────────────────────────
  const centersProcessed = await computeCenterWeakTopics(
    testId,
    allStudentResults,
    topicSubjectMap,
    topicQuestionsMap,
  );

  // ── Step 6: Overall rollup ────────────────────────────────────────────────────
  const allStudentIds = new Set(allStudentResults.map(r => r.studentId));
  const allCenterIds  = new Set(allStudentResults.map(r => r.centerId).filter(Boolean));

  const studentIdsArray = Array.from(allStudentIds);
  for (let i = 0; i < studentIdsArray.length; i += 25) {
    const chunk = studentIdsArray.slice(i, i + 25);
    await Promise.all(chunk.map(id => computeStudentOverallWeakTopics(id)));
  }

  const centerIdsArray = Array.from(allCenterIds);
  await Promise.all(centerIdsArray.map(id => computeCenterOverallWeakTopics(id)));

  return {
    studentsProcessed:  allStudentResults.length,
    studentsAbsent,
    topicsFound:        Object.keys(topicQuestionsMap).length,
    smallQuestionTopics,
    centersProcessed,
  };
}

// ─── Center-level aggregation ─────────────────────────────────────────────────

/**
 * computeCenterWeakTopics — aggregate student results into center-level stats.
 *
 * Edge case #5: a student counts toward studentsWeakInTopic if they are EITHER
 *   "weak" OR "weakest" at the student level (weakPercent >= 50%).
 * Edge case #4: centers with 0 tested students are skipped.
 *
 * @param {string} testId
 * @param {Array}  studentResults  - from computeWeakTopics (non-absent only)
 * @param {Object} topicSubjectMap - { "Kinematics": "Physics", … }
 * @param {Object} topicQuestionsMap - { "Kinematics": ["Q1","Q14"], … }
 * @returns {Promise<number>} number of centers processed
 */
export async function computeCenterWeakTopics(testId, studentResults, topicSubjectMap, topicQuestionsMap) {
  await initMongo();

  // Group non-absent students by centerId
  const centerGroups = {};
  for (const result of studentResults) {
    const { centerId } = result;
    if (!centerId) continue;
    if (!centerGroups[centerId]) centerGroups[centerId] = [];
    centerGroups[centerId].push(result);
  }

  const centerBulkOps = [];

  for (const [centerId, students] of Object.entries(centerGroups)) {
    // totalStudentsTested = non-absent students for this center + test (edge case #6)
    const totalStudentsTested = students.length;

    // Edge case #4: skip centers with zero tested students
    if (totalStudentsTested === 0) {
      console.warn(`[WeakTopics] Center "${centerId}" has 0 tested students for testId="${testId}". Skipping.`);
      continue;
    }

    // ── Topic-level rollup ──────────────────────────────────────────────────
    const centerWeakTopics = buildEmptyGrouped();

    for (const [topic, subject] of Object.entries(topicSubjectMap)) {
      if (!subject || !SUBJECTS.includes(subject)) continue;

      // Count students flagged Weak OR Weakest for this topic (edge case #5)
      let studentsWeakInTopic = 0;
      for (const student of students) {
        const subData = student.weakTopics?.[subject];
        if (
          subData?.strongWeak?.includes(topic) ||
          subData?.mediumWeak?.includes(topic)
        ) {
          studentsWeakInTopic++;
        }
      }

      const classification = classifyCenterRatio(studentsWeakInTopic, totalStudentsTested);
      const percentage = parseFloat(((studentsWeakInTopic / totalStudentsTested) * 100).toFixed(1));
      const stat = { topic, count: studentsWeakInTopic, percentage };

      if (classification === 'weakest') {
        centerWeakTopics[subject].strongWeak.push(stat);
      } else if (classification === 'weak') {
        centerWeakTopics[subject].mediumWeak.push(stat);
      }
    }

    // Sort by percentage descending within each band
    for (const subject of SUBJECTS) {
      centerWeakTopics[subject].strongWeak.sort((a, b) => b.percentage - a.percentage);
      centerWeakTopics[subject].mediumWeak.sort((a, b) => b.percentage - a.percentage);
    }

    // ── Subject-level rollup ────────────────────────────────────────────────
    const centerWeakSubjects = buildEmptyGrouped();

    for (const subject of SUBJECTS) {
      // Count students flagged Weak OR Weakest at subject level (edge case #5)
      let studentsWeakInSubject = 0;
      for (const student of students) {
        const subData = student.weakSubjects?.[subject];
        if (
          subData?.strongWeak?.includes(subject) ||
          subData?.mediumWeak?.includes(subject)
        ) {
          studentsWeakInSubject++;
        }
      }

      if (studentsWeakInSubject === 0) continue;

      const classification = classifyCenterRatio(studentsWeakInSubject, totalStudentsTested);
      const percentage = parseFloat(((studentsWeakInSubject / totalStudentsTested) * 100).toFixed(1));
      const stat = { subject, count: studentsWeakInSubject, percentage };

      if (classification === 'weakest') {
        centerWeakSubjects[subject].strongWeak.push(stat);
      } else if (classification === 'weak') {
        centerWeakSubjects[subject].mediumWeak.push(stat);
      }
    }

    centerBulkOps.push({
      updateOne: {
        filter: { centerId, testId },
        update: {
          $set: {
            totalStudentsTested,
            weakTopics:    centerWeakTopics,
            weakSubjects:  centerWeakSubjects,
            computedAt:    new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (centerBulkOps.length > 0) {
    await CenterWeakTopics.bulkWrite(centerBulkOps, { ordered: false });
    console.log(`[WeakTopics] Upserted ${centerBulkOps.length} center weak-topic docs for testId="${testId}"`);
  }

  return centerBulkOps.length;
}
