/**
 * claude-code-limiter — Installer
 * ================================
 * Handles setup, uninstall, status, and sync for the client side.
 * Cross-platform: Linux, macOS, Windows.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const http = require("http");
const readline = require("readline");
const { execSync } = require("child_process");
const crypto = require("crypto");

// ════════════════════════════════════════════════════════════
// PLATFORM CONSTANTS
// ════════════════════════════════════════════════════════════

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const IS_LINUX = process.platform === "linux";

const PATHS = (() => {
  const base = IS_WIN
    ? path.join("C:", "Program Files", "ClaudeCode")
    : IS_MAC
      ? path.join("/Library", "Application Support", "ClaudeCode")
      : "/etc/claude-code";
  const limiter = path.join(base, "limiter");
  return {
    base,
    managedSettings: path.join(base, "managed-settings.json"),
    limiterDir: limiter,
    hook: path.join(limiter, "hook.js"),
    config: path.join(limiter, "config.json"),
    server: path.join(limiter, "server.json"),
    meta: path.join(limiter, "meta.json"),
    usageDir: path.join(limiter, "usage"),
    backupDir: path.join(base, ".backup"),
    debugLog: path.join(limiter, "debug.log"),
  };
})();

// ════════════════════════════════════════════════════════════
// TERMINAL UI
// ════════════════════════════════════════════════════════════

const C = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function log(msg = "") { console.log(msg); }
function ok(msg)       { console.log(C.green(`  ✅ ${msg}`)); }
function warn(msg)     { console.log(C.yellow(`  ⚠️  ${msg}`)); }
function fail(msg)     { console.error(C.red(`  ❌ ${msg}`)); }
function info(msg)     { console.log(C.cyan(`  ℹ  ${msg}`)); }

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${C.bold(question)} `, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// ════════════════════════════════════════════════════════════
// NETWORK
// ════════════════════════════════════════════════════════════

function fetchJSON(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === "https:" ? https : http;
    const body = options.body ? JSON.stringify(options.body) : null;

    const req = client.request(urlObj, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON response")); }
      });
    });

    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Request timed out")); });
    if (body) req.write(body);
    req.end();
  });
}

// ════════════════════════════════════════════════════════════
// SAFE I/O
// ════════════════════════════════════════════════════════════

function readJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// PRIVILEGE CHECKS
// ════════════════════════════════════════════════════════════

function isElevated() {
  if (IS_WIN) {
    try { execSync("net session", { stdio: "ignore" }); return true; } catch { return false; }
  }
  return process.getuid && process.getuid() === 0;
}

function requireElevated(action) {
  if (isElevated()) return;
  log("");
  fail(`"${action}" requires elevated privileges.`);
  log("");
  if (IS_WIN) {
    info("Right-click PowerShell → 'Run as administrator', then retry.");
  } else {
    info(`Run with sudo:  sudo npx @howincodes/claude-code-limiter ${action}`);
  }
  log("");
  process.exit(1);
}

// ════════════════════════════════════════════════════════════
// MANAGED-SETTINGS.JSON GENERATOR
// ════════════════════════════════════════════════════════════

function generateManagedSettings(existingSettings) {
  const hookPath = PATHS.hook;
  const nodeCmd = IS_WIN
    ? `"${process.execPath.replace(/\\/g, "\\\\")}" "${hookPath.replace(/\\/g, "\\\\")}"`
    : `node "${hookPath}"`;

  const base = existingSettings || {};
  return {
    ...base,
    _readme: "Auto-generated by claude-code-limiter. Do not edit manually.",
    allowManagedHooksOnly: true,
    hooks: {
      ...(base.hooks || {}),
      SessionStart: [{
        matcher: "",
        hooks: [{ type: "command", command: `${nodeCmd} sync`, timeout: 10 }],
      }],
      UserPromptSubmit: [{
        hooks: [{ type: "command", command: `${nodeCmd} check`, timeout: 5 }],
      }],
      Stop: [{
        hooks: [{ type: "command", command: `${nodeCmd} count`, timeout: 5 }],
      }],
      PreToolUse: [{
        hooks: [{ type: "command", command: `${nodeCmd} enforce`, timeout: 2 }],
      }],
    },
  };
}

// ════════════════════════════════════════════════════════════
// FILE PERMISSIONS
// ════════════════════════════════════════════════════════════

function lockPermissions() {
  try {
    if (IS_WIN) {
      execSync(`icacls "${PATHS.limiterDir}" /inheritance:r /grant:r Administrators:(OI)(CI)F /grant:r Users:(OI)(CI)RX /T`, { stdio: "ignore" });
      execSync(`icacls "${PATHS.usageDir}" /grant:r Users:(OI)(CI)M`, { stdio: "ignore" });
      execSync(`icacls "${PATHS.managedSettings}" /inheritance:r /grant:r Administrators:F /grant:r Users:R`, { stdio: "ignore" });
      execSync(`icacls "${PATHS.backupDir}" /inheritance:r /grant:r Administrators:(OI)(CI)F /T`, { stdio: "ignore" });
    } else {
      const owner = IS_MAC ? "root:wheel" : "root:root";
      execSync(`chown -R ${owner} "${PATHS.limiterDir}"`, { stdio: "ignore" });
      execSync(`chmod 755 "${PATHS.limiterDir}"`, { stdio: "ignore" });
      execSync(`chmod 644 "${PATHS.hook}" "${PATHS.config}"`, { stdio: "ignore" });
      if (fs.existsSync(PATHS.server)) execSync(`chmod 644 "${PATHS.server}"`, { stdio: "ignore" });
      if (fs.existsSync(PATHS.meta)) execSync(`chmod 644 "${PATHS.meta}"`, { stdio: "ignore" });
      execSync(`chmod 1777 "${PATHS.usageDir}"`, { stdio: "ignore" });
      execSync(`chown ${owner} "${PATHS.managedSettings}" && chmod 644 "${PATHS.managedSettings}"`, { stdio: "ignore" });
      execSync(`chown -R ${owner} "${PATHS.backupDir}" && chmod -R 700 "${PATHS.backupDir}"`, { stdio: "ignore" });
    }
    ok("File permissions locked");
  } catch (err) {
    warn(`Permissions partially set: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════════
// WATCHDOG
// ════════════════════════════════════════════════════════════

function setupWatchdog() {
  if (IS_WIN) {
    const script = [
      `$b = "${PATHS.backupDir.replace(/\\/g, "\\\\")}"`,
      `$m = "${PATHS.managedSettings.replace(/\\/g, "\\\\")}"`,
      `$h = "${PATHS.hook.replace(/\\/g, "\\\\")}"`,
      `$c = "${PATHS.config.replace(/\\/g, "\\\\")}"`,
      `if (!(Test-Path $m)) { Copy-Item "$b\\managed-settings.json" $m -Force -EA SilentlyContinue }`,
      `if (!(Test-Path $h)) { Copy-Item "$b\\hook.js" $h -Force -EA SilentlyContinue }`,
      `if (!(Test-Path $c)) { Copy-Item "$b\\config.json" $c -Force -EA SilentlyContinue }`,
      `$bHash = (Get-FileHash "$b\\hook.js" -Algorithm SHA256 -EA SilentlyContinue).Hash`,
      `$hHash = (Get-FileHash $h -Algorithm SHA256 -EA SilentlyContinue).Hash`,
      `if ($bHash -and $hHash -and ($bHash -ne $hHash)) {`,
      `  Copy-Item "$b\\hook.js" $h -Force; Copy-Item "$b\\config.json" $c -Force; Copy-Item "$b\\managed-settings.json" $m -Force`,
      `}`,
    ].join("\n");
    const scriptPath = path.join(PATHS.base, "watchdog.ps1");
    fs.writeFileSync(scriptPath, script);
    try { execSync('schtasks /delete /tn "ClaudeLimiterWatchdog" /f', { stdio: "ignore" }); } catch {}
    execSync(`schtasks /create /tn "ClaudeLimiterWatchdog" /tr "powershell -NoProfile -ExecutionPolicy Bypass -File \\"${scriptPath}\\"" /sc minute /mo 5 /ru SYSTEM /f`, { stdio: "ignore" });
    ok("Watchdog scheduled task created");
  } else if (IS_MAC) {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.claude-limiter.watchdog</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>
B="${PATHS.backupDir}"; M="${PATHS.managedSettings}"; H="${PATHS.hook}"; C="${PATHS.config}"
[ ! -f "$M" ] &amp;&amp; cp "$B/managed-settings.json" "$M" 2>/dev/null
[ ! -f "$H" ] &amp;&amp; cp "$B/hook.js" "$H" 2>/dev/null
[ ! -f "$C" ] &amp;&amp; cp "$B/config.json" "$C" 2>/dev/null
BHASH=$(shasum -a 256 "$B/hook.js" 2>/dev/null | cut -d' ' -f1)
HHASH=$(shasum -a 256 "$H" 2>/dev/null | cut -d' ' -f1)
if [ -n "$BHASH" ] &amp;&amp; [ -n "$HHASH" ] &amp;&amp; [ "$BHASH" != "$HHASH" ]; then
  cp "$B/hook.js" "$H"; cp "$B/config.json" "$C"; cp "$B/managed-settings.json" "$M"
  chown root:wheel "$M" "$H" "$C"; chmod 644 "$M" "$H" "$C"
fi
    </string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>`;
    const plistPath = "/Library/LaunchDaemons/com.claude-limiter.watchdog.plist";
    fs.writeFileSync(plistPath, plist);
    try { execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: "ignore" }); } catch {}
    execSync(`launchctl load "${plistPath}"`, { stdio: "ignore" });
    ok("Watchdog launchd daemon created");
  } else {
    const service = `[Unit]\nDescription=Claude Code Limiter Watchdog\n[Service]\nType=oneshot\nExecStart=/bin/bash -c 'B="${PATHS.backupDir}"; M="${PATHS.managedSettings}"; H="${PATHS.hook}"; C="${PATHS.config}"; [ ! -f "$M" ] && cp "$B/managed-settings.json" "$M"; [ ! -f "$H" ] && cp "$B/hook.js" "$H"; [ ! -f "$C" ] && cp "$B/config.json" "$C"; BHASH=$(sha256sum "$B/hook.js" 2>/dev/null | cut -d" " -f1); HHASH=$(sha256sum "$H" 2>/dev/null | cut -d" " -f1); if [ -n "$BHASH" ] && [ -n "$HHASH" ] && [ "$BHASH" != "$HHASH" ]; then cp "$B/hook.js" "$H"; cp "$B/config.json" "$C"; cp "$B/managed-settings.json" "$M"; chown root:root "$M" "$H" "$C"; chmod 644 "$M" "$H" "$C"; fi'`;
    const timer = `[Unit]\nDescription=Claude Code Limiter Watchdog Timer\n[Timer]\nOnBootSec=1min\nOnUnitActiveSec=5min\n[Install]\nWantedBy=timers.target`;
    fs.writeFileSync("/etc/systemd/system/claude-limiter-watchdog.service", service);
    fs.writeFileSync("/etc/systemd/system/claude-limiter-watchdog.timer", timer);
    execSync("systemctl daemon-reload", { stdio: "ignore" });
    execSync("systemctl enable --now claude-limiter-watchdog.timer", { stdio: "ignore" });
    ok("Watchdog systemd timer created");
  }
}

function removeWatchdog() {
  if (IS_WIN) {
    try { execSync('schtasks /delete /tn "ClaudeLimiterWatchdog" /f', { stdio: "ignore" }); ok("Removed watchdog task"); } catch { warn("No watchdog task found"); }
    try { fs.unlinkSync(path.join(PATHS.base, "watchdog.ps1")); } catch {}
  } else if (IS_MAC) {
    const plist = "/Library/LaunchDaemons/com.claude-limiter.watchdog.plist";
    try { execSync(`launchctl unload "${plist}" 2>/dev/null`, { stdio: "ignore" }); fs.unlinkSync(plist); ok("Removed watchdog"); } catch { warn("No watchdog found"); }
  } else {
    try {
      execSync("systemctl stop claude-limiter-watchdog.timer 2>/dev/null", { stdio: "ignore" });
      execSync("systemctl disable claude-limiter-watchdog.timer 2>/dev/null", { stdio: "ignore" });
      for (const f of ["claude-limiter-watchdog.service", "claude-limiter-watchdog.timer"]) {
        try { fs.unlinkSync(`/etc/systemd/system/${f}`); } catch {}
      }
      execSync("systemctl daemon-reload 2>/dev/null", { stdio: "ignore" });
      ok("Removed watchdog");
    } catch { warn("No watchdog found"); }
  }
}

// ════════════════════════════════════════════════════════════
// BACKUP
// ════════════════════════════════════════════════════════════

function createBackup() {
  fs.mkdirSync(PATHS.backupDir, { recursive: true });
  const checksums = {};
  for (const [src, name] of [[PATHS.managedSettings, "managed-settings.json"], [PATHS.hook, "hook.js"], [PATHS.config, "config.json"]]) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(PATHS.backupDir, name));
      const hash = crypto.createHash("sha256").update(fs.readFileSync(src)).digest("hex");
      checksums[name] = hash;
    }
  }
  fs.writeFileSync(path.join(PATHS.backupDir, "checksums.json"), JSON.stringify(checksums, null, 2));
  ok("Backup created");
}

// ════════════════════════════════════════════════════════════
// SETUP
// ════════════════════════════════════════════════════════════

async function setup(flags) {
  requireElevated("setup");

  log("");
  log(C.bold("  ╔══════════════════════════════════════════╗"));
  log(C.bold("  ║   Claude Code Limiter — Setup            ║"));
  log(C.bold("  ╚══════════════════════════════════════════╝"));
  log("");

  // ── Pre-flight: Check Claude Code is installed and authenticated ──
  // sudo resets PATH, so "which claude" fails even if claude is installed.
  // Check common install locations + the invoking user's home directory.
  let claudePath;
  const homeDir = process.env.SUDO_USER
    ? path.join(IS_WIN ? process.env.USERPROFILE || "" : `/home/${process.env.SUDO_USER}`)
    : os.homedir();
  const candidatePaths = [
    // Standard locations
    ...(IS_WIN ? [] : [
      path.join(homeDir, ".local", "bin", "claude"),
      "/usr/local/bin/claude",
      "/usr/bin/claude",
      path.join(os.homedir(), ".local", "bin", "claude"),
    ]),
    ...(IS_WIN ? [
      path.join(process.env.LOCALAPPDATA || "", "Programs", "claude", "claude.exe"),
      path.join(process.env.PROGRAMFILES || "", "Claude", "claude.exe"),
    ] : []),
  ];

  // Try which/where first (works if PATH is correct)
  try {
    claudePath = execSync("which claude 2>/dev/null || where claude 2>nul", { encoding: "utf-8" }).trim();
  } catch {}

  // Fall back to known paths
  if (!claudePath) {
    for (const p of candidatePaths) {
      if (p && fs.existsSync(p)) { claudePath = p; break; }
    }
  }

  if (!claudePath) {
    fail("Claude Code is not installed on this machine.");
    log("");
    info("Install it first: https://code.claude.com");
    if (process.env.SUDO_USER) {
      info(`Looked in: ${path.join(homeDir, ".local", "bin", "claude")}`);
      info("If Claude is installed elsewhere, add it to PATH and retry.");
    }
    log("");
    process.exit(1);
  }
  ok(`Claude Code found: ${claudePath}`);

  // Run auth status as the actual user, not root.
  // sudo sets SUDO_USER — use it to run claude as the real user.
  let authStatus;
  try {
    let authCmd = `"${claudePath}" auth status`;
    if (process.env.SUDO_USER) {
      authCmd = `su - ${process.env.SUDO_USER} -c '"${claudePath}" auth status'`;
    }
    authStatus = JSON.parse(execSync(authCmd, { encoding: "utf-8" }).trim());
  } catch {
    authStatus = null;
  }

  if (!authStatus || !authStatus.loggedIn) {
    fail("Claude Code is not logged in.");
    log("");
    info("Log in first:  claude auth login");
    log("");
    process.exit(1);
  }
  ok(`Logged in as: ${authStatus.email || "unknown"} (${authStatus.subscriptionType || "unknown"} plan)`);

  // Detect default model from subscription type
  const subscriptionType = authStatus.subscriptionType || "pro";
  const defaultModel = subscriptionType === "max" ? "opus" : "sonnet";
  info(`Plan default model: ${defaultModel}`);

  // ── Check for existing installation ──
  const existingServer = readJSON(PATHS.server);
  const existingConfig = readJSON(PATHS.config);
  let auth_token, user_name, limits, credit_weights, status;
  let freshServerUrl = null;

  if (existingServer && existingServer.auth_token && existingConfig) {
    // Already installed — offer to reinstall with existing credentials
    log("");
    warn(`Limiter already installed for "${existingConfig.user_name || "unknown"}".`);
    info(`Server: ${existingServer.url}`);

    if (!flags.yes) {
      const choice = await ask("Reinstall with existing config? (y/N):");
      if (!choice.match(/^y(es)?$/i)) {
        log("\n  Cancelled. Use --code to set up a different user.\n");
        process.exit(0);
      }
    }

    // Re-fetch latest config from server
    log("");
    info("Syncing with server...");
    let serverUrl = flags.server || existingServer.url;
    try {
      const resp = await fetchJSON(`${serverUrl}/api/v1/status`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${existingServer.auth_token}` },
      });
      auth_token = existingServer.auth_token;
      user_name = (resp.user && resp.user.name) || existingConfig.user_name;
      limits = resp.limits || existingConfig.limits;
      credit_weights = resp.credit_weights || existingConfig.credit_weights;
      status = (resp.user && resp.user.status) || "active";
      ok(`Synced as "${user_name}" (${status})`);
    } catch {
      // Server unreachable — use cached config
      auth_token = existingServer.auth_token;
      user_name = existingConfig.user_name;
      limits = existingConfig.limits;
      credit_weights = existingConfig.credit_weights;
      status = existingConfig.status || "active";
      warn("Server unreachable — reinstalling with cached config.");
    }
  } else {
    // Fresh install — need code and server
    let code = flags.code;
    freshServerUrl = flags.server;

    if (!code) code = await ask("Install code:");
    if (!freshServerUrl) freshServerUrl = await ask("Server URL:");

    if (!code || !freshServerUrl) {
      fail("Install code and server URL are required.");
      process.exit(1);
    }

    // Normalize server URL
    freshServerUrl = freshServerUrl.replace(/\/+$/, "");

    log("");
    info("Registering with server...");

    let registration;
    try {
      registration = await fetchJSON(`${freshServerUrl}/api/v1/register`, {
        method: "POST",
        body: { code },
      });
    } catch (err) {
      fail(`Registration failed: ${err.message}`);
      process.exit(1);
    }

    if (!registration || !registration.auth_token) {
      fail("Invalid server response — missing auth_token.");
      process.exit(1);
    }

    auth_token = registration.auth_token;
    user_name = registration.user_name;
    limits = registration.limits;
    credit_weights = registration.credit_weights;
    status = registration.status;
    ok(`Registered as "${user_name}"`);
  }

  const serverUrl = freshServerUrl || flags.server || (existingServer && existingServer.url) || "";

  // Show limits
  info("Limits:");
  for (const rule of (limits || [])) {
    if (rule.type === "per_model") {
      log(`     ${rule.model || "all"}: ${rule.value < 0 ? "∞" : rule.value}/${rule.window || "daily"}`);
    } else if (rule.type === "credits") {
      log(`     credits: ${rule.value}/${rule.window || "daily"}`);
    } else if (rule.type === "time_of_day") {
      log(`     ${rule.model || "all"}: ${rule.schedule_start}-${rule.schedule_end} (${rule.schedule_tz || "local"})`);
    }
  }

  if (!flags.yes) {
    log("");
    const confirm = await ask("Proceed with installation? (y/N):");
    if (!confirm.match(/^y(es)?$/i)) { log("\n  Cancelled.\n"); process.exit(0); }
  }

  log("");
  info("Installing...");
  log("");

  // Create directories
  for (const dir of [PATHS.limiterDir, PATHS.usageDir, PATHS.backupDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Copy hook script
  const hookSource = path.join(__dirname, "hook.js");
  fs.copyFileSync(hookSource, PATHS.hook);
  ok(`Hook → ${PATHS.hook}`);

  // Write config
  const localConfig = {
    user_name,
    status: status || "active",
    debug: false,
    defaultModel,
    subscriptionType,
    limits: limits || [],
    credit_weights: credit_weights || { opus: 10, sonnet: 3, haiku: 1 },
  };
  fs.writeFileSync(PATHS.config, JSON.stringify(localConfig, null, 2));
  ok(`Config → ${PATHS.config}`);

  // Write server connection info
  const serverConfig = { url: serverUrl, auth_token };
  fs.writeFileSync(PATHS.server, JSON.stringify(serverConfig, null, 2));
  ok(`Server → ${PATHS.server}`);

  // Write meta
  const meta = {
    serverUrl,
    installedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  };
  fs.writeFileSync(PATHS.meta, JSON.stringify(meta, null, 2));

  // Generate managed-settings.json
  let existingMS = null;
  try { existingMS = JSON.parse(fs.readFileSync(PATHS.managedSettings, "utf-8")); } catch {}
  const managedSettings = generateManagedSettings(existingMS);
  fs.writeFileSync(PATHS.managedSettings, JSON.stringify(managedSettings, null, 2));
  ok(`Managed settings → ${PATHS.managedSettings}`);
  ok("allowManagedHooksOnly: true");

  // Backup
  createBackup();

  // Permissions
  lockPermissions();

  // Watchdog
  setupWatchdog();

  log("");
  log(C.green(C.bold("  Installation complete!")));
  log("");
  log("  Enforcement layers:");
  log("    1. managed-settings.json  (highest priority)");
  log("    2. allowManagedHooksOnly  (user hooks blocked)");
  log(`    3. File permissions        (${IS_WIN ? "admin" : "root"}-only write)`);
  log("    4. Watchdog               (auto-restores every 5 min)");
  log("    5. Server-side tracking   (tamper-proof usage)");
  log("");
  log(C.yellow("  Restart Claude Code for hooks to take effect."));
  log("");
}

// ════════════════════════════════════════════════════════════
// UNINSTALL
// ════════════════════════════════════════════════════════════

async function uninstall(flags) {
  requireElevated("uninstall");
  log("");
  log(C.bold("  Uninstalling Claude Code Limiter"));
  log("");

  if (!flags.yes) {
    const confirm = await ask("Remove all limiter files and watchdog? (y/N):");
    if (!confirm.match(/^y(es)?$/i)) { log("\n  Cancelled.\n"); return; }
    log("");
  }

  removeWatchdog();

  for (const p of [PATHS.limiterDir, PATHS.backupDir]) {
    try { fs.rmSync(p, { recursive: true, force: true }); ok(`Removed ${p}`); } catch { warn(`Could not remove ${p}`); }
  }

  try {
    const ms = JSON.parse(fs.readFileSync(PATHS.managedSettings, "utf-8"));
    if (ms._readme && ms._readme.includes("claude-code-limiter")) {
      fs.unlinkSync(PATHS.managedSettings);
      ok(`Removed ${PATHS.managedSettings}`);
    } else {
      delete ms.allowManagedHooksOnly;
      delete ms._readme;
      if (ms.hooks) {
        delete ms.hooks.SessionStart;
        delete ms.hooks.UserPromptSubmit;
        delete ms.hooks.Stop;
        delete ms.hooks.PreToolUse;
        if (Object.keys(ms.hooks).length === 0) delete ms.hooks;
      }
      fs.writeFileSync(PATHS.managedSettings, JSON.stringify(ms, null, 2));
      ok(`Cleaned limiter hooks from managed-settings`);
    }
  } catch { warn(`Could not clean ${PATHS.managedSettings}`); }

  log("");
  log(C.green("  Done. Restart Claude Code for changes to take effect."));
  log("");
}

// ════════════════════════════════════════════════════════════
// STATUS
// ════════════════════════════════════════════════════════════

function status() {
  if (!fs.existsSync(PATHS.hook)) {
    log("");
    warn("Limiter not installed on this machine.");
    log(C.dim(`  Expected hook at: ${PATHS.hook}`));
    log(C.dim("  Run: sudo npx @howincodes/claude-code-limiter setup"));
    log("");
    return;
  }
  try { execSync(`node "${PATHS.hook}" status`, { stdio: "inherit" }); } catch { fail("Could not run status"); }
}

// ════════════════════════════════════════════════════════════
// SYNC
// ════════════════════════════════════════════════════════════

async function sync(flags) {
  requireElevated("sync");
  if (!fs.existsSync(PATHS.hook)) { fail("Limiter not installed."); process.exit(1); }

  info("Syncing with server...");
  try {
    execSync(`node "${PATHS.hook}" sync < /dev/null`, { stdio: "inherit" });
    ok("Sync complete.");
  } catch { fail("Sync failed."); }
}

// ════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════

module.exports = { setup, uninstall, status, sync };
