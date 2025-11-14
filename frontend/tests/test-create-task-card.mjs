/**
 * Quick test for create_task_card tool
 */

import * as createTaskCard from '../tools/create_task_card.mjs';

async function test() {
  console.log('Testing create_task_card tool...\n');

  // Test 1: Create a sample task card
  console.log('Test 1: Create sample task card T999');
  const result1 = await createTaskCard.run({
    task_id: 'T999',
    title: 'Test Task for Validation',
    goal: 'Verify that the create_task_card tool works correctly',
    scope: [
      'Create task card in correct format',
      'Validate all required fields',
      'Insert at correct location'
    ],
    out_of_scope: [
      'Production use',
      'Permanent task cards'
    ],
    allowed_touches: [
      'forgekeeper/tests/*'
    ],
    done_when: [
      'Task card appears in tasks.md',
      'Format matches template'
    ],
    test_level: 'unit'
  });

  console.log('Result:', JSON.stringify(result1, null, 2));

  if (result1.success) {
    console.log('✅ Test 1 PASSED\n');
  } else {
    console.log('❌ Test 1 FAILED:', result1.error, '\n');
  }

  // Test 2: Try to create duplicate (should fail)
  console.log('Test 2: Try creating duplicate task T999 (should fail)');
  const result2 = await createTaskCard.run({
    task_id: 'T999',
    title: 'Duplicate Test',
    goal: 'This should fail',
    scope: ['Test duplicate detection'],
    out_of_scope: ['Success'],
    allowed_touches: ['none'],
    done_when: ['Fails as expected'],
    test_level: 'unit'
  });

  console.log('Result:', JSON.stringify(result2, null, 2));

  if (result2.error && result2.duplicate) {
    console.log('✅ Test 2 PASSED (correctly detected duplicate)\n');
  } else {
    console.log('❌ Test 2 FAILED (should have detected duplicate)\n');
  }

  // Test 3: Invalid task_id format
  console.log('Test 3: Invalid task_id format (should fail)');
  const result3 = await createTaskCard.run({
    task_id: 'INVALID',
    title: 'Test',
    goal: 'This should fail',
    scope: ['Test validation'],
    out_of_scope: ['Success'],
    allowed_touches: ['none'],
    done_when: ['Fails as expected'],
    test_level: 'unit'
  });

  console.log('Result:', JSON.stringify(result3, null, 2));

  if (result3.error && result3.error.includes('Invalid task_id format')) {
    console.log('✅ Test 3 PASSED (correctly rejected invalid format)\n');
  } else {
    console.log('❌ Test 3 FAILED (should have rejected invalid format)\n');
  }

  console.log('\n=== All tests complete ===');
  console.log('Note: Test task T999 was created. You may want to remove it from tasks.md');
}

test().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
