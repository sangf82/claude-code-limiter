#!/usr/bin/env node

/**
 * claude-code-limiter — Hook Script
 * ==================================
 * Standalone rate limiter invoked by Claude Code managed hooks.
 * Zero npm dependencies. Uses only Node.js built-ins.
 * Gets copied to the system-protected directory during setup.
 *
 * Invoked by managed-settings.json hooks:
 *   node hook.js sync     → SessionStart   (cache model, sync config from server)
 *   node hook.js check    → UserPromptSubmit (gate: block if over limit)
 *   node hook.js count    → Stop           (increment turn counter)
 *   node hook.js enforce  → PreToolUse     (local-only kill/pause check)
 *   node hook.js status   → Terminal       (human-readable status)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");

// ════════════════════════════════════════════════════════════
// PATHS — System-protected locations per platform
// ════════════════════════════════════════════════════════════

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

// CLAUDE_LIMITER_DIR override: for testing or custom install locations.
const LIMITER_DIR =
  process.env.CLAUDE_LIMITER_DIR ||
  (IS_WIN
    ? path.join("C:", "Program Files", "ClaudeCode", "limiter")
    : IS_MAC
      ? path.join("/Library", "Application Support", "ClaudeCode", "limiter")
      : path.join("/etc", "claude-code", "limiter"));

const CONFIG_FILE = path.join(LIMITER_DIR, "config.json");
const SERVER_FILE = path.join(LIMITER_DIR, "server.json");
const CACHE_FILE = path.join(LIMITER_DIR, "cache.json");
const MODEL_FILE = path.join(LIMITER_DIR, "session-model.txt");
const USAGE_DIR = path.join(LIMITER_DIR, "usage");
const DEBUG_LOG = path.join(LIMITER_DIR, "debug.log");

const TODAY = new Date().toISOString().slice(0, 10);
const USAGE_FILE = path.join(USAGE_DIR, `${TODAY}.json`);

// ════════════════════════════════════════════════════════════
// SAFE I/O — Every read/write is wrapped. Hook must never crash.
// ════════════════════════════════════════════════════════════

function readJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJSON(filepath, data) {
  try {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    const tmp = filepath + ".tmp." + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filepath);
  } catch (err) {
    debugLog(`WRITE_ERROR: ${filepath}: ${err.message}`);
  }
}

function readText(filepath) {
  try {
    return fs.readFileSync(filepath, "utf-8").trim();
  } catch {
    return null;
  }
}

function writeText(filepath, text) {
  try {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, text);
  } catch {}
}

let _debugEnabled = false;
function debugLog(msg) {
  if (!_debugEnabled) return;
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(DEBUG_LOG, `[${ts}] ${msg}\n`);
  } catch {}
}

function readStdin() {
  try {
    if (process.stdin.isTTY) return {};
    return JSON.parse(fs.readFileSync(0, "utf-8").trim());
  } catch {
    return {};
  }
}

// ════════════════════════════════════════════════════════════
// MODEL DETECTION
//
// Priority:
//   1. SessionStart stdin (only in sync action)
//   2. ~/.claude/settings.json → model field (catches /model changes)
//   3. ~/.claude/settings.local.json → model
//   4. .claude/settings.json (project) → model
//   5. session-model.txt (cached from SessionStart)
//   6. ANTHROPIC_MODEL env var
//   7. CLAUDE_MODEL env var
//   8. config.defaultModel (detected during setup: Pro=sonnet, Max=opus)
//   9. Falls back to "default"
//
// Normalization: string containing "opus"/"sonnet"/"haiku"
// maps to that family. Everything else → "default".
// ════════════════════════════════════════════════════════════

function normalizeModel(raw) {
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("haiku")) return "haiku";
  return "default";
}

function detectModel(stdinData, config) {
  // Source 1: Hook input (SessionStart only)
  if (stdinData && stdinData.model) {
    return normalizeModel(stdinData.model);
  }

  // Source 2: User settings (updated by /model command)
  const home = os.homedir();
  const userSettings = readJSON(path.join(home, ".claude", "settings.json"));
  if (userSettings && userSettings.model) {
    return normalizeModel(userSettings.model);
  }

  // Source 3: Local project settings
  const localSettings = readJSON(
    path.join(process.cwd(), ".claude", "settings.local.json"),
  );
  if (localSettings && localSettings.model) {
    return normalizeModel(localSettings.model);
  }

  // Source 4: Project settings
  const projectSettings = readJSON(
    path.join(process.cwd(), ".claude", "settings.json"),
  );
  if (projectSettings && projectSettings.model) {
    return normalizeModel(projectSettings.model);
  }

  // Source 5: Cached from SessionStart
  const cached = readText(MODEL_FILE);
  if (cached) return normalizeModel(cached);

  // Source 6-7: Environment variables
  if (process.env.ANTHROPIC_MODEL) return normalizeModel(process.env.ANTHROPIC_MODEL);
  if (process.env.CLAUDE_MODEL) return normalizeModel(process.env.CLAUDE_MODEL);

  // Source 8: Plan default from config (detected during setup)
  // Pro plan default = sonnet, Max plan default = opus
  if (config && config.defaultModel) return normalizeModel(config.defaultModel);

  return "default";
}

// ════════════════════════════════════════════════════════════
// SERVER COMMUNICATION
// ════════════════════════════════════════════════════════════

function serverRequest(endpoint, payload, timeoutMs) {
  const serverConfig = readJSON(SERVER_FILE);
  if (!serverConfig || !serverConfig.url) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const url = new URL(endpoint, serverConfig.url);
      const body = JSON.stringify(payload);
      const client = url.protocol === "https:" ? https : http;

      const req = client.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serverConfig.auth_token}`,
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(null);
            }
          });
        },
      );

      req.on("error", () => resolve(null));
      req.setTimeout(timeoutMs || 3000, () => {
        req.destroy();
        resolve(null);
      });

      req.write(body);
      req.end();
    } catch {
      resolve(null);
    }
  });
}

// ════════════════════════════════════════════════════════════
// USAGE TRACKING (local fallback)
// ════════════════════════════════════════════════════════════

function loadUsage() {
  try { fs.mkdirSync(USAGE_DIR, { recursive: true }); } catch {}
  return readJSON(USAGE_FILE) || {};
}

function saveUsage(usage) {
  writeJSON(USAGE_FILE, usage);
}

function cleanupOldUsage(keepDays) {
  keepDays = keepDays || 7;
  try {
    const cutoff = Date.now() - keepDays * 86400000;
    for (const f of fs.readdirSync(USAGE_DIR)) {
      if (!f.endsWith(".json")) continue;
      const d = new Date(f.replace(".json", "") + "T00:00:00Z");
      if (!isNaN(d.getTime()) && d.getTime() < cutoff) {
        try { fs.unlinkSync(path.join(USAGE_DIR, f)); } catch {}
      }
    }
  } catch {}
}

// ════════════════════════════════════════════════════════════
// LOCAL LIMIT EVALUATION (offline fallback)
// ════════════════════════════════════════════════════════════

function evaluateLimitsLocally(config, model, usage) {
  if (!config || !config.limits) return { allowed: true };

  const limits = config.limits;
  const creditWeights = config.credit_weights || { opus: 10, sonnet: 3, haiku: 1 };

  // Check kill/pause status
  if (config.status === "killed" || config.status === "paused") {
    return {
      allowed: false,
      reason: config.status === "killed"
        ? "Your Claude Code access has been revoked by the admin.\nContact your admin to restore access."
        : "Your Claude Code access has been paused by the admin.\nContact your admin to resume access.",
    };
  }

  for (const rule of limits) {
    // 1. Time-of-day
    if (rule.type === "time_of_day") {
      if (rule.model && rule.model !== model) continue;
      if (rule.schedule_start && rule.schedule_end) {
        const now = new Date();
        const hhmm = String(now.getHours()).padStart(2, "0") + ":" +
                     String(now.getMinutes()).padStart(2, "0");
        if (hhmm < rule.schedule_start || hhmm >= rule.schedule_end) {
          return {
            allowed: false,
            reason: `${model} is only available ${rule.schedule_start} - ${rule.schedule_end}.\nCurrent time: ${hhmm}. Try another model.`,
          };
        }
      }
      continue;
    }

    // 2. Per-model cap
    if (rule.type === "per_model") {
      if (rule.model && rule.model !== model) continue;
      const limit = rule.value;
      if (limit < 0) continue;
      if (limit === 0) return { allowed: false, reason: `${model} is blocked for your account.` };
      const used = usage[rule.model || model] || 0;
      if (used >= limit) {
        return { allowed: false, reason: `Daily ${model} limit reached.\nUsed ${used}/${limit} prompts today.` };
      }
    }

    // 3. Credit budget
    if (rule.type === "credits") {
      const budget = rule.value;
      if (budget < 0) continue;
      let totalCredits = 0;
      for (const [m, count] of Object.entries(usage)) {
        totalCredits += count * (creditWeights[m] || 1);
      }
      const nextCost = creditWeights[model] || 1;
      if (totalCredits + nextCost > budget) {
        return {
          allowed: false,
          reason: `Daily credit budget exhausted.\nUsed ${totalCredits}/${budget} credits.\nNext ${model} prompt costs ${nextCost} credits.`,
        };
      }
    }
  }

  return { allowed: true };
}

// ════════════════════════════════════════════════════════════
// BUILD BLOCK MESSAGE
// ════════════════════════════════════════════════════════════

function buildBlockMessage(config, model, usage, reason) {
  const creditWeights = config.credit_weights || { opus: 10, sonnet: 3, haiku: 1 };
  const limits = config.limits || [];
  const lines = [reason, ""];

  // Usage summary
  const models = ["opus", "sonnet", "haiku"];
  const summaryLines = [];
  for (const m of models) {
    const used = usage[m] || 0;
    const rule = limits.find((r) => r.type === "per_model" && (r.model === m || !r.model));
    const lim = rule ? rule.value : -1;
    const limStr = lim < 0 ? "∞" : lim;
    const remaining = lim < 0 ? "∞" : Math.max(0, lim - used);
    summaryLines.push(`  ${m}: ${used}/${limStr} (${remaining} left)`);
  }

  if (summaryLines.length > 0) {
    lines.push("All usage today:", ...summaryLines, "");
  }

  // Credit balance
  const creditRule = limits.find((r) => r.type === "credits");
  if (creditRule && creditRule.value >= 0) {
    let totalCredits = 0;
    for (const [m, count] of Object.entries(usage)) {
      totalCredits += count * (creditWeights[m] || 1);
    }
    lines.push(`Credit balance: ${Math.max(0, creditRule.value - totalCredits)}/${creditRule.value}`, "");
  }

  lines.push("Options:", "  Switch to another model (if quota remains)", "  Try again later");
  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════
// KILL SWITCH — LOGOUT HELPER
// ════════════════════════════════════════════════════════════

function triggerLogout() {
  try {
    const { spawn } = require("child_process");
    const child = spawn("claude", ["auth", "logout"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    debugLog("KILL triggered claude auth logout");
  } catch (err) {
    debugLog(`KILL logout error: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════════════════

/**
 * SYNC — SessionStart hook.
 * Cache model, sync config from server.
 */
