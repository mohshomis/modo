<p align="center">
  <img src="src/vs/workbench/browser/parts/editor/media/modo_logo.svg" alt="Modo" width="120" />
</p>

<h1 align="center">Modo</h1>

<p align="center">
  The open-source AI IDE that plans before it codes.
</p>

<p align="center">
  <a href="https://github.com/modoeditor/modo/blob/main/LICENSE.txt">MIT License</a> · <a href="#quick-start">Quick Start</a> · <a href="#what-modo-adds">What Modo Adds</a> · <a href="#contributing">Contributing</a>
</p>

---

I wanted a small feature in an AI coding tool. Couldn't find a way to suggest it. So I asked myself: how hard is it to actually build something like Kiro, Cursor, or Windsurf?

Turns out — not as hard as you'd think. Starting from the [Void](https://github.com/voideditor/void) editor (itself a fork of VS Code), I got to roughly 60–70% of what those tools offer in a short stretch of building. It was genuinely fun.

This is Modo. A standalone desktop IDE where prompts become structured plans before they become code. Open source, MIT licensed, yours to hack on.

## What Modo Adds

Everything below was built on top of Void's existing AI chat, inline edit (Cmd+K), autocomplete, multi-provider LLM support, tool use, and MCP integration. Here's what's new:

### Spec-Driven Development

Most AI tools go prompt → code. Modo goes prompt → requirements → design → tasks → code.

A spec lives in `.modo/specs/<name>/` as three markdown files:

```
.modo/specs/auth-flow/
├── requirements.md     # user stories, acceptance criteria
├── design.md           # architecture, components, data models
└── tasks.md            # checklist of implementation steps
```

Create one with `Cmd+Shift+S` or by picking Spec mode in the session picker. Choose feature or bugfix, then requirements-first or design-first workflow. The agent fills each document, you review, then it executes tasks one by one — marking them done as it goes.

Tasks persist to disk. Close the IDE, come back, pick up where you left off.

### Task CodeLens

Open any `tasks.md` and each pending task gets a clickable "▶ Run Task" button inline. A "Run All Pending Tasks" button appears at the top. Running tasks show a spinner, completed ones show a checkmark. The agent marks `- [ ]` → `- [~]` → `- [x]` as it works.

### Steering Files

Markdown documents in `.modo/steering/` that inject project rules into every AI interaction — no need to repeat yourself.

```markdown
---
inclusion: always
---
# Project Rules
- Use TypeScript strict mode
- All endpoints need input validation
```

Three inclusion modes:
- `always` — every interaction
- `fileMatch` — when the active file matches a glob pattern
- `manual` — referenced via `/` commands in chat

Supports `#[[file:path]]` references to link OpenAPI specs, GraphQL schemas, or any project doc.

### Agent Hooks

JSON configs in `.modo/hooks/` that automate actions around the agent lifecycle.

```json
{
  "name": "Lint on Save",
  "version": "1.0.0",
  "when": { "type": "fileEdited", "patterns": ["**/*.ts"] },
  "then": { "type": "runCommand", "command": "npx eslint --fix ${filePath}" }
}
```

10 event types: `fileEdited`, `fileCreated`, `fileDeleted`, `promptSubmit`, `agentStop`, `preToolUse`, `postToolUse`, `preTaskExecution`, `postTaskExecution`, `userTriggered`. Two action types: `askAgent` or `runCommand`. Pre-tool hooks can deny execution. Circular dependency detection built in.

### Autopilot / Supervised Toggle

A status bar pill that switches between Autopilot (agent acts autonomously) and Supervised (agent pauses for approval). Wired directly to auto-approve settings for edits, terminal commands, and MCP tools.

### Parallel Chat Sessions

Multiple chat sessions as tabs. Each has its own thread, context, and history. Open new ones, close old ones, or run them all at once. A searchable history panel lets you find past conversations.

### Vibe and Spec Modes

Start a session in Vibe mode for free-form exploration, or Spec mode for structured development. In Spec mode, your prompt triggers the full requirements → design → tasks workflow. The active spec's content is automatically injected into the LLM system prompt.

### Subagents

Spawn parallel agents for independent subtasks. Each gets its own thread and tool access. Track status, cancel running tasks, or clear completed ones.

### Powers

Installable knowledge packages that bundle documentation, steering files, and MCP configs. Built-in powers for TypeScript, React, Testing, API Design, and Docker. Activate based on keywords in your prompts. Install custom powers from URLs.

### Dedicated Explorer Pane

A sidebar with collapsible sections for Specs (with progress bars and task counts), Agent Hooks (showing event → action flow), Steering (showing inclusion mode), and Powers.

### Slash Commands

Type `/` in chat to access manual hooks, steering files, and built-in commands: create spec, run tasks, export conversation, initialize workspace.

