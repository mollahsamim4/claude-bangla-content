# Changelog

## 2.1.319
- Changed auto mode with telemetry or feature flags off, including behind LLM gateways: calls the server can't check are asked about or denied, with no fallback to the built-in classifier; set `CLAUDE_CODE_AUTO_MODE_SERVER=0` to keep using it (Bedrock, Vertex and Foundry are unchanged)
- Changed auto mode behind an LLM gateway: `CLAUDE_CODE_AUTO_MODE_SERVER=1` turns on the server-side check even with `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` set; if managed settings set the latter, they must set the `1` too
- Added support for MCP tasks in the terminal: when an MCP server runs a tool call as a task, Claude Code moves it to the background right away and tells Claude the result when it finishes
- Added the `CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND` environment variable to make Claude Code wait for an MCP task inside its tool call instead of moving it to the background right away

## 2.1.318
- Added a record of your answer when Claude Code asks to turn on the mods it writes in a session
- Added `assume_role` on `mantle` upstreams of the Claude apps gateway, for a role in another AWS account and for per-developer AWS cost attribution
- Added an `effort` option to a mod's `$.model.fork`, so a quick side job can run at `low` whatever effort the session uses; the result reports the effort sent
- Added the date a stored claude.ai sign-in ends to `claude auth status` (`loginExpiresAt`) and to `claude -p` JSON results (`credential_expires_at`)

## 2.1.317
- Added a warning to `/schedule` when a new cloud scheduled task gets connectors you did not ask for, with how to remove them
- Added a check that asks before a web or shell tool call sends your account email address to the network
- Added `onFailure: "block"` for Agent SDK hook callbacks, so a callback that fails blocks the action instead of letting it run
- Added a notice in Claude Desktop's Code tab when your organization's remote managed settings haven't loaded for the session, and another once they do

## 2.1.316
- Added `CLAUDE_CODE_DISABLE_ULTRATHINK`, which turns the `ultrathink` keyword off
- Added pooled group budgets to the Claude apps gateway: one monthly budget that a group's members share, on top of each member's own limit, set with `pooled_budget` on the spend limits admin API
- Added `CLAUDE_CODE_DISABLE_LOOPED_CROSS_CERT_DROP` to keep system cross-certificates that certify each other in a loop, for servers whose private CA needs one
- Added `CLAUDE_CODE_SUBAGENT_EFFORT` to set the effort level subagents run at when nothing else names one, instead of inheriting the session's


- New /approved-tools command for managing tool permissions
- Word-level diff display for improved code readability
- Fuzzy matching for slash commands

## 0.2.21

- Fuzzy matching for /commands
