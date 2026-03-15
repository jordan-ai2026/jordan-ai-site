// ============================================
// JORDAN AI - GIT DEPLOY
// Automatically pushes changes to GitHub
// Then Vercel auto-deploys from GitHub
// ============================================

const { exec } = require("child_process")
const path = require("path")

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  // Folder containing the git repo (where .git folder is)
  repoPath: __dirname,
  
  // Default commit message
  defaultMessage: "Jordan AI auto-update"
}

// ============================================
// RUN GIT COMMAND
// ============================================
function runGitCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: CONFIG.repoPath }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Git error: ${stderr}`)
        reject(error)
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

// ============================================
// CHECK GIT STATUS
// ============================================
async function checkStatus() {
  try {
    const status = await runGitCommand("git status --porcelain")
    const hasChanges = status.length > 0
    
    return {
      success: true,
      hasChanges,
      files: status.split("\n").filter(f => f)
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ============================================
// GIT ADD ALL
// ============================================
async function gitAdd(files = ".") {
  try {
    await runGitCommand(`git add ${files}`)
    console.log("✅ Git: Files staged")
    return { success: true }
  } catch (err) {
    console.error("❌ Git add failed:", err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// GIT COMMIT
// ============================================
async function gitCommit(message = null) {
  try {
    const commitMessage = message || `${CONFIG.defaultMessage} - ${new Date().toISOString()}`
    await runGitCommand(`git commit -m "${commitMessage}"`)
    console.log(`✅ Git: Committed - "${commitMessage}"`)
    return { success: true, message: commitMessage }
  } catch (err) {
    // "nothing to commit" is not really an error
    if (err.message.includes("nothing to commit")) {
      console.log("ℹ️ Git: Nothing to commit")
      return { success: true, message: "Nothing to commit" }
    }
    console.error("❌ Git commit failed:", err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// GIT PUSH
// ============================================
async function gitPush() {
  try {
    await runGitCommand("git push")
    console.log("✅ Git: Pushed to GitHub")
    return { success: true }
  } catch (err) {
    console.error("❌ Git push failed:", err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// FULL DEPLOY (Add + Commit + Push)
// ============================================
async function deployToGitHub(message = null) {
  console.log("🚀 Starting GitHub deploy...")
  
  try {
    // 1. Check if there are changes
    const status = await checkStatus()
    if (!status.success) {
      return { success: false, error: status.error }
    }
    
    if (!status.hasChanges) {
      console.log("ℹ️ No changes to deploy")
      return { success: true, message: "No changes to deploy" }
    }
    
    console.log(`📝 ${status.files.length} files changed`)
    
    // 2. Stage all changes
    const addResult = await gitAdd()
    if (!addResult.success) {
      return addResult
    }
    
    // 3. Commit
    const commitMessage = message || `Jordan AI: Updated ${status.files.length} files`
    const commitResult = await gitCommit(commitMessage)
    if (!commitResult.success) {
      return commitResult
    }
    
    // 4. Push
    const pushResult = await gitPush()
    if (!pushResult.success) {
      return pushResult
    }
    
    console.log("✅ Deploy complete! Vercel will auto-deploy shortly.")
    
    return {
      success: true,
      filesChanged: status.files.length,
      message: commitMessage
    }
    
  } catch (err) {
    console.error("❌ Deploy failed:", err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// DEPLOY WEBSITE ONLY
// Only commits/pushes the website folder
// ============================================
async function deployWebsite(message = null) {
  console.log("🌐 Deploying website changes...")
  
  try {
    // Stage only website folder
    await runGitCommand("git add website/")
    
    const status = await runGitCommand("git status --porcelain website/")
    if (!status) {
      console.log("ℹ️ No website changes to deploy")
      return { success: true, message: "No website changes" }
    }
    
    const commitMessage = message || `Jordan AI: Website update - ${new Date().toLocaleString()}`
    await gitCommit(commitMessage)
    await gitPush()
    
    console.log("✅ Website deployed!")
    return { success: true, message: commitMessage }
    
  } catch (err) {
    console.error("❌ Website deploy failed:", err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  checkStatus,
  gitAdd,
  gitCommit,
  gitPush,
  deployToGitHub,
  deployWebsite
}
