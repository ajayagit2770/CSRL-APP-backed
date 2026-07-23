/**
 * utils/topicUtils.js
 *
 * Single-paper weak-topic classification utilities.
 * The two-paper (paper1/paper2) "redemption" logic has been removed entirely.
 * All thresholds use integer fraction comparisons to avoid floating-point/rounding bugs.
 *
 * Threshold rules (edge case #2 — compare raw fractions, not rounded strings):
 *   notPositive / total >= 2/3  →  "weakest"  (strongWeak)
 *   notPositive / total >= 1/2  →  "weak"     (mediumWeak)
 *   notPositive / total <  1/2  →  "none"     (not flagged)
 *
 * Blank/null/undefined marks are EXCLUDED from both numerator and denominator (edge case #3).
 * A question with an explicit 0 counts as "not positive" (correct direction for numerator).
 * A question with a negative value also counts as "not positive".
 */

/**
 * getMark — extract a numeric mark from a marks object or Map.
 * Returns the numeric value, or null if the mark is blank/missing.
 *
 * @param {Object|Map} marks
 * @param {string}     question  e.g. "Q7"
 * @returns {number|null}
 */
export function getMark(marks, question) {
  let raw;
  if (marks instanceof Map) {
    raw = marks.get(question);
  } else {
    raw = marks[question];
  }

  // Treat blank/null/undefined as "excluded" (not the same as explicit 0)
  if (raw === null || raw === undefined || raw === '') return null;

  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return isNaN(n) ? null : n;
}

/**
 * classifyTopicForStudent
 *
 * For a single student on a single topic, computes what fraction of recorded questions
 * were not answered positively, then classifies the topic.
 *
 * @param {Object|Map} marks      - full marks object/map for the student on this test
 * @param {string[]}   questions  - questions belonging to this topic in this test
 * @returns {'weakest'|'weak'|'none'}
 */
export function classifyTopicForStudent(marks, questions) {
  if (!questions || questions.length === 0) return 'none';

  // Step 1: filter to only questions with a recorded (non-null) mark (edge case #3)
  const recorded = questions.filter(q => getMark(marks, q) !== null);
  const total = recorded.length;

  // Edge case #4: no recorded marks → exclude entirely (don't produce NaN)
  if (total === 0) return 'none';

  // Edge case #1: warn when topic has fewer than 3 questions (quantization issue)
  if (total < 3) {
    console.warn(
      `[WeakTopics] Topic has only ${total} recorded question(s) — ` +
      `the "Weak" band (50%–66%) may never trigger for this topic. ` +
      `Classification will be either "Weakest" or "not flagged".`
    );
  }

  // Step 2: count questions where mark is 0 or negative (not positive)
  const notPositive = recorded.filter(q => getMark(marks, q) <= 0).length;

  // Step 3: integer fraction comparisons — avoids floating-point bugs at the 2/3 boundary
  //   notPositive/total >= 2/3  ⟺  notPositive * 3 >= total * 2
  //   notPositive/total >= 1/2  ⟺  notPositive * 2 >= total
  if (notPositive * 3 >= total * 2) return 'weakest';
  if (notPositive * 2 >= total)     return 'weak';
  return 'none';
}

/**
 * classifySubjectForStudent
 *
 * Same logic as classifyTopicForStudent but applied over ALL questions belonging
 * to an entire subject in this test (not just one topic's questions).
 *
 * @param {Object|Map} marks            - full marks object/map for the student
 * @param {string[]}   subjectQuestions - all questions in the subject for this test
 * @returns {'weakest'|'weak'|'none'}
 */
export function classifySubjectForStudent(marks, subjectQuestions) {
  // Identical formula — just a different question set
  return classifyTopicForStudent(marks, subjectQuestions);
}

/**
 * isStudentAbsent
 *
 * Returns true if a student has zero recorded (non-null) marks for an entire test.
 * Absent students must be excluded from ALL averages and denominators (edge case #3 + #6).
 *
 * @param {Object|Map} marks       - student's marks object for this test
 * @param {string[]}   allQuestions - every question column in this test
 * @returns {boolean}
 */
export function isStudentAbsent(marks, allQuestions) {
  if (!allQuestions || allQuestions.length === 0) return true;
  return allQuestions.every(q => getMark(marks, q) === null);
}

/**
 * classifyCenterRatio
 *
 * Classify a center-level ratio (studentsWeak / totalStudentsTested) using the spec thresholds:
 *   ratio >= 0.50  → 'weakest'  (strongWeak)
 *   ratio >  0.39  → 'weak'     (mediumWeak)  ← exactly 0.39 is NOT flagged (spec: exclusive)
 *   ratio <= 0.39  → 'none'
 *
 * Uses integer math to avoid rounding:
 *   ratio >= 1/2  ⟺  weak * 2 >= total
 *   ratio >  39/100  ⟺  weak * 100 > total * 39
 *
 * @param {number} studentsWeak         - count of students flagged weak OR weakest
 * @param {number} totalStudentsTested  - count of non-absent students at this center for this test
 * @returns {'weakest'|'weak'|'none'}
 */
export function classifyCenterRatio(studentsWeak, totalStudentsTested) {
  // Edge case #4: guard divide-by-zero
  if (totalStudentsTested === 0) return 'none';

  // >= 50% → Weakest
  if (studentsWeak * 2 >= totalStudentsTested) return 'weakest';

  // > 39% (exclusive) → Weak
  if (studentsWeak * 100 > totalStudentsTested * 39) return 'weak';

  return 'none';
}
