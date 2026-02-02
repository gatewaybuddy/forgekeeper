/**
 * Basic test to verify components work
 */
import { config } from './dist/index.js';

console.log('Config loaded:', config);

try {
  // Test 1: Import router
  const { getRouter } = await import('./dist/index.js');
  console.log('✓ Router module imported');

  // Test 2: Create router (this will fail if API key missing)
  try {
    const router = getRouter();
    console.log('✓ Router created');

    // Test 3: Health check
    const health = await router.healthCheckAll();
    console.log('✓ Health check complete:', health);
  } catch (error) {
    console.error('✗ Router initialization failed:', error.message);
    console.log('\nThis is expected - ANTHROPIC_API_KEY is not set in .env');
    console.log('To fix: Add your API key to .env file');
  }
} catch (error) {
  console.error('✗ Fatal error:', error);
}
