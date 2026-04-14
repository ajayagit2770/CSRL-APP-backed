/**
 * services/csvParserService.js
 * CSV parsing utilities for Topic Map and Marks CSVs.
 * Uses csv-parse (sync) as specified.
 */

import { parse } from 'csv-parse/sync';

/**
 * parseTopicMapCsv — parse a Topic Map CSV buffer.
 *
 * Expected CSV format:
 *   topic,subject,questions
 *   Kinematics,Physics,Q6
 *   Center of Mass & Collisions,Physics,Q7|Q10
 *   Rotation,Physics,Q7|Q9
 *   Biomolecules,Chemistry,Q29
 *   Parabola,Mathematics,Q44
 *
 * @param {Buffer} buffer
 * @returns {Array<{ topic: string, subject: string, questions: string[] }>}
 */
export function parseTopicMapCsv(buffer) {
  const rows = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (!rows.length) {
    throw new Error('Topic Map CSV is empty or has no data rows.');
  }

  const firstRow = rows[0];
  if (!('topic' in firstRow) || !('subject' in firstRow) || !('questions' in firstRow)) {
    throw new Error(
      'Topic Map CSV must have columns: topic, subject, questions. ' +
      `Found: ${Object.keys(firstRow).join(', ')}`
    );
  }

  return rows
    .filter((row) => row.topic && row.subject && row.questions)
    .map((row) => ({
      topic:     row.topic.trim(),
      subject:   row.subject.trim(),
      questions: row.questions
        .split('|')
        .map((q) => q.trim())
        .filter(Boolean),
    }));
}

/**
 * parseMarksCsv — parse a Marks Awarded CSV buffer.
 *
 * Expected CSV format (matches existing CAT marks CSV exactly):
 *   Location,roll_no,Name,Q1,Q2,Q3,...,Q54
 *   KNP,2601001,ABHAY,0,0,3,-1,0,...
 *
 * @param {Buffer} buffer
 * @returns {Array<{ studentId: string, centerId: string, studentName: string, marks: Object }>}
 */
export function parseMarksCsv(buffer) {
  const rows = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (!rows.length) {
    throw new Error('Marks CSV is empty or has no data rows.');
  }

  const firstRow = rows[0];
  if (!('roll_no' in firstRow)) {
    throw new Error(
      'Marks CSV must have a "roll_no" column. ' +
      `Found: ${Object.keys(firstRow).join(', ')}`
    );
  }
  if (!('Location' in firstRow)) {
    throw new Error(
      'Marks CSV must have a "Location" column. ' +
      `Found: ${Object.keys(firstRow).join(', ')}`
    );
  }

  return rows.map((row) => {
    const marks = {};

    // Extract all columns that start with "Q" followed by digits
    for (const [col, val] of Object.entries(row)) {
      if (/^Q\d+$/i.test(col)) {
        const parsed = parseInt(val, 10);
        marks[col] = isNaN(parsed) ? 0 : parsed;
      }
    }

    return {
      studentId:   String(row.roll_no  || '').trim(),
      centerId:    String(row.Location || '').trim(),
      studentName: String(row.Name     || '').trim(),
      marks,
    };
  }).filter((r) => r.studentId && r.centerId);
}
