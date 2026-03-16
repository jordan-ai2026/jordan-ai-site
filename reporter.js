// ============================================
// JORDAN AI - REPORTER
// Sends reports to Discord channel
// ============================================

let discordClient = null
let reportsChannelId = null

// ============================================
// SETUP
// ============================================
function setClient(client) {
  discordClient = client
}

function setReportsChannel(channelId) {
  reportsChannelId = channelId
  console.log(`📢 Reports channel set: ${channelId}`)
}

function getReportsChannel() {
  return reportsChannelId
}

function clearReportsChannel() {
  reportsChannelId = null
  console.log("📢 Reports channel cleared")
}

// ============================================
// SEND REPORT
// ============================================
async function sendReport(text) {
  if (!discordClient || !reportsChannelId) {
    console.log("Reporter: No client or channel configured")
    return false
  }
  
  try {
    const channel = await discordClient.channels.fetch(reportsChannelId)
    if (!channel) {
      console.log("Reporter: Couldn't fetch channel")
      return false
    }
    
    // Split long messages
    const chunks = []
    const maxLen = 1900
    
    if (typeof text === "string") {
      for (let i = 0; i < text.length; i += maxLen) {
        chunks.push(text.substring(i, i + maxLen))
      }
    } else if (Array.isArray(text)) {
      // Join array and split
      const fullText = text.join("\n")
      for (let i = 0; i < fullText.length; i += maxLen) {
        chunks.push(fullText.substring(i, i + maxLen))
      }
    }
    
    for (const chunk of chunks) {
      await channel.send(chunk)
    }
    
    console.log(`📢 Report sent to channel`)
    return true
    
  } catch (err) {
    console.log(`Reporter error: ${err.message}`)
    return false
  }
}

// ============================================
// FORMAT HELPERS
// ============================================
function formatCycleReport(result) {
  if (!result || !result.report) {
    return "❌ No report generated"
  }
  
  if (Array.isArray(result.report)) {
    return result.report.join("\n")
  }
  
  return result.report
}

function formatOrchestrationReport(result) {
  if (!result) return "❌ No result"
  if (result.report) return result.report
  return `Orchestration ${result.success ? "succeeded" : "failed"}`
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  setClient,
  setReportsChannel,
  getReportsChannel,
  clearReportsChannel,
  sendReport,
  formatCycleReport,
  formatOrchestrationReport
}