async function actionSync(config) {
  const stdinData = readStdin();
  const model = detectModel(stdinData, config);
  writeText(MODEL_FILE, model);
  debugLog(`SYNC model=${model} source=${stdinData.source || "unknown"}`);

  const serverResp = await serverRequest("/api/v1/sync", {
    model,
    hostname: os.hostname(),
    platform: process.platform,
  }, 8000);

  if (serverResp) {
    writeJSON(CACHE_FILE, serverResp);
    if (serverResp.limits) {
      const updated = { ...config, limits: serverResp.limits };
      if (serverResp.credit_weights) updated.credit_weights = serverResp.credit_weights;
      if (serverResp.status) updated.status = serverResp.status;
      writeJSON(CONFIG_FILE, updated);
    }
    debugLog(`SYNC server_response status=${serverResp.status}`);
  }
}

/**
 * CHECK — UserPromptSubmit hook.
 * Gate: block prompt if over limit.
 */
async function actionCheck(config) {
  const stdinData = readStdin();
  const model = detectModel(stdinData, config);
  const usage = loadUsage();
  debugLog(`CHECK model=${model} usage=${JSON.stringify(usage)}`);

  const serverResp = await serverRequest("/api/v1/check", {
    model,
    local_usage: usage,
  }, 3000);

  let allowed, reason;

  if (serverResp) {
    writeJSON(CACHE_FILE, serverResp);
    if (serverResp.limits) {
      const updated = { ...config, limits: serverResp.limits, status: serverResp.status };
      if (serverResp.credit_weights) updated.credit_weights = serverResp.credit_weights;
      writeJSON(CONFIG_FILE, updated);
    }
    allowed = serverResp.allowed;
    reason = serverResp.reason;

    if (serverResp.status === "killed") {
      allowed = false;
      reason = "Your Claude Code access has been revoked by the admin.\nContact your admin to restore access.";
      triggerLogout();
    }
  } else {
    // Offline: evaluate locally
    const cached = readJSON(CACHE_FILE);
    const evalConfig = cached || config;
    const result = evaluateLimitsLocally(evalConfig, model, usage);
    allowed = result.allowed;
    reason = result.reason;
    debugLog("CHECK offline_mode");
  }

  if (!allowed) {
    const fullMessage = buildBlockMessage(config, model, usage, reason);
    process.stdout.write(JSON.stringify({ decision: "block", reason: fullMessage }));
    debugLog(`CHECK BLOCKED: ${reason}`);
  }
}