### Context Injection

Steering files and the active spec are automatically prepended to every LLM interaction. The agent follows your project rules and knows what it's building without being told each time.

### Custom Dark Theme

A purpose-built "Modo Dark" theme with teal accents, tuned syntax highlighting, and terminal colors.

### Companion Character

A Modo avatar appears before each response with randomized expressions during streaming and a calm default after completion.

### Full Rebranding

Custom app icon, window title, watermark logo, product identity, URL protocol (`modo://`), and data directories (`.modo-editor/`). All Void references in the UI replaced with Modo equivalents.

### Workspace Initialization

`Modo: Initialize Workspace` creates the full `.modo/` directory structure with default steering files and config templates.

### Export

Export any conversation as Markdown to clipboard from the command palette.


## Built On

Modo wouldn't exist without these projects:

| Project | What it provides | License |
|---|---|---|
| [Void](https://github.com/voideditor/void) | AI chat, inline edit, autocomplete, multi-provider LLM, tool use, MCP, apply engine | MIT |
| [VS Code](https://github.com/microsoft/vscode) | Editor core, extension system, terminal, file system, everything underneath | MIT |
| [Roo Code](https://github.com/RooCodeInc/Roo-Code) | Some patterns referenced during development | Apache 2.0 |

Void itself provides: multi-provider support (Anthropic, OpenAI, Gemini, Ollama, Mistral, Groq, OpenRouter), chat sidebar, Cmd+K inline editing, autocomplete, fast/slow apply, tool calling, MCP integration, SCM integration, and the settings system.

Modo adds everything in the [What Modo Adds](#what-modo-adds) section on top of that foundation.


## Quick Start

```bash
git clone https://github.com/modoeditor/modo.git
cd modo
npm install          # requires Node 20
npm run buildreact   # compile React UI
npm run watch        # compile TypeScript (keep running in a terminal)
./scripts/code.sh    # launch Modo
```

On first launch, onboarding walks you through connecting a model provider. Gemini free tier is the fastest way to start.


## Project Structure

```
.modo/                          # per-project config (created by "Initialize Workspace")
├── steering/                   # markdown rules injected into AI context
├── specs/                      # structured feature/bugfix workflows
├── hooks/                      # JSON event → action automation
└── settings/                   # MCP and other configs

src/vs/workbench/contrib/void/
├── common/
│   ├── modoSpecService.ts      # spec CRUD, task parsing, context building
│   ├── modoSteeringService.ts  # steering file loading, front-matter parsing, context assembly
│   ├── modoHookService.ts      # hook loading, validation, event matching, firing
│   ├── modoPowersService.ts    # powers registry, activation, keyword matching
│   └── modoSubagentService.ts  # parallel agent spawning and lifecycle
├── browser/
│   ├── modoExplorerPane.ts     # sidebar views for specs, hooks, steering, powers
│   ├── modoSpecActions.ts      # create spec, run tasks, open files commands
│   ├── modoTaskCodeLens.ts     # inline Run Task / Done buttons in tasks.md
│   ├── modoSlashCommands.ts    # / command picker, export, session management
│   ├── modoStatusBar.ts        # autopilot toggle, active spec indicator
│   ├── modoHookWiring.ts       # file change events → hook system
│   └── react/src/
│       ├── sidebar-tsx/         # session tabs, history, vibe/spec mode, autopilot switch
│       ├── modo-spec-panel/     # spec management React UI
│       └── modo-hooks-panel/    # hook management React UI
└── extensions/
    └── modo-theme/              # custom dark theme with teal accents
```


## Commands

| Command | Shortcut | Description |
|---|---|---|
| Create Spec | `Cmd+Shift+S` | New spec (feature/bugfix, req-first/design-first) |
| Run Next Task | — | Execute next pending spec task |
| Run All Tasks | — | Execute all remaining tasks |
| Open Spec Files | — | Open requirements, design, tasks in editor |
| Inject Spec Context | — | Load spec context into chat |
| Reload Spec | — | Re-read spec files from disk |
| Initialize Workspace | — | Create `.modo/` directory structure |
| Slash Commands | — | Open `/` command picker |
| Export Conversation | — | Copy chat as Markdown |
| Toggle Autopilot | — | Switch Autopilot / Supervised |
| Open Chat | `Cmd+L` | Focus chat panel |
| Inline Edit | `Cmd+K` | Edit code inline with AI |


## Contributing

```bash
npm run watch        # TypeScript compilation (keep running)
npm run buildreact   # React UI (run after changing .tsx files)
./scripts/code.sh    # Launch the IDE
```

Core services: `src/vs/workbench/contrib/void/common/`. Browser-side logic: `browser/`. React components: `browser/react/src/`.

PRs welcome. MIT licensed.


## License

MIT
