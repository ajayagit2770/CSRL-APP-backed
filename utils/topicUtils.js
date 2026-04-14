/**
 * utils/topicUtils.js
 * Helper functions for weak topic analysis logic.
 */

/**
 * isWeak — returns true if the student has NO positive mark (> 0) 
 * on ANY question belonging to this topic in this paper.
 *
 * @param {Object|Map} marks  - { Q1: 3, Q2: 0 } or Map
 * @param {string[]}   questions - e.g. ["Q7", "Q9"]
 * @returns {boolean}
 */
export function isWeak(marks, questions) {
  if (!questions || questions.length === 0) return false;

  for (const q of questions) {
    let val;
    if (marks instanceof Map) {
      val = marks.get(q);
    } else {
      val = marks[q];
    }
    // If any question has marks > 0, topic is NOT weak
    if (typeof val === 'number' && val > 0) return false;
    if (typeof val === 'string') {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n > 0) return false;
    }
  }
  // No positive mark found → topic IS weak
  return true;
}

/**
 * classifyTopics — classifies every topic from both paper maps as
 * "strong" or "medium" weak per the specified rules.
 *
 * @param {Object} m1          - marks object for paper1 (plain {Q1: 3, ...})
 * @param {Object} m2          - marks object for paper2 (plain {Q1: 0, ...})
 * @param {Object} p1TopicsMap - { "Kinematics": { questions: ["Q6"], subject: "Physics" }, ... }
 * @param {Object} p2TopicsMap - same structure for paper2
 * @returns {{ strong: string[], medium: string[] }}
 */
export function classifyTopics(m1, m2, p1TopicsMap, p2TopicsMap) {
  const strong = [];
  const medium = [];

  const p1Names = new Set(Object.keys(p1TopicsMap));
  const p2Names = new Set(Object.keys(p2TopicsMap));

  // Collect all unique topic names across both papers
  const allTopics = new Set([...p1Names, ...p2Names]);

  for (const topic of allTopics) {
    const inP1 = p1Names.has(topic);
    const inP2 = p2Names.has(topic);

    if (inP1 && inP2) {
      // BOTH papers have this topic
      const weakInP1 = isWeak(m1, p1TopicsMap[topic].questions);
      const weakInP2 = isWeak(m2, p2TopicsMap[topic].questions);

      if (weakInP1 && weakInP2) {
        strong.push(topic); // weak in both → STRONG WEAK
      } else if (weakInP1 || weakInP2) {
        medium.push(topic); // weak in only one → MEDIUM WEAK
      }
      // not weak in either → not listed
    } else if (inP1 && !inP2) {
      // ONLY in Paper1 — no redemption possible → STRONG WEAK if weak
      const weakInP1 = isWeak(m1, p1TopicsMap[topic].questions);
      if (weakInP1) strong.push(topic);
    } else if (!inP1 && inP2) {
      // ONLY in Paper2 — no redemption possible → STRONG WEAK if weak
      const weakInP2 = isWeak(m2, p2TopicsMap[topic].questions);
      if (weakInP2) strong.push(topic);
    }
  }

  return { strong, medium };
}