/**
 * COUNT — Stop hook.
 * Increment counter, report to server.
 */
async function actionCount(config) {
  const stdinData = readStdin();
  const model = detectModel(stdinData, config);
  const usage = loadUsage();
  const prev = usage[model] || 0;
  usage[model] = prev + 1;
  saveUsage(usage);
  cleanupOldUsage();
  debugLog(`COUNT model=${model} ${prev} → ${prev + 1}`);

  // Fire and forget
  serverRequest("/api/v1/count", {
    model,
    timestamp: new Date().toISOString(),
  }, 3000);
}

/**
 * ENFORCE — PreToolUse hook.
 * Fast local-only kill/pause check. No server call.
 */
function actionEnforce() {
  const stdinData = readStdin();
  const cached = readJSON(CACHE_FILE);
  const status = (cached && cached.status) || "active";

  if (status === "killed" || status === "paused") {
    const msg = status === "killed"
      ? "Your Claude Code access has been revoked by the admin.\nContact your admin to restore access."
      : "Your Claude Code access has been paused by the admin.\nContact your admin to resume access.";
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: msg,
      },
    }));
  }
  // Active — no output = allow
}

/**
 * STATUS — Terminal command for humans.
 */
function actionStatus(config) {
  const model = detectModel({}, config);
  const usage = loadUsage();
  const userName = config.user_name || "Unknown";
  const serverConfig = readJSON(SERVER_FILE);

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║     claude-code-limiter — Status              ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`  User:          ${userName}`);
  console.log(`  Date:          ${TODAY}`);
  console.log(`  Active model:  ${model}`);
  console.log(`  Config:        ${CONFIG_FILE}`);
  if (serverConfig && serverConfig.url) console.log(`  Server:        ${serverConfig.url}`);
  console.log("");

  const limits = (config && config.limits) || [];
  const creditWeights = (config && config.credit_weights) || { opus: 10, sonnet: 3, haiku: 1 };

  if (limits.length === 0) {
    console.log("  No limits configured — unlimited mode\n");
    return;
  }

  console.log("  ┌────────────┬───────┬───────┬──────────────────────┬──────────┐");
  console.log("  │ Model      │ Used  │ Limit │ Progress             │ Left     │");
  console.log("  ├────────────┼───────┼───────┼──────────────────────┼──────────┤");

  for (const m of ["opus", "sonnet", "haiku"]) {
    const used = usage[m] || 0;
    const rule = limits.find((r) => r.type === "per_model" && (r.model === m || !r.model));
    const limit = rule ? rule.value : -1;
    let limitStr, bar, leftStr;
    if (limit < 0) {
      limitStr = "  ∞  "; bar = "  ∞ unlimited     "; leftStr = "   ∞    ";
    } else {
      const remaining = Math.max(0, limit - used);
      limitStr = String(limit).padStart(3) + "  ";
      leftStr = String(remaining).padStart(4) + "    ";
      const total = 18;
      const filled = limit > 0 ? Math.min(total, Math.round((used / limit) * total)) : 0;
      bar = "█".repeat(filled) + "░".repeat(total - filled);
    }
    console.log(`  │ ${m.padEnd(10)} │ ${String(used).padStart(3)}   │ ${limitStr} │ ${bar} │ ${leftStr} │`);
  }

  console.log("  └────────────┴───────┴───────┴──────────────────────┴──────────┘");

  const creditRule = limits.find((r) => r.type === "credits");
  if (creditRule && creditRule.value >= 0) {
    let totalCredits = 0;
    for (const [m, count] of Object.entries(usage)) {
      totalCredits += count * (creditWeights[m] || 1);
    }
    console.log(`\n  Credits: ${Math.max(0, creditRule.value - totalCredits)}/${creditRule.value} remaining`);
  }
  console.log("");
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════

