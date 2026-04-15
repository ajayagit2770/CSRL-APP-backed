/**
 * services/weakTopicService.js
 * Core logic for computing student and center weak topics.
 */

import { initMongo } from './mongoInit.js';
import TopicMap from '../models/TopicMap.js';
import StudentRawMarks from '../models/StudentRawMarks.js';
import StudentWeakTopics from '../models/StudentWeakTopics.js';
import CenterWeakTopics from '../models/CenterWeakTopics.js';
import { classifyTopics } from '../utils/topicUtils.js';
import { computeStudentOverallWeakTopics, computeCenterOverallWeakTopics } from './overallWeakTopicService.js';

/**
 * checkAndTrigger — check if all required data is present,
 * and if so, trigger computation.
 *
 * @param {string} testId
 * @param {number} paperCount - 1 or 2
 */
export async function checkAndTrigger(testId, paperCount) {
  await initMongo();

  if (paperCount === 1) {
    const hasMap = await TopicMap.exists({ testId, paper: 'paper1' });
    const hasMarks = await StudentRawMarks.exists({ testId, paper: 'paper1' });
    if (hasMap && hasMarks) {
      console.log(`[WeakTopics] Triggering computation for ${testId} (1 paper)`);
      await computeWeakTopics(testId, 1);
    }
  } else {
    const [hasMap1, hasMap2, hasMarks1, hasMarks2] = await Promise.all([
      TopicMap.exists({ testId, paper: 'paper1' }),
      TopicMap.exists({ testId, paper: 'paper2' }),
      StudentRawMarks.exists({ testId, paper: 'paper1' }),
      StudentRawMarks.exists({ testId, paper: 'paper2' }),
    ]);
    if (hasMap1 && hasMap2 && hasMarks1 && hasMarks2) {
      console.log(`[WeakTopics] Triggering computation for ${testId} (2 papers)`);
      await computeWeakTopics(testId, 2);
    }
  }
}

/**
 * computeWeakTopics — main computation.
 *
 * @param {string} testId
 * @param {number} paperCount
 */
