# Architecture & How It Works

This is a **dynamic Cordis plugin** for the DSH (DeepSeek Harness). A dynamic
plugin is defined at runtime (it never edits the deployment's shipped config),
and each activation is a versioned, approval-gated **package** under one stable
**plugin id**.

The plugin is split across two runtime planes:

```
┌──────────────────────────── Browser (Client) ────────────────────────────┐
│  src/client.js                                                            │
│  · Registers a "Skills" page in Settings (slot `settings.section`)        │
│  · Renders the skill list + checkboxes + filter (React, no JSX)           │
│  · Reads the current sessionId from the slot's `useSessions` prop         │
│  · Grouping (source/provider) + sorting (name/required-first)             │
│  · Availability badges + import/export UI                                 │
│  · Talks to the host via host.call(method, args)                          │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │  JSON RPC (Client → Host)
┌──────────────────────────────────▼────────────────────────────────────────┐
│  src/host.js                                                              │
│  · Reads the live skill registry (ctx.get('skills'))                      │
│  · Resolves the agent for the sessionId (ctx.agents.get(id))              │
│  · Passes that agent as the viewing `scope` to skills.list()              │
│  · Persists the "required for prompts" set to a JSON file (durable)       │
│  · Registers the `check_required_skills` model tool (agent enforcement)   │
│  · Handlers: list-skills · get-required · set-required · check-required   │
│              export-required · import-required                            │
└───────────────────────────────────────────────────────────────────────────┘
```

## Why the scope matters

Skills are **scoped to the agent/session**, not global. Calling
`skills.list()` with no `scope` reads only the global layer, which is typically
empty. That is why earlier versions of this plugin showed "0 installed skills".

The fix: the client passes its current `sessionId`; the host resolves the live
agent via `agents.get(sessionId)` and passes it as `scope` to `skills.list()` —
the exact mechanism the built-in `skill` tool uses to produce the catalog.

## The RPC surface

| method            | args                    | returns                                          |
|-------------------|-------------------------|--------------------------------------------------|
| `list-skills`     | `{ sessionId }`         | `[{ name, description, source, provider, modelInvocable, userInvocable }, ...]` |
| `get-required`    | `{ sessionId }`         | `[skillName, ...]`                                |
| `set-required`    | `{ sessionId, names }`  | `[skillName, ...]`                                |
| `check-required`  | `{ sessionId }`         | `{ required, loaded, missing }`                   |
| `export-required` | `{ sessionId }`         | JSON string of the required list                  |
| `import-required` | `{ sessionId, json }`   | `[skillName, ...]`                                |

## Agent-side enforcement tool

The host registers a model tool named **`check_required_skills`** via
`harness.defineTool` + `harness.registerTool`. The agent can call it to see
which required skills are loaded for the current turn. It resolves the scope
from `exec.agent` (the reliable scope inside a tool call) rather than the
initiator, which is undefined in host RPC handlers.

## "Loaded" vs "available"

`check-required` (and the tool) report which required skills are **actually
loaded in the current conversation**, not merely present in the catalog. The
host derives this from `agent.session.deriveMessages()`: it scans for
`skill-invocation` message sources (user-invoked skills) and `skill` tool-call
blocks (model-invoked skills). A required skill that has not been loaded yet
shows as "not loaded".

## Lifecycle & persistence

- **Durable & per-session.** The "required" set is persisted to a per-session
  file `.dsh/skills-manager-<sessionId>.json` in the session workspace via the
  `fs` service, so it survives DSH restarts and does not leak across sessions
  that share a workspace. It is loaded lazily on first read and written on
  every change.
- **Dynamic.** The plugin itself is a dynamic package: it does not survive a DSH
  restart and must be re-activated (the persisted required set does survive).

## Constraints honored

- Plain JavaScript only (no TypeScript, JSX, or `import` in the sandbox halves;
  the `.js` exports here are the maintainable source, and the DSH authoring flow
  consumes the two halves' bodies directly).
- All side effects are fiber-scoped: slots, styles, handlers, and the registered
  tool are torn down on stop/update/undefine.
