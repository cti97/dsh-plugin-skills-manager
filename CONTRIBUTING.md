# Contributing

Thanks for improving **dsh-skills-manager**!

## Getting started

```bash
git clone https://github.com/cti97/dsh-plugin-skills-manager
cd dsh-plugin-skills-manager
npm test        # node --test test/*.test.js — 13 tests, no dependencies
```

## What to keep in mind

- **Two halves, one bundle.** `index.js` is the Host half (a normal Cordis
  plugin: `export const inject` + `export function apply`). `client.js` is the
  Client half, registered through `window.__ModuleLoader__` and returning
  `{ inject, apply }`. There is no `harness` global, no `host.call`, and no
  `styles` facade — those belonged to the retired dynamic-package form in
  [`legacy/`](legacy/).
- **No imports.** A bundle installed as a linked directory resolves bare
  specifiers from its own checkout, not from the DSH installation. React arrives
  in the client half through `require('react')`; everything else goes through
  services on `ctx`.
- **Plain JavaScript only.** No JSX, no TypeScript, no build step.
- **Scope correctness.** Skills are agent-scoped. Any change to the listing must
  keep resolving the session's agent and pass it as `scope` to `skills.list()`,
  or it will silently show zero skills.
- **Two data paths, not one.** The page *reads* the state file through
  `remote.workspaceFiles` and *writes* through the `/skills-manager` command.
  Adding a read through a command would append a transcript row per page open;
  do not.
- **Fiber-scoped side effects.** Slots, the stylesheet, the tool, and the command
  must be registered inside `apply` so unload removes them.
- **Docs.** If you change behavior, update `README.md`, `docs/architecture.md`,
  and the limitation list together. A limitation that stopped being true is a
  bug in the docs.

## Integration check

`npm test` has no dependencies. One check does need the DSH installation: mounting
the Host half in a real Cordis context and confirming both effects unwind.

```bash
node scripts/verify-mount.mjs          # uses the default install path
DSH_INSTALL=/path/to/dsh node scripts/verify-mount.mjs
```

## PR checklist

- [ ] `npm test` passes (it is a real suite; do not replace it with a stub).
- [ ] `npm run check` passes (`node --check` on both halves).
- [ ] README / architecture / limitations reflect any behavior change.
- [ ] If a Remote call changed, say which one and whether a live page confirmed
      it — the tests stub the Gateway.

## Reporting bugs

Open an issue with: what you expected, what you saw, and (if relevant) the exact
text/error shown in **Settings → Skills** or returned by `/skills-manager`.
