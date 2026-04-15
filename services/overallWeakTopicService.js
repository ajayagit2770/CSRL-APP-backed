import { initMongo } from './mongoInit.js';
import StudentWeakTopics from '../models/StudentWeakTopics.js';
import CenterWeakTopics from '../models/CenterWeakTopics.js';
import TopicMap from '../models/TopicMap.js';
import StudentOverallWeakTopics from '../models/StudentOverallWeakTopics.js';
import CenterOverallWeakTopics from '../models/CenterOverallWeakTopics.js';

export async function computeStudentOverallWeakTopics(studentId) {
  await initMongo();

  // 1. Get all StudentWeakTopics for this student
  const allTestResults = await StudentWeakTopics.find({ studentId }).sort({ testId: 1 });
  if (allTestResults.length === 0) return;

  const testsIncluded = allTestResults.map(r => r.testId);
  const centerId = allTestResults[0].centerId;

  // 2. Build topicTracker
  const topicTracker = {};

  // 3. Loop through each test
  for (const testResult of allTestResults) {
    const testId = testResult.testId;

    // CRITICAL FIX — get topics from TopicMap for this test
    const topicMaps = await TopicMap.find({ testId });
    const testedTopicsInThisTest = new Set();
    const topicSubjectMap = {};

    for (const tm of topicMaps) {
      for (const t of tm.topics) {
        testedTopicsInThisTest.add(t.topic);
        topicSubjectMap[t.topic] = t.subject;
      }
    }

    // 4. For each topic tested in this test
    for (const topic of testedTopicsInThisTest) {
      if (!topicTracker[topic]) {
        topicTracker[topic] = {
          strongWeakCount: 0,
          mediumWeakCount: 0,
          testedCount: 0,
          subject: topicSubjectMap[topic]
        };
      }

      // increment testedCount — topic was examined in this test
      topicTracker[topic].testedCount++;

      // check if student was weak in this topic in this test
      const subj = topicSubjectMap[topic];
      const subjData = testResult.weakTopics?.[subj];

      if (subjData?.strongWeak?.includes(topic)) {
        topicTracker[topic].strongWeakCount++;
      } else if (subjData?.mediumWeak?.includes(topic)) {
        topicTracker[topic].mediumWeakCount++;
      }
    }
  }

  // 5. Classify each topic
  const grouped = {
    Physics:     { strongWeak: [], mediumWeak: [] },
    Chemistry:   { strongWeak: [], mediumWeak: [] },
    Mathematics: { strongWeak: [], mediumWeak: [] }
  };

  for (const [topic, data] of Object.entries(topicTracker)) {
    if (!data.subject) continue;
    if (data.testedCount === 0) continue;

    const strongWeakRatio = data.strongWeakCount / data.testedCount;
    const totalWeakRatio  = (data.strongWeakCount + data.mediumWeakCount) / data.testedCount;

    if (strongWeakRatio >= 0.50) {
      grouped[data.subject].strongWeak.push(topic);
    } else if (totalWeakRatio >= 0.50) {
      grouped[data.subject].mediumWeak.push(topic);
    }
  }

  // 6. Sort alphabetically within each category
  for (const subj of Object.values(grouped)) {
    subj.strongWeak.sort();
    subj.mediumWeak.sort();
  }

  // 7. Upsert into StudentOverallWeakTopics
  await StudentOverallWeakTopics.updateOne(
    { studentId },
    {
      $set: {
        studentId,
        centerId,
        testsIncluded,
        totalTests: testsIncluded.length,
        overallWeakTopics: grouped,
        computedAt: new Date()
      }
    },
    { upsert: true }
  );
}

export async function computeCenterOverallWeakTopics(centerId) {
  await initMongo();

  // 1. Get all CenterWeakTopics for this center
  const allTestResults = await CenterWeakTopics.find({ centerId }).sort({ testId: 1 });
  if (allTestResults.length === 0) return;

  const testsIncluded = allTestResults.map(r => r.testId);

  // 2. Build topicTracker
  const topicTracker = {};

  // 3. Loop through each test
  for (const testResult of allTestResults) {
    const testId = testResult.testId;

    // CRITICAL FIX — get topics from TopicMap for this test
    const topicMaps = await TopicMap.find({ testId });
    const testedTopicsInThisTest = new Set();
    const topicSubjectMap = {};

    for (const tm of topicMaps) {
      for (const t of tm.topics) {
        testedTopicsInThisTest.add(t.topic);
        topicSubjectMap[t.topic] = t.subject;
      }
    }

    // 4. For each topic tested in this test
    for (const topic of testedTopicsInThisTest) {
      if (!topicTracker[topic]) {
        topicTracker[topic] = {
          strongWeakCount: 0,
          mediumWeakCount: 0,
          testedCount: 0,
          subject: topicSubjectMap[topic],
          percentageSum: 0,
          percentageCount: 0
        };
      }

      topicTracker[topic].testedCount++;

      const subj = topicSubjectMap[topic];
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
  }

  // 5. Classify each topic
  const grouped = {
    Physics:     { strongWeak: [], mediumWeak: [] },
    Chemistry:   { strongWeak: [], mediumWeak: [] },
    Mathematics: { strongWeak: [], mediumWeak: [] }
  };

  for (const [topic, data] of Object.entries(topicTracker)) {
    if (!data.subject) continue;
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
      testedCount: data.testedCount
    };

    if (strongWeakRatio >= 0.50) {
      grouped[data.subject].strongWeak.push(entry);
    } else if (totalWeakRatio >= 0.50) {
      grouped[data.subject].mediumWeak.push(entry);
    }
  }

  // 6. Sort by avgWeakPercentage descending
  for (const subj of Object.values(grouped)) {
    subj.strongWeak.sort((a, b) => b.avgWeakPercentage - a.avgWeakPercentage);
    subj.mediumWeak.sort((a, b) => b.avgWeakPercentage - a.avgWeakPercentage);
  }

  // 7. Upsert into CenterOverallWeakTopics
  await CenterOverallWeakTopics.updateOne(
    { centerId },
    {
      $set: {
        centerId,
        testsIncluded,
        totalTests: testsIncluded.length,
        overallWeakTopics: grouped,
        computedAt: new Date()
      }
    },
    { upsert: true }
  );
}
