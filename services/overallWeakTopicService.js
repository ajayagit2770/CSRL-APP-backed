/**
 * services/overallWeakTopicService.js
 *
 * Aggregates per-test weak-topic and weak-subject results into a multi-test "overall" rollup
 * for both students and centers.
 *
 * Single-paper architecture: no paper1/paper2 field reads anywhere in this file.
 *
 * Overall classification thresholds (same for topics and subjects):
 *   strongWeakRatio = (tests where topic/subject was "Weakest") / testedCount
 *   totalWeakRatio  = (tests where topic/subject was "Weakest" OR "Weak") / testedCount
 *
 *   strongWeakRatio >= 0.50  → overall strongWeak ("Weakest")
 *   totalWeakRatio  >= 0.50  → overall mediumWeak ("Weak")
 *   otherwise                → not flagged
 *
 * Edge case #6: a student absent for one test simply has no StudentWeakTopics record for
 * that test — the absent test is automatically excluded from testsIncluded and testedCount.
 */

import { initMongo } from './mongoInit.js';
import StudentWeakTopics from '../models/StudentWeakTopics.js';
import CenterWeakTopics from '../models/CenterWeakTopics.js';
import TopicMap from '../models/TopicMap.js';
import StudentOverallWeakTopics from '../models/StudentOverallWeakTopics.js';
import CenterOverallWeakTopics from '../models/CenterOverallWeakTopics.js';

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics'];

/** Build an empty grouped structure for topics or subjects */
function buildEmptyGrouped() {
  const out = {};
  for (const s of SUBJECTS) out[s] = { strongWeak: [], mediumWeak: [] };
  return out;
}

// ─── Student overall ──────────────────────────────────────────────────────────

/**
 * computeStudentOverallWeakTopics — recompute the multi-test rollup for one student.
 *
 * @param {string} studentId
 */
export async function computeStudentOverallWeakTopics(studentId) {
  await initMongo();

  // 1. Get all per-test results for this student (absent tests produce no record → auto-excluded)
  const allTestResults = await StudentWeakTopics.find({ studentId }).sort({ testId: 1 }).lean();
  if (allTestResults.length === 0) return;

  const testsIncluded = allTestResults.map(r => r.testId);
  const centerId = allTestResults[0].centerId;

  // 2. Build trackers: topic → { strongWeakCount, mediumWeakCount, testedCount, subject }
  const topicTracker   = {};
  // subject → { strongWeakCount, mediumWeakCount, testedCount }
  const subjectTracker = {};
  for (const s of SUBJECTS) subjectTracker[s] = { strongWeakCount: 0, mediumWeakCount: 0, testedCount: 0 };

  // 3. Loop through each test the student attempted
  for (const testResult of allTestResults) {
    const testId = testResult.testId;
    if (!testId || testId.length <= 1 || testId === 'CAT4') continue;

    // Load topic map for this test to know which topics were covered
    const topicMaps = await TopicMap.find({ testId }).lean();
    const testedTopicsInThisTest = new Set();
    const topicSubjectMap = {};

    for (const tm of topicMaps) {
      for (const t of (tm.topics || [])) {
        testedTopicsInThisTest.add(t.topic);
        topicSubjectMap[t.topic] = t.subject;
      }
    }

    // ── Topic-level tracking ───────────────────────────────────────────────
    for (const topic of testedTopicsInThisTest) {
      if (!topicTracker[topic]) {
        topicTracker[topic] = {
          strongWeakCount: 0,
          mediumWeakCount: 0,
          testedCount:     0,
          subject:         topicSubjectMap[topic],
        };
      }

      topicTracker[topic].testedCount++;

      const subj     = topicSubjectMap[topic];
      const subjData = testResult.weakTopics?.[subj];

      if (subjData?.strongWeak?.includes(topic)) {
        topicTracker[topic].strongWeakCount++;
      } else if (subjData?.mediumWeak?.includes(topic)) {
        topicTracker[topic].mediumWeakCount++;
      }
    }

    // ── Subject-level tracking ─────────────────────────────────────────────
    // Only count this test for a subject if topics from that subject were present
    const subjectsTestedThisTest = new Set(Object.values(topicSubjectMap).filter(Boolean));
    for (const subject of SUBJECTS) {
      if (!subjectsTestedThisTest.has(subject)) continue;

      subjectTracker[subject].testedCount++;

      const subjData = testResult.weakSubjects?.[subject];
      if (subjData?.strongWeak?.includes(subject)) {
        subjectTracker[subject].strongWeakCount++;
      } else if (subjData?.mediumWeak?.includes(subject)) {
        subjectTracker[subject].mediumWeakCount++;
      }
    }
  }

  // 4. Classify topics
  const groupedTopics = buildEmptyGrouped();

  for (const [topic, data] of Object.entries(topicTracker)) {
    if (!data.subject || !SUBJECTS.includes(data.subject)) continue;
    if (data.testedCount === 0) continue;

    const strongWeakRatio = data.strongWeakCount / data.testedCount;
    const totalWeakRatio  = (data.strongWeakCount + data.mediumWeakCount) / data.testedCount;

    if (strongWeakRatio >= 0.50) {
      groupedTopics[data.subject].strongWeak.push(topic);
    } else if (totalWeakRatio >= 0.50) {
      groupedTopics[data.subject].mediumWeak.push(topic);
    }
  }

  // Sort alphabetically
  for (const subj of SUBJECTS) {
    groupedTopics[subj].strongWeak.sort();
    groupedTopics[subj].mediumWeak.sort();
  }

  // 5. Classify subjects
  const groupedSubjects = buildEmptyGrouped();

  for (const subject of SUBJECTS) {
    const data = subjectTracker[subject];
    if (data.testedCount === 0) continue;

    const strongWeakRatio = data.strongWeakCount / data.testedCount;
    const totalWeakRatio  = (data.strongWeakCount + data.mediumWeakCount) / data.testedCount;

    if (strongWeakRatio >= 0.50) {
      groupedSubjects[subject].strongWeak.push(subject);
    } else if (totalWeakRatio >= 0.50) {
      groupedSubjects[subject].mediumWeak.push(subject);
    }
  }

  // 6. Upsert
  const finalTestsIncluded = testsIncluded.filter(t => t && t.length > 1 && t !== 'CAT4');
  await StudentOverallWeakTopics.updateOne(
    { studentId },
    {
      $set: {
        studentId,
        centerId,
        testsIncluded:       finalTestsIncluded,
        totalTests:          finalTestsIncluded.length,
        overallWeakTopics:   groupedTopics,
        overallWeakSubjects: groupedSubjects,
        computedAt:          new Date(),
      },
    },
    { upsert: true }
  );
}

