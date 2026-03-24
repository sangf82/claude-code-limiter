#!/usr/bin/env node
/**
 * Model Detection Probe — checks every possible source of model info.
 * Run this from a hook or directly to see what's available.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const LOG_DIR = path.join(__dirname, "logs");
const label = process.argv[2] || "probe";
fs.mkdirSync(LOG_DIR, { recursive: true });

const results = {};

// ── 1. Stdin (hook input) ──
try {
  if (!process.stdin.isTTY) {
    const raw = fs.readFileSync(0, "utf-8").trim();
    const parsed = JSON.parse(raw);
    results.stdin_model = parsed.model || null;
    results.stdin_session_id = parsed.session_id || null;
    results.stdin_transcript = parsed.transcript_path || null;
    results.stdin_all_keys = Object.keys(parsed);
  }
} catch { results.stdin = "not available or not JSON"; }

// ── 2. Environment variables ──
results.env = {
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || null,
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || null,
  CLAUDE_CODE_MODEL: process.env.CLAUDE_CODE_MODEL || null,
  MODEL: process.env.MODEL || null,
};

// ── 3. ~/.claude/settings.json ──
try {
  const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf-8"));
  results.user_settings_model = s.model || null;
} catch { results.user_settings_model = "file not readable"; }

// ── 4. ~/.claude/settings.local.json ──
try {
  const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "settings.local.json"), "utf-8"));
  results.local_settings_model = s.model || null;
} catch { results.local_settings_model = "file not readable or missing"; }

// ── 5. .claude/settings.json (project) ──
try {
  const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".claude", "settings.json"), "utf-8"));
  results.project_settings_model = s.model || null;
} catch { results.project_settings_model = "file not readable or missing"; }

// ── 6. ~/.claude.json (main config) ──
try {
  const raw = fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf-8");
  const cfg = JSON.parse(raw);
  results.claude_json_model = cfg.model || null;
  // Search for any key containing "model"
  const modelKeys = {};
  const searchObj = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase().includes("model")) modelKeys[prefix + k] = v;
      if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length < 50) {
        searchObj(v, prefix + k + ".");
      }
    }
  };
  searchObj(cfg, "");
  results.claude_json_model_keys = Object.keys(modelKeys).length > 0 ? modelKeys : "none found";
} catch (e) { results.claude_json = "error: " + e.message; }

// ── 7. Session files in ~/.claude/sessions/ ──
try {
  const sessDir = path.join(os.homedir(), ".claude", "sessions");
  const files = fs.readdirSync(sessDir).filter(f => f.endsWith(".json")).sort();
  results.session_files = {};
  for (const f of files.slice(-5)) { // last 5
    try {
      const data = JSON.parse(fs.readFileSync(path.join(sessDir, f), "utf-8"));
      results.session_files[f] = data;
    } catch {}
  }
} catch { results.session_files = "not readable"; }

// ── 8. Transcript file (last 20 lines) ──
try {
  if (results.stdin_transcript && fs.existsSync(results.stdin_transcript)) {
    const lines = fs.readFileSync(results.stdin_transcript, "utf-8").split("\n").filter(Boolean);
    const modelRefs = [];
    for (const line of lines.slice(-50)) {
      try {
        const obj = JSON.parse(line);
        if (obj.model) modelRefs.push({ model: obj.model, type: obj.type || obj.role });
        // Deep search for model field
        const str = line;
        const modelMatch = str.match(/"model"\s*:\s*"([^"]+)"/g);
        if (modelMatch) modelRefs.push(...modelMatch.map(m => ({ raw: m })));
      } catch {}
    }
    // deduplicate
    const seen = new Set();
    results.transcript_models = modelRefs.filter(m => {
      const key = JSON.stringify(m);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    results.transcript_total_lines = lines.length;
  }
} catch (e) { results.transcript = "error: " + e.message; }

// ── 9. claude auth status ──
try {
  const out = execSync("claude auth status 2>&1", { encoding: "utf-8", timeout: 5000 });
  try {
    results.auth_status = JSON.parse(out);
  } catch {
    results.auth_status = out.trim().slice(0, 500);
  }
} catch (e) { results.auth_status = "error: " + e.message; }

// ── 10. Running claude processes — check args ──
try {
  const ps = execSync("ps aux | grep -i claude | grep -v grep", { encoding: "utf-8", timeout: 3000 });
  const lines = ps.trim().split("\n");
  results.claude_processes = lines.map(l => {
    // Extract just the command part (after the PID columns)
    const parts = l.trim().split(/\s+/);
    return parts.slice(10).join(" ").slice(0, 300);
  });
} catch { results.claude_processes = "none found"; }

// ── 11. Check managed-settings.json ──
try {
  const managedPath = "/Library/Application Support/ClaudeCode/managed-settings.json";
  if (fs.existsSync(managedPath)) {
    const ms = JSON.parse(fs.readFileSync(managedPath, "utf-8"));
    results.managed_settings_model = ms.model || null;
  } else {
    results.managed_settings = "file does not exist";
  }
} catch (e) { results.managed_settings = "error: " + e.message; }

// ── 12. Check all env vars with "model" or "claude" in name ──
const relevantEnv = {};
for (const [k, v] of Object.entries(process.env)) {
  if (k.toLowerCase().includes("model") || k.toLowerCase().includes("claude") || k.toLowerCase().includes("anthropic")) {
    relevantEnv[k] = v;
  }
}
results.relevant_env_vars = Object.keys(relevantEnv).length > 0 ? relevantEnv : "none found";

// ── Write results ──
const logFile = path.join(LOG_DIR, `model-probe-${label}.json`);
fs.writeFileSync(logFile, JSON.stringify(results, null, 2));
console.error(`Model probe written to ${logFile}`);
process.exit(0);
