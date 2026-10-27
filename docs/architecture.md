# Architecture

Two halves, one bundle:

```
┌──────────────────────── Browser (Client half) ───────────────────────────┐
│  client.js — loaded by window.__ModuleLoader__, factory returns a plugin  │
│  · Settings → Skills page in the `settings.section` slot                  │
│  · Catalog  ← ctx.remote.skills.list({ sessionId })                       │
│  · Pins     ← ctx.remote.workspaceFiles.read(.dsh/skills-manager-<id>.json)│
│  · Writes   → ctx.remote.commands.execute('/skills-manager require …')    │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │  read-only file API · command execution
┌───────────────────────────────────▼───────────────────────────────────────┐
│  index.js — mounted as one row by cordis.patch.yml                        │
│  · state store  ctx.fs (per-session JSON in the session workspace)        │
│  · tool         check_required_skills (ctx.tools.register)                │
│  · command      /skills-manager (ctx.commands.register)                   │
│  · catalog      ctx.skills.list({ scope: agent })                         │
│  · loaded       agent.session.deriveMessages()                            │
└───────────────────────────────────────────────────────────────────────────┘
```

## Where the data comes from

**Catalog.** Skills are scoped to the agent, not global: `ctx.skills.list()` with
no `scope` reads the global layer, which is usually empty. The host passes the
session's agent as the viewing scope; the client instead uses the shipped
`remote.skills.list({ sessionId })` endpoint, which resolves the same scope for
that Session composition.

**Loaded state.** Derived from committed session events, not catalog membership:

- a message whose `source.kind` is `skill-invocation` — the user typed `/name`;
- a `tool-call` block named `skill` whose `arguments.name` is the skill.

Both paths are replayed from the log, so a forked or resumed session derives the
same answer.

**Required set.** Per-session, in the session workspace. The host is the only
writer; the page reads the same file through the read-only workspace-files
Remote API, so opening the page costs no command and leaves no transcript row.

## Why 2.0 exists

Version 1.x was a **dynamic Cordis package**: two sandboxed function bodies
(`harness.handle`, `harness.defineTool`, `host.call`) submitted through an
authoring flow and activated per process. The files are kept in
[`legacy/`](../legacy/) for reference.

Current DSH no longer offers that flow to an agent. `dsh-cordis-host-runner`
keeps the definition registry for programmatic callers and browser controls, but
its own README states the shipped Creator workflow installs **persistent
bundles** instead, and that "no model tool creates dynamic definitions". A
definition also vanished on restart; only the required-set file outlived it.

So 2.0 is a bundle: `package.json` declares `dsh.bundle.patch` and `dsh.client`,
`cordis.patch.yml` mounts the Host row, and the halves are ordinary modules. The
APIs underneath did **not** change — `skills.list({ scope })`, `agents.get`,
`fs.resolve/stat/readText/writeText`, `session.deriveMessages()`, and the
`settings.section` slot with its `useSessions` prop are the same ones 1.x used.

What the port cost, and why:

| 1.x | 2.0 | Reason |
|---|---|---|
| `harness.handle` RPC from the page | `/skills-manager` command | `remote.<namespace>` services are installed from generated Typert descriptors; a plain-JS bundle cannot expose one |
| `host.call` + `styles` facade | `require('react')`, rendered `<style>` | bundle client halves get no sandbox facade |
| `source`/`provider` grouping | origin derived from the skill path | those fields are not on the `remote.skills.list` wire |
| live loaded/not-loaded badge | last-check result + timestamp | only the host can read the conversation, and the tool is the only supported query |

## Package-private surface

The host exports the plugin row (`apply`, `inject`) plus the pure helpers the
tests use: `stateFileName`, `parseState`, `loadedSkillNames`, `createSkillState`,
`createTool`, `runCommand`, `parseImport`. None of them is imported by another
package; treat them as test seams, not as API.
