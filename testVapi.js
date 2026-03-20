/**
 * testVapi.js
 * Quick test script to verify voiceAgentManager.js is working.
 *
 * Usage:
 *   node testVapi.js
 */

require('dotenv').config();

const {
  isConfigured,
  createDemoAgent,
  listVoiceAgents,
} = require('./voiceAgentManager');

async function main() {
  console.log('=== Vapi Voice Agent Manager — Test Script ===\n');

  // 1. Check configuration
  const configured = isConfigured();
  console.log(`[1] isConfigured(): ${configured}`);

  if (!configured) {
    console.error(
      '\n❌ VAPI_API_KEY is missing from your .env file.\n' +
        'Add it like this:\n\n  VAPI_API_KEY=your_key_here\n'
    );
    process.exit(1);
  }

  console.log('✅ VAPI_API_KEY found.\n');

  // 2. Create the demo agent
  console.log('[2] Creating demo agent (Peak Roofing Co)...');
  const result = await createDemoAgent();
  console.log('Result:', JSON.stringify(result, null, 2));

  if (!result.success) {
    console.error('\n❌ Demo agent creation failed. Check the error above.');
    process.exit(1);
  }

  console.log(`\n✅ Demo agent created! Assistant ID: ${result.assistantId}`);

  // 3. List all agents
  console.log('\n[3] Listing all saved voice agents...');
  const { agents } = listVoiceAgents();
  console.log(JSON.stringify(agents, null, 2));

  console.log('\n🎉 All tests passed! voiceAgentManager.js is working correctly.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
