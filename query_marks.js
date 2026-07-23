import { initMongo } from './services/mongoInit.js';
import StudentRawMarks from './models/StudentRawMarks.js';

(async () => {
  await initMongo();
  const marks = await StudentRawMarks.findOne({ 'studentId': '2701008' }).lean();
  console.log(JSON.stringify(marks.marks).substring(0, 500));
  process.exit(0);
})();