// ─── Center overall ───────────────────────────────────────────────────────────

/**
 * computeCenterOverallWeakTopics — recompute the multi-test rollup for one center.
 *
 * @param {string} centerId
 */
export async function computeCenterOverallWeakTopics(centerId) {
  await initMongo();

  // 1. Get all per-test results for this center
  const allTestResults = await CenterWeakTopics.find({ centerId }).sort({ testId: 1 }).lean();
  if (allTestResults.length === 0) return;

  const testsIncluded = allTestResults.map(r => r.testId);

  // 2. Topic tracker
  const topicTracker = {};
  // subject tracker: subject → { strongWeakCount, mediumWeakCount, testedCount, percentageSum, percentageCount }
  const subjectTracker = {};
  for (const s of SUBJECTS) {
    subjectTracker[s] = { strongWeakCount: 0, mediumWeakCount: 0, testedCount: 0, percentageSum: 0, percentageCount: 0 };
  }

  // 3. Loop through each test
  for (const testResult of allTestResults) {
    const testId = testResult.testId;
    if (!testId || testId.length <= 1 || testId === 'CAT4') continue;

    // Load topic map for this test
    const topicMaps = await TopicMap.find({ testId }).lean();
    const testedTopicsInThisTest = new Set();
    const topicSubjectMap = {};

    for (const tm of topicMaps) {
      for (const t of (tm.topics || [])) {
        testedTopicsInThisTest.add(t.topic);
        topicSubjectMap[t.topic] = t.subject;
      }
    }

    // ── Topic-level tracking ───────────────────────────────────────────────
    for (const topic of testedTopicsInThisTest) {
      if (!topicTracker[topic]) {
        topicTracker[topic] = {
          strongWeakCount:  0,
          mediumWeakCount:  0,
          testedCount:      0,
          subject:          topicSubjectMap[topic],
          percentageSum:    0,
          percentageCount:  0,
        };
      }

      topicTracker[topic].testedCount++;

      const subj     = topicSubjectMap[topic];
      const subjData = testResult.weakTopics?.[subj];

      const inStrong = subjData?.strongWeak?.find(e => e.topic === topic);
      const inMedium = subjData?.mediumWeak?.find(e => e.topic === topic);

      if (inStrong) {
        topicTracker[topic].strongWeakCount++;
        topicTracker[topic].percentageSum += inStrong.percentage;
        topicTracker[topic].percentageCount++;
      } else if (inMedium) {
        topicTracker[topic].mediumWeakCount++;
        topicTracker[topic].percentageSum += inMedium.percentage;
        topicTracker[topic].percentageCount++;
      }
    }

    // ── Subject-level tracking ─────────────────────────────────────────────
    const subjectsTestedThisTest = new Set(Object.values(topicSubjectMap).filter(Boolean));
    for (const subject of SUBJECTS) {
      if (!subjectsTestedThisTest.has(subject)) continue;

      subjectTracker[subject].testedCount++;

      const subData = testResult.weakSubjects?.[subject];

      // weakSubjects entries are { subject, count, percentage }
      const inStrong = subData?.strongWeak?.find(e => e.subject === subject);
      const inMedium = subData?.mediumWeak?.find(e => e.subject === subject);

      if (inStrong) {
        subjectTracker[subject].strongWeakCount++;
        subjectTracker[subject].percentageSum += inStrong.percentage;
        subjectTracker[subject].percentageCount++;
      } else if (inMedium) {
        subjectTracker[subject].mediumWeakCount++;
        subjectTracker[subject].percentageSum += inMedium.percentage;
        subjectTracker[subject].percentageCount++;
      }
    }
  }

  // 4. Classify topics
  const groupedTopics = buildEmptyGrouped();

  for (const [topic, data] of Object.entries(topicTracker)) {
    if (!data.subject || !SUBJECTS.includes(data.subject)) continue;
    if (data.testedCount === 0) continue;

    const strongWeakRatio = data.strongWeakCount / data.testedCount;
    const totalWeakRatio  = (data.strongWeakCount + data.mediumWeakCount) / data.testedCount;
    const avgWeakPercentage = data.percentageCount > 0
      ? +(data.percentageSum / data.percentageCount).toFixed(1)
      : 0;

    const entry = {
      topic,
      avgWeakPercentage,
      strongWeakCount: data.strongWeakCount,
      mediumWeakCount: data.mediumWeakCount,
      testedCount:     data.testedCount,
    };

    if (strongWeakRatio >= 0.50) {
      groupedTopics[data.subject].strongWeak.push(entry);
    } else if (totalWeakRatio >= 0.50) {
      groupedTopics[data.subject].mediumWeak.push(entry);
    }
  }

  // Sort by avgWeakPercentage descending
  for (const subj of SUBJECTS) {
    groupedTopics[subj].strongWeak.sort((a, b) => b.avgWeakPercentage - a.avgWeakPercentage);
    groupedTopics[subj].mediumWeak.sort((a, b) => b.avgWeakPercentage - a.avgWeakPercentage);
  }

  // 5. Classify subjects
  const groupedSubjects = buildEmptyGrouped();

  for (const subject of SUBJECTS) {
    const data = subjectTracker[subject];
    if (data.testedCount === 0) continue;

    const strongWeakRatio = data.strongWeakCount / data.testedCount;
    const totalWeakRatio  = (data.strongWeakCount + data.mediumWeakCount) / data.testedCount;
    const avgWeakPercentage = data.percentageCount > 0
      ? +(data.percentageSum / data.percentageCount).toFixed(1)
      : 0;

    const entry = {
      subject,
      avgWeakPercentage,
      strongWeakCount: data.strongWeakCount,
      mediumWeakCount: data.mediumWeakCount,
      testedCount:     data.testedCount,
    };

    if (strongWeakRatio >= 0.50) {
      groupedSubjects[subject].strongWeak.push(entry);
    } else if (totalWeakRatio >= 0.50) {
      groupedSubjects[subject].mediumWeak.push(entry);
    }
  }

  // 6. Upsert
  const finalTestsIncluded = testsIncluded.filter(t => t && t.length > 1 && t !== 'CAT4');
  await CenterOverallWeakTopics.updateOne(
    { centerId },
    {
      $set: {
        centerId,
        testsIncluded:       finalTestsIncluded,
        totalTests:          finalTestsIncluded.length,
        overallWeakTopics:   groupedTopics,
        overallWeakSubjects: groupedSubjects,
        computedAt:          new Date(),
      },
    },
    { upsert: true }
  );
}
