import fs from 'fs';
import { parseTestSheet, buildTopicSubjectLookup } from './services/csvParserService.js';
import { syllabusData } from './seedTopics.js';

// Convert syllabusData to the format buildTopicSubjectLookup expects
const mockSyllabus = syllabusData.map(s => ({
  subject: s.subject,
  topics: s.topics
}));

buildTopicSubjectLookup(mockSyllabus);

try {
  const buf = fs.readFileSync('/Users/surya/Downloads/Untitled spreadsheet - Sheet1 (1).csv');
  parseTestSheet(buf);
  console.log("SUCCESS!");
} catch(e) {
  console.error("FAILED!");
  if (e.validationErrors) {
    e.validationErrors.forEach(err => console.error("- " + err));
  } else {
    console.error(e.message);
  }
}
