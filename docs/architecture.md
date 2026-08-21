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
│  · Talks to the host via host.call(method, args)                          │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │  JSON RPC (Client → Host)
┌──────────────────────────────────▼────────────────────────────────────────┐
│  src/host.js                                                              │
│  · Reads the live skill registry (ctx.get('skills'))                      │
│  · Resolves the agent for the sessionId (ctx.agents.get(id))              │
│  · Passes that agent as the viewing `scope` to skills.list()              │
│  · Keeps the "required for prompts" set in memory                         │
│  · Handlers: list-skills · get-required · set-required                    │
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

| method         | args                    | returns                       |
|----------------|-------------------------|-------------------------------|
| `list-skills`  | `{ sessionId }`         | `[{ name, description }, ...]`|
| `get-required` | —                       | `[skillName, ...]`            |
| `set-required` | `[skillName, ...]`      | `[skillName, ...]`            |

## Lifecycle & persistence

- **Dynamic & transient.** The "required" set lives in the Host process's
  memory for the life of the plugin activation. It does **not** persist across
  a DSH restart.
- To make the required set durable, wire it to a persistent `settings`
  namespace or a file via a Host service (see `docs/roadmap.md`).

## Constraints honored

- Plain JavaScript only (no TypeScript, JSX, or `import` in the sandbox halves;
  the `.js` exports here are the maintainable source, and the DSH authoring flow
  consumes the two halves' bodies directly).
- All side effects are fiber-scoped: slots, styles, and handlers are torn down
  on stop/update/undefine.
