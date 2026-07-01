/**
 * services/csvParserService.js
 *
 * Single-function parser for the new unified test sheet format.
 * One file per test replaces the old two-step (topic-map CSV + marks CSV) upload.
 *
 * Expected sheet structure (CSV or Excel exported as CSV):
 *   Row 1 (index 0): Headers     — LOCATION | ROLL NO. | NAME | Q1 | Q2 | ... | Qn
 *   Row 2 (index 1): Topics      — (blank)   | (blank)  | (blank) | Kinematics | Laws of Motion | ...
 *   Row 3 (index 2): Answer key  — (blank)   | (blank)  | (blank) | A | B | ... (stored, not used in calc)
 *   Row 4+ (index 3+): Students  — one student per row
 *
 * Blank mark cells → stored as null (excluded from weak-topic denominator).
 * This is distinct from explicit 0 (attempted, no positive mark) or negative (wrong + penalty).
 */

import { parse } from 'csv-parse/sync';

// Known subjects — any topic that does NOT map to one of these causes a validation error.
export const KNOWN_SUBJECTS = new Set(['Physics', 'Chemistry', 'Mathematics']);

// ─── Internal subject-inference map ──────────────────────────────────────────
// Allows the upload sheet to carry only a topic name per question, while the
// backend infers the subject. Extend this map or use SyllabusTopics from DB.
// If a topic is not in this map, we return null (unknown subject → validation error).
const TOPIC_SUBJECT_MAP = {};

/**
 * buildTopicSubjectLookup — merge topic→subject entries from the DB (SyllabusTopics)
 * and from the sheet's own topic row into a fast lookup map.
 * Call this BEFORE parseTestSheet if you want DB-seeded subject inference.
 *
 * @param {Array<{subject: string, topics: string[]}>} syllabusEntries
 */
export function buildTopicSubjectLookup(syllabusEntries) {
  for (const entry of syllabusEntries) {
    if (!KNOWN_SUBJECTS.has(entry.subject)) continue;
    for (const topic of (entry.topics || [])) {
      TOPIC_SUBJECT_MAP[topic.trim()] = entry.subject;
    }
  }
}

/**
 * inferSubject — look up subject for a topic name.
 * Returns the subject string or null if unknown.
 *
 * The sheet may optionally encode subject inline as "Physics: Kinematics".
 * We handle that prefix format too.
 *
 * @param {string} rawTopic
 * @returns {{ subject: string|null, topic: string }}
 */
function inferSubject(rawTopic) {
  const trimmed = (rawTopic || '').trim();

  // Format: "Physics: Kinematics" or "Chemistry:Thermodynamics"
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx !== -1) {
    const prefix = trimmed.slice(0, colonIdx).trim();
    const topic  = trimmed.slice(colonIdx + 1).trim();
    if (KNOWN_SUBJECTS.has(prefix)) {
      // Also register in our runtime lookup so cross-question consistency works
      TOPIC_SUBJECT_MAP[topic] = prefix;
      return { subject: prefix, topic };
    }
  }

  // Plain topic name → look up in runtime map
  if (TOPIC_SUBJECT_MAP[trimmed]) {
    return { subject: TOPIC_SUBJECT_MAP[trimmed], topic: trimmed };
  }

  return { subject: null, topic: trimmed };
}

/**
 * parseMark — convert a cell value to a number or null.
 *
 * Edge case #3 contract:
 *   blank/empty/undefined → null  (excluded from both numerator and denominator)
 *   explicit "0"          → 0     (attempted, no positive mark — counted in denominator)
 *   negative number       → neg   (wrong + penalty — counted in denominator)
 *
 * @param {string|number|undefined} cell
 * @returns {number|null}
 */
function parseMark(cell) {
  if (cell === null || cell === undefined || String(cell).trim() === '') return null;
  const n = parseFloat(String(cell).trim());
  return isNaN(n) ? null : n;
}

/**
 * normalizeColumnHeader — map various column-name spellings to canonical keys.
 *
 * @param {string} col
 * @returns {string}
 */