async function main() {
  const action = process.argv[2] || "check";
  const config = readJSON(CONFIG_FILE);
  _debugEnabled = !!(config && config.debug);

  if (!config || Object.keys(config).length === 0) {
    if (action === "status") {
      console.log("\n  No limiter config found — unlimited mode.");
      console.log(`  Config path: ${CONFIG_FILE}\n`);
      return;
    }
    if (action !== "status") {
      // Fail-closed if server.json exists (limiter installed but config deleted)
      const serverConfig = readJSON(SERVER_FILE);
      if (serverConfig && serverConfig.url) {
        if (action === "check") {
          readStdin();
          process.stdout.write(JSON.stringify({ decision: "block", reason: "Limiter configuration missing. Contact your admin." }));
        } else if (action === "enforce") {
          readStdin();
          process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Limiter configuration missing. Contact your admin." } }));
        } else {
          readStdin();
        }
        return;
      }
      // No server.json — limiter not installed, allow
      readStdin();
    }
    return;
  }

  switch (action) {
    case "sync": await actionSync(config); break;
    case "check": await actionCheck(config); break;
    case "count": await actionCount(config); break;
    case "enforce": actionEnforce(); break;
    case "status": actionStatus(config); break;
    default:
      process.stderr.write(`claude-code-limiter hook: unknown action "${action}"\n`);
      process.exit(1);
  }
}

try {
  main().catch((err) => {
    try { fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ASYNC_ERROR: ${err.stack || err.message}\n`); } catch {}
  });
} catch (err) {
  try { fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] FATAL: ${err.stack || err.message}\n`); } catch {}
}