export async function computeWeakTopics(testId, paperCount) {
  await initMongo();

  // ── Step 1: Load topic maps ────────────────────────────────────────────────

  const topicMap1Doc = await TopicMap.findOne({ testId, paper: 'paper1' }).lean();
  const topicMap2Doc = paperCount === 2
    ? await TopicMap.findOne({ testId, paper: 'paper2' }).lean()
    : null;

  // Convert to lookup maps: { "Kinematics": { questions: [...], subject: "Physics" } }
  const p1TopicsMap = {};
  for (const entry of (topicMap1Doc?.topics || [])) {
    p1TopicsMap[entry.topic] = { questions: entry.questions, subject: entry.subject };
  }

  const p2TopicsMap = {};
  for (const entry of (topicMap2Doc?.topics || [])) {
    p2TopicsMap[entry.topic] = { questions: entry.questions, subject: entry.subject };
  }

  // Build unified topic-to-subject map (from both papers)
  const topicSubjectMap = {};
  for (const [topic, data] of Object.entries(p1TopicsMap)) {
    topicSubjectMap[topic] = data.subject;
  }
  for (const [topic, data] of Object.entries(p2TopicsMap)) {
    topicSubjectMap[topic] = data.subject;
  }

  // ── Step 2: Load all raw marks for this testId ────────────────────────────

  const allMarks = await StudentRawMarks.find({ testId }).lean();

  // Build maps: studentId → marks object per paper
  const p1MarksMap = {};
  const p2MarksMap = {};
  const studentCenterMap = {};

  for (const doc of allMarks) {
    // Convert Mongoose Map to plain object
    const marksObj = {};
    if (doc.marks instanceof Map) {
      for (const [k, v] of doc.marks) marksObj[k] = v;
    } else if (doc.marks && typeof doc.marks === 'object') {
      Object.assign(marksObj, doc.marks);
    }

    if (doc.paper === 'paper1') {
      p1MarksMap[doc.studentId] = marksObj;
    } else if (doc.paper === 'paper2') {
      p2MarksMap[doc.studentId] = marksObj;
    }

    // Track centerId (whichever paper we have)
    if (!studentCenterMap[doc.studentId]) {
      studentCenterMap[doc.studentId] = doc.centerId;
    }
  }

  // ── Step 3: Get all unique studentIds ─────────────────────────────────────

  const allStudentIds = new Set([
    ...Object.keys(p1MarksMap),
    ...Object.keys(p2MarksMap),
  ]);

  // ── Step 4: Classify topics for each student ──────────────────────────────

  const allStudentResults = [];
  const bulkOps = [];

  for (const studentId of allStudentIds) {
    const m1 = p1MarksMap[studentId] || {};
    const m2 = p2MarksMap[studentId] || {};
    const centerId = studentCenterMap[studentId] || '';

    const { strong, medium } = classifyTopics(m1, m2, p1TopicsMap, p2TopicsMap);

    // Group by subject
    const weakTopics = {
      Physics:     { strongWeak: [], mediumWeak: [] },
      Chemistry:   { strongWeak: [], mediumWeak: [] },
      Mathematics: { strongWeak: [], mediumWeak: [] },
    };

    for (const topic of strong) {
      const subject = topicSubjectMap[topic];
      if (subject && weakTopics[subject]) {
        weakTopics[subject].strongWeak.push(topic);
      }
    }
    for (const topic of medium) {
      const subject = topicSubjectMap[topic];
      if (subject && weakTopics[subject]) {
        weakTopics[subject].mediumWeak.push(topic);
      }
    }

    const result = { studentId, testId, centerId, weakTopics };
    allStudentResults.push(result);

    bulkOps.push({
      updateOne: {
        filter: { studentId, testId },
        update: {
          $set: {
            centerId,
            weakTopics,
            computedAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  // ── Step 5: Bulk upsert student weak topics ───────────────────────────────

  if (bulkOps.length > 0) {
    await StudentWeakTopics.bulkWrite(bulkOps, { ordered: false });
    console.log(`[WeakTopics] Upserted ${bulkOps.length} student weak topic docs for ${testId}`);
  }

  // ── Step 6: Compute center weak topics ────────────────────────────────────

  await computeCenterWeakTopics(testId, allStudentResults, topicSubjectMap);

  // ── Step 7: Recompute overall weak topics ─────────────────────────────────

  // Recompute overall weak topics for all affected students
  for (const studentId of allStudentIds) {
    await computeStudentOverallWeakTopics(studentId);
  }

  // Recompute overall weak topics for all affected centers
  const affectedCenters = [...new Set(
    allStudentResults.map(r => r.centerId).filter(Boolean)
  )];
  for (const centerId of affectedCenters) {
    await computeCenterOverallWeakTopics(centerId);
  }
}

/**
 * computeCenterWeakTopics — aggregate student results into center-level stats.
 *
 * @param {string} testId
 * @param {Array}  studentResults
 * @param {Object} topicSubjectMap - { "Kinematics": "Physics", ... }
 */
export async function computeCenterWeakTopics(testId, studentResults, topicSubjectMap) {
  await initMongo();

  // Group students by centerId
  const centerGroups = {};
  for (const result of studentResults) {
    const { centerId } = result;
    if (!centerId) continue;
    if (!centerGroups[centerId]) centerGroups[centerId] = [];
    centerGroups[centerId].push(result);
  }

  const centerBulkOps = [];

  for (const [centerId, students] of Object.entries(centerGroups)) {
    // totalStudents is DYNAMIC — just the count of actual students in this center for this test
    const totalStudents = students.length;

    // Count per topic (counting students who have topic as strong OR medium weak)
    const topicCount = {};

    for (const student of students) {
      const { weakTopics } = student;
      for (const subject of ['Physics', 'Chemistry', 'Mathematics']) {
        const subjectTopics = weakTopics?.[subject] || { strongWeak: [], mediumWeak: [] };
        for (const topic of [...(subjectTopics.strongWeak || []), ...(subjectTopics.mediumWeak || [])]) {
          topicCount[topic] = (topicCount[topic] || 0) + 1;
        }
      }
    }

    // Build center weakTopics structure
    const centerWeakTopics = {
      Physics:     { strongWeak: [], mediumWeak: [] },
      Chemistry:   { strongWeak: [], mediumWeak: [] },
      Mathematics: { strongWeak: [], mediumWeak: [] },
    };

    for (const [topic, count] of Object.entries(topicCount)) {
      const percentage = parseFloat(((count / totalStudents) * 100).toFixed(1));
      const subject = topicSubjectMap[topic];
      if (!subject || !centerWeakTopics[subject]) continue;

      const stat = { topic, count, percentage };

      if (percentage >= 50) {
        centerWeakTopics[subject].strongWeak.push(stat);
      } else if (percentage >= 30) {
        centerWeakTopics[subject].mediumWeak.push(stat);
      }
      // < 30% → do not include
    }

    // Sort each category by percentage descending
    for (const subject of ['Physics', 'Chemistry', 'Mathematics']) {
      centerWeakTopics[subject].strongWeak.sort((a, b) => b.percentage - a.percentage);
      centerWeakTopics[subject].mediumWeak.sort((a, b) => b.percentage - a.percentage);
    }

    centerBulkOps.push({
      updateOne: {
        filter: { centerId, testId },
        update: {
          $set: {
            totalStudents,
            weakTopics: centerWeakTopics,
            computedAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (centerBulkOps.length > 0) {
    await CenterWeakTopics.bulkWrite(centerBulkOps, { ordered: false });
    console.log(`[WeakTopics] Upserted ${centerBulkOps.length} center weak topic docs for ${testId}`);
  }
}
