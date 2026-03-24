#!/usr/bin/env node
/**
 * Test: Can UserPromptSubmit block a prompt?
 * Blocks every OTHER prompt with a rate-limit-style message.
 */
const fs = require("fs");
const path = require("path");

const COUNTER_FILE = path.join(__dirname, "logs", "block-counter.txt");
const LOG_FILE = path.join(__dirname, "logs", "block-test.jsonl");

// Read stdin
let stdin = {};
try {
  if (!process.stdin.isTTY) {
    stdin = JSON.parse(fs.readFileSync(0, "utf-8").trim());
  }
} catch {}

// Read and increment counter
let count = 0;
try { count = parseInt(fs.readFileSync(COUNTER_FILE, "utf-8").trim()) || 0; } catch {}
count++;
try { fs.writeFileSync(COUNTER_FILE, String(count)); } catch {}

const shouldBlock = count % 2 === 0; // block every 2nd prompt

// Log
const entry = {
  timestamp: new Date().toISOString(),
  count,
  shouldBlock,
  prompt: (stdin.prompt || "").slice(0, 100),
};
try {
  fs.mkdirSync(path.join(__dirname, "logs"), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
} catch {}

if (shouldBlock) {
  // Try the documented block format for UserPromptSubmit
  const response = {
    decision: "block",
    reason: [
      "⛔ TEST BLOCK — Daily sonnet limit reached for TestUser.",
      "   Used 20/20 prompts today.",
      "",
      "📊 All usage today:",
      "  haiku:  12/40 (28 left)",
      "  opus:    5/5  (0 left)",
      "  sonnet: 20/20 (0 left)",
      "",
      "💡 Switch to another model or try again tomorrow.",
      "",
      "(This is a TEST — prompt #" + count + " was blocked. Next prompt will be allowed.)",
    ].join("\n"),
  };
  process.stdout.write(JSON.stringify(response));
}

// exit 0 always — block is signaled via JSON, not exit code
process.exit(0);
