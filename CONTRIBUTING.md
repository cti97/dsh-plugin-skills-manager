# Contributing

Thanks for improving **dsh-skills-manager**!

## Getting started

```bash
git clone https://github.com/cti97/dsh-plugin-skills-manager
cd dsh-plugin-skills-manager
npm install --no-audit --no-fund
```

## What to keep in mind

- **Two sandboxed halves.** `src/host.js` runs in the DSH Node process;
  `src/client.js` runs in the browser. They talk over `host.call` /
  `harness.handle` with lossless JSON only.
- **Plain JavaScript only.** The halves are evaluated without a bundler or
  TypeScript transform: no `import`/`require`, no JSX. React is available in the
  client half as a global `React` symbol (use `React.createElement`).
- **Scope correctness.** Skills are agent-scoped. Any change to the listing must
  keep resolving the current session's agent and pass it as `scope` to
  `skills.list()`, or it will silently show zero skills.
- **Fiber-scoped side effects.** Slots, styles, and handlers must be torn down
  on stop/update/undefine (they are, via the Cordis fiber).
- **Docs.** If you change behavior, update `README.md` and `docs/architecture.md`
  together.

## PR checklist

- [ ] `npm run test` (currently a no-op placeholder) or a manual sanity check.
- [ ] `node --check src/host.js` and `node --check src/client.js` pass.
- [ ] README / architecture docs reflect any behavior changes.

## Reporting bugs

Open an issue with: what you expected, what you saw, and (if relevant) the exact
text/error shown in **Settings → Skills**.
