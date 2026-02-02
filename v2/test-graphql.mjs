/**
 * Test GraphQL server
 */

async function testGraphQL() {
  console.log('Testing GraphQL server...\n');

  // Test 1: Health check
  console.log('1. Testing health endpoint...');
  try {
    const healthRes = await fetch('http://localhost:4000/health');
    const health = await healthRes.json();
    console.log('✓ Health check:', health);
  } catch (error) {
    console.log('✗ Health check failed:', error.message);
    console.log('  (Server may not be running - start with: npm start)');
    return;
  }

  // Test 2: System metrics query
  console.log('\n2. Testing system metrics query...');
  try {
    const res = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            systemMetrics {
              activeSessions
              totalSessions
              averageIntegrationScore
              totalChallenges
              uptime
            }
          }
        `,
      }),
    });

    const data = await res.json();
    console.log('✓ System metrics:', JSON.stringify(data.data.systemMetrics, null, 2));
  } catch (error) {
    console.log('✗ System metrics failed:', error.message);
  }

  // Test 3: Provider status
  console.log('\n3. Testing provider status...');
  try {
    const res = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            providerStatus {
              localQwen { available latencyMs error }
              claude { available error }
            }
          }
        `,
      }),
    });

    const data = await res.json();
    console.log('✓ Provider status:', JSON.stringify(data.data.providerStatus, null, 2));
  } catch (error) {
    console.log('✗ Provider status failed:', error.message);
  }

  // Test 4: Agent status
  console.log('\n4. Testing agent status...');
  try {
    const res = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            agentStatus {
              forge { name role model available }
              loom { name role model available }
              anvil { name role model available }
              scout { name role model available }
            }
          }
        `,
      }),
    });

    const data = await res.json();
    console.log('✓ Agent status:');
    for (const [name, info] of Object.entries(data.data.agentStatus)) {
      console.log(`  ${name}:`, info);
    }
  } catch (error) {
    console.log('✗ Agent status failed:', error.message);
  }

  console.log('\n✅ GraphQL server tests complete!');
  console.log('\nNext: Try the GraphQL Playground at http://localhost:4000/graphql');
}

testGraphQL().catch(console.error);
