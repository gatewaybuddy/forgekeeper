/**
 * Test tool execution system
 */
import { getToolExecutor, initializeTools } from './dist/index.js';

console.log('═══════════════════════════════════════════════════════════');
console.log('  Forgekeeper v2 - Tool Execution Tests');
console.log('═══════════════════════════════════════════════════════════\n');

async function testTools() {
  // Initialize tools
  console.log('Initializing tools...');
  initializeTools();
  console.log();

  const executor = getToolExecutor();

  // Test 1: List available tools
  console.log('✓ Test 1: Available Tools');
  const tools = executor.getAll();
  console.log(`  - ${tools.length} tools registered:`);
  for (const tool of tools) {
    console.log(`    • ${tool.definition.function.name} - ${tool.definition.function.description.slice(0, 60)}...`);
  }
  console.log();

  // Test 2: Get time
  console.log('✓ Test 2: Get Time Tool');
  const timeResult = await executor.execute('get_time', { format: 'iso' });
  console.log(`  Success: ${timeResult.success}`);
  console.log(`  Time: ${timeResult.output?.formatted}`);
  console.log(`  Execution time: ${timeResult.executionTime}ms`);
  console.log();

  // Test 3: Read directory
  console.log('✓ Test 3: Read Directory Tool');
  const dirResult = await executor.execute('read_dir', {
    dir: '.',
    includeHidden: false
  });
  console.log(`  Success: ${dirResult.success}`);
  console.log(`  Entries: ${dirResult.output?.count}`);
  console.log(`  First 5 entries:`);
  dirResult.output?.entries.slice(0, 5).forEach((entry) => {
    console.log(`    - ${entry.name} (${entry.type}, ${entry.size} bytes)`);
  });
  console.log();

  // Test 4: Write file
  console.log('✓ Test 4: Write File Tool');
  const writeResult = await executor.execute('write_file', {
    file: 'test-output.txt',
    content: 'Hello from Forgekeeper v2 tool system!\nGenerated at: ' + new Date().toISOString(),
  });
  console.log(`  Success: ${writeResult.success}`);
  console.log(`  Path: ${writeResult.output?.path}`);
  console.log(`  Size: ${writeResult.output?.bytes} bytes`);
  console.log();

  // Test 5: Read file
  console.log('✓ Test 5: Read File Tool');
  const readResult = await executor.execute('read_file', {
    file: 'test-output.txt',
  });
  console.log(`  Success: ${readResult.success}`);
  console.log(`  Content: "${readResult.output?.content}"`);
  console.log();

  // Test 6: Run bash (simple command)
  console.log('✓ Test 6: Run Bash Tool');
  const bashResult = await executor.execute('run_bash', {
    command: 'echo "Hello from bash"',
  });
  console.log(`  Success: ${bashResult.success}`);
  console.log(`  stdout: ${bashResult.output?.stdout}`);
  console.log(`  Exit code: ${bashResult.output?.exitCode}`);
  console.log(`  Execution time: ${bashResult.executionTime}ms`);
  console.log();

  // Test 7: HTTP fetch
  console.log('✓ Test 7: HTTP Fetch Tool');
  const httpResult = await executor.execute('http_fetch', {
    url: 'https://httpbin.org/json',
    method: 'GET',
  });
  console.log(`  Success: ${httpResult.success}`);
  console.log(`  Status: ${httpResult.output?.status}`);
  console.log(`  Execution time: ${httpResult.executionTime}ms`);
  console.log();

  // Test 8: Timeout protection
  console.log('✓ Test 8: Timeout Protection');
  const timeoutResult = await executor.execute('run_bash', {
    command: 'sleep 5',
    timeout: 1000, // 1 second timeout
  });
  console.log(`  Success: ${timeoutResult.success}`);
  console.log(`  Error: ${timeoutResult.error}`);
  console.log();

  // Test 9: Error handling
  console.log('✓ Test 9: Error Handling');
  const errorResult = await executor.execute('read_file', {
    file: 'nonexistent-file.txt',
  });
  console.log(`  Success: ${errorResult.success}`);
  console.log(`  Error: ${errorResult.error}`);
  console.log();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✓ All Tool Tests Complete!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\nCleanup: Removing test file...');
  await executor.execute('run_bash', { command: 'rm -f test-output.txt' });
  console.log('Done!');
}

testTools().catch(console.error);
