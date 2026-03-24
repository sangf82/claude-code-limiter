# Rollback Guide — Assumption Tests

If anything goes wrong during testing, follow these steps to restore your Claude Code to its original state.

## What We Changed

1. **`~/.claude/settings.json`** — added 4 test hooks (SessionStart, UserPromptSubmit, PreToolUse, Stop)
2. **`/Library/Application Support/ClaudeCode/managed-settings.json`** — created (only if we reach that test)
3. **Test files** at `/Users/basha/Documents/Howin/claudelimiter/tests/assumptions/`

## Quick Fix: Remove Test Hooks from User Settings

If Claude Code is behaving strangely after adding test hooks:

```bash
# Open settings in your editor
nano ~/.claude/settings.json
# OR
code ~/.claude/settings.json
```

Delete these hook entries (keep your original Stop, Notification, PermissionRequest hooks):
- `SessionStart` block that references `log-hook.js`
- `UserPromptSubmit` block that references `log-hook.js`
- `PreToolUse` block that references `log-hook.js`
- The second `Stop` entry that references `log-hook.js` (keep your original with `afplay`)

## Full Restore: Replace settings.json Entirely

Your original settings.json is backed up at:
```
/Users/basha/Documents/Howin/claudelimiter/tests/assumptions/backups/settings.json.backup
```

To restore:
```bash
cp /Users/basha/Documents/Howin/claudelimiter/tests/assumptions/backups/settings.json.backup ~/.claude/settings.json
```

## Remove Managed Settings (if created)

Only needed if we reached the managed-settings.json test:

```bash
sudo rm /Library/Application\ Support/ClaudeCode/managed-settings.json
```

## Clean Up Test Files

```bash
# Remove all test logs
rm -rf /Users/basha/Documents/Howin/claudelimiter/tests/assumptions/logs/

# Remove all test files (optional — only if you're done testing)
rm -rf /Users/basha/Documents/Howin/claudelimiter/tests/assumptions/
```

## Nuclear Option: If Claude Code Won't Start

If hooks are crashing and Claude Code is unusable:

```bash
# 1. Remove ALL hooks from settings
# Edit ~/.claude/settings.json and delete the entire "hooks" key
nano ~/.claude/settings.json

# 2. Or just restore the backup
cp /Users/basha/Documents/Howin/claudelimiter/tests/assumptions/backups/settings.json.backup ~/.claude/settings.json

# 3. If managed-settings.json is the problem
sudo rm "/Library/Application Support/ClaudeCode/managed-settings.json"

# 4. Restart Claude Code
claude
```

## Checklist of Assumptions Being Tested

| # | Assumption | Test | Status |
|---|-----------|------|--------|
| 1 | SessionStart hook receives `model` in stdin | Log SessionStart stdin | CONFIRMED — `"model": "claude-opus-4-6[1m]"` |
| 2 | UserPromptSubmit fires once per user prompt | Count log entries vs prompts sent | CONFIRMED — 1 entry per prompt |
| 3 | PreToolUse fires per tool call (not per prompt) | Count log entries vs tool calls | CONFIRMED — 3 entries for 3 tools in 1 prompt |
| 4 | Stop fires once per agent turn | Count log entries | CONFIRMED — 1 entry per turn |
| 5 | PreToolUse receives `tool_name` and `tool_input` | Inspect log | CONFIRMED — full tool details |
| 6 | UserPromptSubmit can return `decision: "block"` | Test with blocking hook | CONFIRMED — blocks with custom message, shows emojis, multi-line |
| 7 | PreToolUse can return `permissionDecision: "deny"` | Test with deny hook | PENDING |
| 8 | managed-settings.json at correct macOS path works | Install and test | PENDING (path confirmed: `/Library/Application Support/ClaudeCode/`) |
| 9 | `allowManagedHooksOnly: true` blocks user hooks | Enable and verify | PENDING |
| 10 | `claude auth logout` works from a hook | Test programmatically | PENDING |
| 11 | Hook can make HTTP requests (Node.js built-ins) | Test with local server | PENDING |
| 12 | stop_hook_active field present in Stop stdin | Inspect log | CONFIRMED — `"stop_hook_active": false` |
| 13 | `/model` changes are detectable by hooks | Model probe script | CONFIRMED — writes `model` key to `~/.claude/settings.json`; opus removes the key (default) |
| 14 | ConfigChange fires on `/model` switch | Log ConfigChange | PARTIALLY — fires because settings.json changed, but no model field in ConfigChange data |
| 15 | UserPromptSubmit does NOT receive model in stdin | Log stdin keys | CONFIRMED — only: session_id, transcript_path, cwd, permission_mode, hook_event_name, prompt |
| 16 | Stop does NOT receive model in stdin | Log stdin keys | CONFIRMED — only: session_id, transcript_path, cwd, permission_mode, hook_event_name, stop_hook_active, last_assistant_message |
