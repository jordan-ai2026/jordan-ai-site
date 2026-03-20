/**
 * voiceAgentManager.js
 * Manages Vapi.ai voice assistants for Jordan-AI clients.
 *
 * voice-agents.json schema:
 * {
 *   "rc-bounce": {
 *     "assistantId": "xxx",
 *     "businessName": "RC Bounce LLC",
 *     "industry": "party rental",
 *     "createdAt": "2026-03-18T...",
 *     "phoneNumber": null
 *   }
 * }
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const VAPI_BASE_URL = 'https://api.vapi.ai';
const AGENTS_FILE = path.join(__dirname, 'voice-agents.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the Authorization header object for Vapi API calls. */
function vapiHeaders() {
  return {
    Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/** Reads voice-agents.json, returns parsed object (or {} if file doesn't exist). */
function readAgentsFile() {
  if (!fs.existsSync(AGENTS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Writes the agents object back to voice-agents.json. */
function writeAgentsFile(data) {
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Builds a realistic, on-script system prompt for a voice assistant.
 *
 * @param {object} config - { businessName, industry, services[], phoneGreeting, bookingUrl, ownerName, agentName }
 * @returns {string} System prompt text
 */
function buildSystemPrompt(config) {
  const {
    businessName,
    industry,
    services = [],
    phoneGreeting,
    bookingUrl,
    ownerName,
    agentName = 'Jordan',
  } = config;

  const serviceList = services.length
    ? services.map((s) => `- ${s}`).join('\n')
    : '- General services (ask the caller what they need)';

  const bookingLine = bookingUrl
    ? `You can also direct them to book online at: ${bookingUrl}`
    : 'Let them know you will have someone from the team follow up to confirm the appointment.';

  return `You are ${agentName}, a friendly and professional phone receptionist for ${businessName}, a ${industry} company.

## Your Greeting
When the call starts, say exactly: "${phoneGreeting}"

## Your Role
- Answer inbound calls on behalf of ${businessName}
- Help callers understand what services are offered
- Book free estimates or appointments
- Collect the caller's contact information
- Stay on topic — you only handle business for ${businessName}

## Services Offered
${serviceList}

## How to Handle Common Questions

**Pricing:**
Tell callers that pricing depends on the scope of work and a free estimate is the best way to get an accurate number. Offer to schedule one.

**Availability:**
Let them know the team is typically available Monday through Saturday and you'd love to get them on the schedule. Ask for their preferred time.

**Service Area:**
Let callers know you serve the local area and surrounding communities. If they are unsure whether you cover their location, offer to have ${ownerName || 'the owner'} call them back to confirm.

**What happens next:**
After collecting info, let them know the team will confirm their appointment within a few hours.

## Booking an Appointment
${bookingLine}

## Information to Collect (in a natural, conversational way)
1. Caller's full name
2. Best callback phone number
3. Type of service needed
4. Preferred appointment date and time
5. Address or zip code (if relevant to the service)

## Rules
- Be warm, calm, and professional at all times
- Never make up pricing numbers — always offer a free estimate instead
- Never discuss topics unrelated to ${businessName} or its services
- If a caller is upset or has a complaint, empathize and offer to have ${ownerName || 'the owner'} call them back personally
- Do not transfer calls or put callers on hold — collect info and let them know someone will follow up
- If asked if you are a robot or AI, you can say: "I'm a virtual receptionist helping the team — I'll make sure your info gets to the right person."
- End calls politely: "Thanks so much for calling ${businessName}! We'll be in touch soon. Have a great day!"`.trim();
}

// ---------------------------------------------------------------------------
// 1. createVoiceAgent
// ---------------------------------------------------------------------------

/**
 * Creates a new Vapi assistant for a client and saves it to voice-agents.json.
 *
 * @param {string} clientSlug - Unique key for this client, e.g. "rc-bounce"
 * @param {object} config - { businessName, industry, services[], phoneGreeting, bookingUrl, ownerName }
 * @returns {Promise<{ success: boolean, assistantId?: string, message?: string, error?: string }>}
 */
async function createVoiceAgent(clientSlug, config) {
  try {
    if (!isConfigured()) {
      return { success: false, error: 'VAPI_API_KEY is not set in environment.' };
    }

    const {
      businessName,
      industry,
      phoneGreeting = `Thanks for calling ${config.businessName}, how can I help you today?`,
      agentName = 'Jordan',
    } = config;

    const systemPrompt = buildSystemPrompt({ ...config, phoneGreeting, agentName });

    const payload = {
      name: `${businessName} - Voice Agent`,
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
        ],
        temperature: 0.5,
      },
      voice: {
        provider: '11labs',
        voiceId: 'paula', // Warm, professional female voice
      },
      firstMessage: phoneGreeting,
      endCallFunctionEnabled: true,
      recordingEnabled: true,
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: 'en-US',
      },
    };

    const response = await axios.post(`${VAPI_BASE_URL}/assistant`, payload, {
      headers: vapiHeaders(),
    });

    const assistantId = response.data.id;

    // Persist to voice-agents.json
    const agents = readAgentsFile();
    agents[clientSlug] = {
      assistantId,
      businessName,
      industry: industry || 'general',
      createdAt: new Date().toISOString(),
      phoneNumber: null,
    };
    writeAgentsFile(agents);

    return {
      success: true,
      assistantId,
      message: `Voice agent created for "${businessName}" (slug: ${clientSlug}).`,
    };
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    return { success: false, error: `createVoiceAgent failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 2. updateVoiceAgent
// ---------------------------------------------------------------------------

/**
 * Updates an existing Vapi assistant's system prompt and config.
 *
 * @param {string} clientSlug - The client slug used when the agent was created
 * @param {object} config - Same shape as createVoiceAgent config
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
async function updateVoiceAgent(clientSlug, config) {
  try {
    if (!isConfigured()) {
      return { success: false, error: 'VAPI_API_KEY is not set in environment.' };
    }

    const agents = readAgentsFile();
    const agent = agents[clientSlug];

    if (!agent) {
      return {
        success: false,
        error: `No agent found for slug "${clientSlug}". Create it first with createVoiceAgent().`,
      };
    }

    const {
      businessName = agent.businessName,
      phoneGreeting = `Thanks for calling ${businessName}, how can I help you today?`,
      agentName = 'Jordan',
    } = config;

    const systemPrompt = buildSystemPrompt({ ...config, businessName, phoneGreeting, agentName });

    const payload = {
      name: `${businessName} - Voice Agent`,
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
        ],
        temperature: 0.5,
      },
      firstMessage: phoneGreeting,
    };

    await axios.patch(`${VAPI_BASE_URL}/assistant/${agent.assistantId}`, payload, {
      headers: vapiHeaders(),
    });

    // Update local record
    agents[clientSlug] = {
      ...agent,
      businessName,
      industry: config.industry || agent.industry,
      updatedAt: new Date().toISOString(),
    };
    writeAgentsFile(agents);

    return {
      success: true,
      message: `Voice agent for "${clientSlug}" updated successfully.`,
    };
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    return { success: false, error: `updateVoiceAgent failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 3. listVoiceAgents
// ---------------------------------------------------------------------------

/**
 * Returns all voice agents from voice-agents.json.
 *
 * @returns {{ success: boolean, agents?: object, error?: string }}
 */
function listVoiceAgents() {
  try {
    const agents = readAgentsFile();
    return { success: true, agents };
  } catch (err) {
    return { success: false, error: `listVoiceAgents failed: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// 4. getCallLogs
// ---------------------------------------------------------------------------

/**
 * Fetches recent call logs for a client's assistant from Vapi.
 *
 * @param {string} clientSlug - The client slug
 * @param {number} daysBack - How many days back to look (default: 7)
 * @returns {Promise<{ success: boolean, calls?: Array, error?: string }>}
 */
async function getCallLogs(clientSlug, daysBack = 7) {
  try {
    if (!isConfigured()) {
      return { success: false, error: 'VAPI_API_KEY is not set in environment.' };
    }

    const agents = readAgentsFile();
    const agent = agents[clientSlug];

    if (!agent) {
      return {
        success: false,
        error: `No agent found for slug "${clientSlug}".`,
      };
    }

    const response = await axios.get(`${VAPI_BASE_URL}/call`, {
      headers: vapiHeaders(),
      params: {
        assistantId: agent.assistantId,
        limit: 50,
      },
    });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    // Vapi returns an array of call objects
    const rawCalls = Array.isArray(response.data) ? response.data : (response.data.results || []);

    const calls = rawCalls
      .filter((call) => {
        const started = new Date(call.startedAt || call.createdAt);
        return started >= cutoff;
      })
      .map((call) => {
        // Calculate duration in seconds
        const durationSec =
          call.endedAt && call.startedAt
            ? Math.round((new Date(call.endedAt) - new Date(call.startedAt)) / 1000)
            : null;

        // Extract a brief transcript summary (first 300 chars of transcript if available)
        const transcriptRaw =
          call.transcript ||
          (call.messages || [])
            .map((m) => `${m.role}: ${m.message || m.content || ''}`)
            .join(' ');
        const transcriptSummary = transcriptRaw
          ? transcriptRaw.substring(0, 300).trim() + (transcriptRaw.length > 300 ? '...' : '')
          : 'No transcript available';

        // Basic outcome detection
        let outcome = 'unknown';
        if (call.endedReason) {
          outcome = call.endedReason; // e.g. "customer-ended-call", "assistant-ended-call"
        }

        return {
          id: call.id,
          startedAt: call.startedAt || call.createdAt,
          durationSeconds: durationSec,
          transcriptSummary,
          outcome,
          status: call.status,
        };
      });

    return { success: true, calls };
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    return { success: false, error: `getCallLogs failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 5. generateWeeklyReport
// ---------------------------------------------------------------------------

/**
 * Generates a plain-text weekly summary for a client's voice agent.
 *
 * @param {string} clientSlug - The client slug
 * @returns {Promise<{ success: boolean, report?: string, error?: string }>}
 */
async function generateWeeklyReport(clientSlug) {
  try {
    const agents = readAgentsFile();
    const agent = agents[clientSlug];

    if (!agent) {
      return {
        success: false,
        error: `No agent found for slug "${clientSlug}".`,
      };
    }

    const logsResult = await getCallLogs(clientSlug, 7);
    if (!logsResult.success) {
      return { success: false, error: logsResult.error };
    }

    const calls = logsResult.calls;
    const totalCalls = calls.length;

    // Average duration
    const durationsWithData = calls.filter((c) => c.durationSeconds !== null);
    const avgDuration =
      durationsWithData.length > 0
        ? Math.round(
            durationsWithData.reduce((sum, c) => sum + c.durationSeconds, 0) /
              durationsWithData.length
          )
        : 0;

    // Detect bookings (simple keyword scan on transcripts)
    const bookingKeywords = [
      'schedule',
      'appointment',
      'book',
      'estimate',
      'come out',
      'set up',
      'confirm',
      'tuesday',
      'monday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    const bookingsDetected = calls.filter((c) =>
      bookingKeywords.some((kw) =>
        c.transcriptSummary.toLowerCase().includes(kw)
      )
    ).length;

    // Common question topics (simple keyword frequency)
    const topicKeywords = {
      pricing: ['price', 'cost', 'how much', 'quote', 'estimate', 'charge'],
      availability: ['available', 'open', 'schedule', 'when', 'time'],
      services: ['service', 'repair', 'install', 'replace', 'inspection', 'damage'],
      location: ['area', 'location', 'cover', 'serve', 'zip', 'address'],
      contact: ['number', 'email', 'reach', 'call back', 'follow up'],
    };

    const topicCounts = {};
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      topicCounts[topic] = calls.filter((c) =>
        keywords.some((kw) => c.transcriptSummary.toLowerCase().includes(kw))
      ).length;
    }

    // Sort topics by frequency
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .filter(([, count]) => count > 0)
      .slice(0, 3)
      .map(([topic, count]) => `  - ${topic} (${count} calls)`)
      .join('\n');

    const formatDuration = (sec) => {
      if (!sec) return 'N/A';
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    const reportDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const report = `
====================================================
  WEEKLY VOICE AGENT REPORT — ${agent.businessName}
  Generated: ${reportDate}
====================================================

📞 CALL SUMMARY (Last 7 Days)
  Total Calls:       ${totalCalls}
  Avg Call Duration: ${formatDuration(avgDuration)}
  Bookings Detected: ${bookingsDetected}

🗣️ TOP TOPICS DISCUSSED
${topTopics || '  - No transcript data available'}

📋 CALL LOG
${
  calls.length === 0
    ? '  No calls in the last 7 days.'
    : calls
        .map(
          (c, i) =>
            `  [${i + 1}] ${new Date(c.startedAt).toLocaleString()} | ` +
            `${formatDuration(c.durationSeconds)} | ` +
            `Outcome: ${c.outcome}\n` +
            `       Preview: ${c.transcriptSummary.substring(0, 120)}${
              c.transcriptSummary.length > 120 ? '...' : ''
            }`
        )
        .join('\n\n')
}

====================================================
  Report for: ${clientSlug} | Agent ID: ${agent.assistantId}
====================================================
`.trim();

    return { success: true, report };
  } catch (err) {
    return { success: false, error: `generateWeeklyReport failed: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// 6. createDemoAgent
// ---------------------------------------------------------------------------

/**
 * Creates a demo roofing company voice agent for testing/sales demos.
 *
 * @returns {Promise<{ success: boolean, assistantId?: string, message?: string, error?: string }>}
 */
async function createDemoAgent() {
  return createVoiceAgent('peak-roofing-demo', {
    businessName: 'Peak Roofing Co',
    industry: 'roofing',
    services: [
      'Free roofing estimates',
      'Roof repair',
      'Full roof replacement',
      'Storm damage inspection',
    ],
    phoneGreeting:
      "Thanks for calling Peak Roofing Co, this is Jordan, how can I help you today?",
    bookingUrl: null,
    ownerName: 'the owner',
    agentName: 'Jordan',
  });
}

// ---------------------------------------------------------------------------
// 7. isConfigured
// ---------------------------------------------------------------------------

/**
 * Returns true if VAPI_API_KEY is set in the environment.
 *
 * @returns {boolean}
 */
function isConfigured() {
  return !!(process.env.VAPI_API_KEY && process.env.VAPI_API_KEY.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createVoiceAgent,
  updateVoiceAgent,
  listVoiceAgents,
  getCallLogs,
  generateWeeklyReport,
  createDemoAgent,
  isConfigured,
};