function normalizeColumnHeader(col) {
  const c   = (col || '').trim();
  const low = c.toLowerCase();
  if (low === 'location' || low === 'centre' || low === 'center' || low === 'centrecode' || low === 'centercode') return '__location__';
  if (low === 'roll no.' || low === 'roll no' || low === 'roll_no' || low === 'rollno' || low === 'roll_key' || low === 'roll') return '__roll__';
  if (low === 'name' || low === "student's name" || low === 'student name' || low === 'studentname') return '__name__';
  if (/^q\d+$/i.test(c)) return c.toUpperCase(); // Q1, Q2, …
  return c; // keep as-is for any other column
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * parseTestSheet — parse a unified test sheet buffer (CSV).
 *
 * @param {Buffer} buffer  - file buffer from multer
 * @returns {{
 *   questionCols:          string[],           // ['Q1','Q2',…]
 *   questionTopicMap:      Record<string,string>, // { Q1: 'Kinematics', … }
 *   questionSubjectMap:    Record<string,string>, // { Q1: 'Physics', … }
 *   questionAnswerMap:     Record<string,string>, // { Q1: 'A', … }  (stored, unused in calc)
 *   topicsWithQuestions:   Record<string,{ questions:string[], subject:string }>,
 *   smallQuestionTopics:   string[],           // topics with < 3 questions (diagnostic)
 *   unknownSubjectQuestions: string[],         // Q-cols whose topic has no known subject
 *   students: Array<{ studentId:string, name:string, centerId:string, marks:Record<string,number|null> }>
 * }}
 * @throws {Error} with a structured `.validationErrors` array if the sheet is malformed
 */
export function parseTestSheet(buffer) {
  // ── 1. Raw parse (all rows as arrays, no column-name inference yet) ─────────
  const allRows = parse(buffer, {
    skip_empty_lines: false, // we need exact row indices
    trim: true,
    relax_column_count: true,
  });

  const validationErrors = [];

  if (allRows.length < 4) {
    const err = new Error('Test sheet must have at least 4 rows: headers, topics, answer key, and at least one student row.');
    err.validationErrors = [err.message];
    throw err;
  }

  // ── 2. Parse Row 1 (index 0): headers ─────────────────────────────────────
  const headerRow = allRows[0].map(normalizeColumnHeader);

  const locationIdx = headerRow.indexOf('__location__');
  const rollIdx     = headerRow.indexOf('__roll__');
  const nameIdx     = headerRow.indexOf('__name__');

  if (locationIdx === -1) validationErrors.push('Missing required column: LOCATION (or CENTRE / CENTER / CENTRECODE)');
  if (rollIdx     === -1) validationErrors.push('Missing required column: ROLL NO. (or ROLL_KEY / ROLL_NO)');
  if (nameIdx     === -1) validationErrors.push('Missing required column: NAME (or STUDENT\'S NAME)');

  // Identify question columns by position (Q1, Q2, …)
  const qColIndices = [];
  const questionCols = [];
  for (let i = 0; i < headerRow.length; i++) {
    if (/^Q\d+$/i.test(headerRow[i])) {
      qColIndices.push(i);
      questionCols.push(headerRow[i].toUpperCase());
    }
  }

  if (questionCols.length === 0) {
    validationErrors.push('No question columns found (expected Q1, Q2, … Qn in header row).');
  }

  if (validationErrors.length > 0) {
    const err = new Error('Test sheet validation failed.');
    err.validationErrors = validationErrors;
    throw err;
  }

  // ── 2b. Dynamically find Topic and Answer Key rows ────────────────────────
  let topicRowIdx = 1;
  let answerKeyRowIdx = 2;
  
  for (let r = 1; r < Math.min(allRows.length, 10); r++) {
    const rowPrefixes = allRows[r].slice(0, 3).map(c => String(c).trim().toUpperCase());
    if (rowPrefixes.includes('TOPIC') || rowPrefixes.includes('TOPICS')) {
      topicRowIdx = r;
    } else if (rowPrefixes.includes('ANSWER KEY') || rowPrefixes.includes('ANSWER_KEY') || rowPrefixes.includes('ANSWERS')) {
      answerKeyRowIdx = r;
    }
  }

  // ── 3. Parse Topics ───────────────────────────────────────────────────────
  const topicRow = allRows[topicRowIdx] || [];

  const questionTopicMap  = {};
  const questionSubjectMap = {};
  const unknownSubjectQuestions = [];

  for (let i = 0; i < qColIndices.length; i++) {
    const colIdx  = qColIndices[i];
    const qName   = questionCols[i];
    const rawTopic = (topicRow[colIdx] || '').trim();

    if (!rawTopic) {
      validationErrors.push(`Question ${qName}: topic is blank in row 2 (topic row). Every question must have a topic assigned.`);
      continue;
    }

    const { subject, topic } = inferSubject(rawTopic);

    questionTopicMap[qName] = topic;

    if (!subject || !KNOWN_SUBJECTS.has(subject)) {
      unknownSubjectQuestions.push(qName);
      validationErrors.push(
        `Question ${qName}: topic "${topic}" does not map to a known subject (Physics / Chemistry / Mathematics). ` +
        `Either prefix the topic as "Physics: ${topic}" in the topic row, or add it to the syllabus.`
      );
    } else {
      questionSubjectMap[qName] = subject;
    }
  }

  // Surface ALL validation errors at once (don't stop at first one)
  if (validationErrors.length > 0) {
    const err = new Error('Test sheet validation failed — see validationErrors for details.');
    err.validationErrors = validationErrors;
    throw err;
  }

  // ── 4. Parse Answer key (stored, not used in calc) ────────
  const answerRow = allRows[answerKeyRowIdx] || [];
  const questionAnswerMap = {};
  for (let i = 0; i < qColIndices.length; i++) {
    questionAnswerMap[questionCols[i]] = (answerRow[qColIndices[i]] || '').trim();
  }

  // ── 5. Build topicsWithQuestions ──────────────────────────────────────────
  const topicsWithQuestions = {};
  for (const [qName, topic] of Object.entries(questionTopicMap)) {
    const subject = questionSubjectMap[qName];
    if (!subject) continue; // already flagged above
    if (!topicsWithQuestions[topic]) {
      topicsWithQuestions[topic] = { questions: [], subject };
    }
    topicsWithQuestions[topic].questions.push(qName);
  }

  // Identify topics with fewer than 3 questions (edge case #1 — diagnostic only)
  const smallQuestionTopics = Object.entries(topicsWithQuestions)
    .filter(([, { questions }]) => questions.length < 3)
    .map(([topic]) => topic);

  if (smallQuestionTopics.length > 0) {
    console.warn(
      `[WeakTopics] The following topics have fewer than 3 questions — ` +
      `their "Weak" (middle) band may never trigger due to quantization: ` +
      smallQuestionTopics.join(', ')
    );
  }

  // ── 6. Parse student rows (starts after answer key) ──────────────────────
  const students = [];
  const startRowIdx = Math.max(answerKeyRowIdx + 1, topicRowIdx + 1, 3); // ensure we don't parse headers

  for (let rowIdx = startRowIdx; rowIdx < allRows.length; rowIdx++) {
    const row = allRows[rowIdx];

    // Skip fully blank rows
    if (!row || row.every(cell => !cell || String(cell).trim() === '')) continue;

    const studentId = String(row[rollIdx]     || '').trim();
    const name      = String(row[nameIdx]     || '').trim();
    const centerId  = String(row[locationIdx] || '').trim();

    if (!studentId || !centerId) continue; // skip rows without both roll+center

    const marks = {};
    for (let i = 0; i < qColIndices.length; i++) {
      const qName = questionCols[i];
      marks[qName] = parseMark(row[qColIndices[i]]);
    }

    students.push({ studentId, name, centerId, marks });
  }

  return {
    questionCols,
    questionTopicMap,
    questionSubjectMap,
    questionAnswerMap,
    topicsWithQuestions,
    smallQuestionTopics,
    unknownSubjectQuestions,
    students,
  };
}
