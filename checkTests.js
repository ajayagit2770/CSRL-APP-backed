import assert from 'assert';
import {
  classifyTopicForStudent,
  classifySubjectForStudent,
  isStudentAbsent,
  classifyCenterRatio
} from './utils/topicUtils.js';

function runTests() {
  console.log('Running acceptance tests for Weak Topics System Overhaul...');
  
  // 1. 3 questions, 2 positive → 'none'
  assert.strictEqual(classifyTopicForStudent({ Q1: 4, Q2: 4, Q3: 0 }, ['Q1', 'Q2', 'Q3']), 'none');
  
  // 2. 3 questions, 1 positive → 'weakest' (exact 2/3 using integer check)
  assert.strictEqual(classifyTopicForStudent({ Q1: 4, Q2: -1, Q3: 0 }, ['Q1', 'Q2', 'Q3']), 'weakest');
  
  // 3. 3 questions, 0 positive → 'weakest'
  assert.strictEqual(classifyTopicForStudent({ Q1: 0, Q2: -1, Q3: 0 }, ['Q1', 'Q2', 'Q3']), 'weakest');
  
  // 4. 2 questions, 1 positive → 'weak' (exact 1/2)
  assert.strictEqual(classifyTopicForStudent({ Q1: 4, Q2: 0 }, ['Q1', 'Q2']), 'weak');
  
  // 5. 3 questions, 1 blank + 2 positive → denominator=2, result 'none'
  assert.strictEqual(classifyTopicForStudent({ Q1: 4, Q2: 4, Q3: null }, ['Q1', 'Q2', 'Q3']), 'none');
  assert.strictEqual(classifyTopicForStudent({ Q1: 4, Q2: 4, Q3: '' }, ['Q1', 'Q2', 'Q3']), 'none');
  
  // 6. Student all blanks → excluded from output and center denominator
  assert.strictEqual(isStudentAbsent({ Q1: null, Q2: null }, ['Q1', 'Q2']), true);
  assert.strictEqual(isStudentAbsent({ Q1: '', Q2: undefined }, ['Q1', 'Q2']), true);
  
  // 7. Center: 50/100 students weak → 'strongWeak'
  assert.strictEqual(classifyCenterRatio(50, 100), 'weakest');
  
  // 8. Center: 39/100 → NOT flagged
  assert.strictEqual(classifyCenterRatio(39, 100), 'none');
  
  // 9. Center: 40/100 → 'mediumWeak'
  assert.strictEqual(classifyCenterRatio(40, 100), 'weak');
  
  // 10. Center 0 students → skipped, no crash
  assert.strictEqual(classifyCenterRatio(0, 0), 'none');
  
  // 11. Topic 0 questions → skipped, no crash
  assert.strictEqual(classifyTopicForStudent({ Q1: 4 }, []), 'none');
  
  // 12. Center 90 of 100 present → denominator=90 everywhere
  assert.strictEqual(classifyCenterRatio(45, 90), 'weakest'); // 50%
  
  console.log('All tests passed successfully!');
}

runTests();
