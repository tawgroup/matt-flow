# matt-flow

A Claude Code mod that draws Matt Pocock's AI coding flow in a pane beside the chat, and lights up where the session is right now.

The flow is Matt's 7 phases of AI-driven development, with the skills of `mattpocock/skills` placed on them:

1. Idea: `grill-with-docs`, `grill-me`, `grilling`, `wayfinder`, `domain-modeling`
2. Research (optional): `research`
3. Prototype (optional): `prototype`
4. Spec: `to-spec`
5. Tickets: `to-tickets`, `triage`
6. Build: `implement`, `tdd`, `diagnosing-bugs`, `code-review`
7. QA: `qa`, with bugs going back to step 6

Side tools such as `handoff` and `improve-codebase-architecture` are counted in their own list.

## Use

- `/matt-flow` opens the pane. Type it again to close it.
- The pane also opens by itself the first time a flow skill runs in a session.
- The phase of the latest skill is boxed and marked `▶`. Phases with skills that ran are `✓`. Phases jumped over are marked "bỏ qua".
- Under the current phase, "Tiếp" says what to run next.
- Click a phase to read what it is for and which skills belong to it.
- A context bar shows how close the session is to Matt's ~120K token "dumb zone", and warns once it is past it.
- The status line shows `matt-flow 4/7 Spec`.

Skills are caught both when the model loads them (the Skill tool) and when you type them as slash commands. Plugin prefixes such as `anthropic-skills:` are ignored.

## Install

Requires a Claude Code version with mod support (the `plugin-authoring` skill).

Install once, loads in every new session:

```bash
claude plugin marketplace add tawgroup/matt-flow
claude plugin install matt-flow@matt-flow
```

Then start a new Claude Code session, send any message, and type `/matt-flow`. In a session that is already open, run `/reload-plugins` first.

Try it for one session only, without installing:

```bash
git clone https://github.com/tawgroup/matt-flow.git
claude --plugin-dir ./matt-flow
```

Claude Code generates the type files in `.claude-plugin/types/` on load. They are not committed.

The skills themselves come from [mattpocock/skills](https://github.com/mattpocock/skills). This mod only draws the map; install the skills separately.

## Layout

```
.claude-plugin/plugin.json   manifest
hooks/hooks.json             module list
hooks/register.tsx           the mod: phases, hooks, pane
types/index.d.ts             state type contract
tests/matt-flow.test.tsx     pane tests (claude plugin test .)
```
