# ClawBack

Remote control [Claude Code](https://docs.anthropic.com/en/docs/claude-code) from your phone via Telegram.

ClawBack is a Telegram bot that gives you full access to Claude Code sessions from anywhere — send prompts, approve tool calls, switch models, manage projects, and stream responses in real time, all from a Telegram chat.

## Why?

Claude Code is powerful but tied to your terminal. ClawBack untethers it:

- **Work from anywhere** — queue up tasks from your phone while away from your desk
- **Monitor long-running agents** — get notified when background agents complete
- **Approve permissions on the go** — inline buttons for tool approvals, no terminal needed
- **Persistent sessions** — pick up where you left off, or resume in your terminal later

## Features

### Core
- **Multi-turn conversations** — persistent SDK sessions that stay alive between messages
- **Real-time streaming** — Claude's output streams to Telegram with live message edits
- **Permission control** — approve/deny each tool call via inline buttons, or bypass entirely
- **Background agent tracking** — auto-detects launched agents, polls for completion, notifies you

### Project & Session Management
- **Project browser** — navigate your projects directory with inline keyboards
- **Project detection** — recognizes projects by markers (`.git`, `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, etc.)
- **Session history** — list, browse, and resume previous Claude sessions
- **Teleport** — generate a command to continue any session in your terminal

### Model & Mode Switching
- **Models** — switch between Sonnet, Opus, and Haiku mid-session via inline keyboard
- **Permission modes** — `default` (approve each tool), `plan`, `acceptEdits`, `bypassPermissions`

### Skills
- **Auto-discovery** — automatically finds and registers skills from `~/.claude/skills/`
- **One-command invoke** — run `/commit`, `/verify`, `/validate`, `/review`, `/checkpoint` directly from Telegram

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed and authenticated
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Your Telegram user ID (from [@userinfobot](https://t.me/userinfobot))

### Setup

```bash
git clone https://github.com/rennanguimaraes/remote-claude.git
cd remote-claude
bun install
```

Copy the environment file and fill in your values:

```bash
cp .env.example .env
```

```env
TELEGRAM_BOT_TOKEN=your-bot-token-here
ALLOWED_USER_ID=your-telegram-user-id
PROJECTS_DIR=~/Desktop/code          # base directory where your projects live
```

### Run

```bash
bun run dev      # development with watch mode
bun run start    # production
```

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | List all commands and available skills |
| `/projects` | Browse and select a project |
| `/sessions` | List sessions for the current project |
| `/current` | Show active project, session, model, and mode |
| `/model` | Switch model (Sonnet / Opus / Haiku) |
| `/mode` | Switch permission mode |
| `/teleport` | Get a terminal command to resume the current session |
| `/cancel` | Abort the running process |
| `/exit` | End session, keep project selected |

Any free text message is sent directly to Claude as a prompt.

## How It Works

```
 Telegram                    ClawBack                     Claude Code
+---------+    message     +----------+    SDK session    +-----------+
|  Phone  | ------------> |  grammY  | ---------------> | claude    |
|  Chat   | <------------ |  Bot     | <--------------- | process   |
+---------+   streaming   +----------+   event stream   +-----------+
              edits                      (text, tools,
                                          agents)
```

1. **You send a message** in the Telegram chat
2. **ClawBack pushes it** to a persistent Claude SDK session
3. **Claude processes** and emits streaming events (text deltas, tool calls, results)
4. **ClawBack streams** the response back to Telegram with live message edits
5. **Tool calls** that need approval show inline buttons — you tap to approve or deny
6. **Background agents** are tracked automatically and trigger notifications on completion

The event loop runs fire-and-forget, so commands like `/cancel` and `/current` work instantly even while Claude is processing.

## Architecture

```
src/
  bot/
    handlers/        # command handlers (start, help, projects, sessions, etc.)
    keyboards/       # inline keyboard builders
    middleware/       # auth (user whitelist) and active-guard
    state.ts         # per-chat state management
    create-bot.ts    # bot initialization and middleware chain
  claude/
    sdk-session.ts   # persistent SDK session with message channel
    sessions.ts      # session file parsing and indexing
    projects.ts      # project listing and validation
    agent-tracker.ts # background agent polling and completion detection
  telegram/
    sender.ts        # chunked sending, safe edits
    streaming.ts     # live streaming controller with throttle
    format.ts        # markdown to HTML, escaping
  types/
    state.ts         # shared type definitions
  env.ts             # environment validation (zod)
  index.ts           # entry point
```

## Security

- **Single-user whitelist** — only your `ALLOWED_USER_ID` can interact with the bot
- **Path traversal prevention** — project navigation is sandboxed to `PROJECTS_DIR`
- **Agent output validation** — only allows reading output files from safe directories
- **Fine-grained permissions** — each tool call can require explicit approval

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | [Bun](https://bun.sh) |
| Bot framework | [grammY](https://grammy.dev) (long polling) |
| Claude integration | [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) |
| Validation | [Zod](https://zod.dev) |
| Language | TypeScript (strict mode) |

No database, no external services — just Telegram + your local Claude Code installation.

## License

[MIT](LICENSE)
