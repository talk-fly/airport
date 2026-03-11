#!/bin/bash
# Airport hook: captures Claude Code session ID on SessionStart.
# Writes the session ID to a .claude-session file that Airport watches.
[ -z "$AIRPORT" ] || [ -z "$AIRPORT_STATUS_FILE" ] && exit 0

# Read stdin (hook JSON)
input=$(cat 2>/dev/null || true)
[ -z "$input" ] && exit 0

# Extract session_id from the hook JSON
session_id=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null)
[ -z "$session_id" ] && exit 0

# Write to .claude-session file next to the .status file
echo "$session_id" > "${AIRPORT_STATUS_FILE%.status}.claude-session"
