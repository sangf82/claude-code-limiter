#!/usr/bin/env node
/**
 * Test hook — logs everything it receives to a file.
 * Always exits 0 (allow) so it never blocks Claude Code.
 */
const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "logs");
const action = process.argv[2] || "unknown";

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {}

// Read stdin
let stdin = "";
try {
  if (!process.stdin.isTTY) {
    stdin = fs.readFileSync(0, "utf-8").trim();
  }
} catch {}

let parsed = null;
try {
  parsed = JSON.parse(stdin);
} catch {}

const entry = {
  timestamp: new Date().toISOString(),
  action,
  pid: process.pid,
  raw_stdin: stdin.slice(0, 5000),
  parsed_stdin: parsed,
  env: {
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || null,
    CLAUDE_MODEL: process.env.CLAUDE_MODEL || null,
    CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR || null,
  },
};

const logFile = path.join(LOG_DIR, `${action}.jsonl`);
fs.appendFileSync(logFile, JSON.stringify(entry, null, 2) + "\n---\n");

// Always allow — never block
process.exit(0);
