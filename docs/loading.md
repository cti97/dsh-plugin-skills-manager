# Loading this plugin into DSH

This is a **dynamic Cordis plugin**: it is defined and activated at runtime
through the DSH web GUI (or the `cordis_*` authoring tools), without touching
the deployment's shipped config.

Because the sandboxed halves are plain JavaScript function bodies (no imports,
no JSX), the canonical way to load this repo is to paste the **body** of each
half into the plugin authoring flow. The two halves are:

- **Host half** → the body of `src/host.js` (everything inside `export default { … }`).
- **Client half** → the body of `src/client.js`.

## Steps

1. Open the DSH authoring UI (or call `cordis_define`).
2. Start a new Plugin. Submit a semantic `idPrefix` of 3–6 lowercase letters
   (e.g. `sklm`).
3. Provide the Host code = `src/host.js` body.
4. Provide the Client code = `src/client.js` body.
5. **Run / update** the returned package and approve the activation request.

## The authoring shape (reference)

```js
// Host half
return {
  inject: ['agents', 'fs'],
  apply(ctx) {
    const skills = ctx.get('skills')
    const fs = ctx.get('fs')
    if (skills === undefined) return
    // durable required set persisted to .dsh/skills-manager.json
    harness.handle('list-skills', async (args) => { /* … */ })
    harness.handle('get-required', async (args) => { /* … */ })
    harness.handle('set-required', async (args) => { /* … */ })
    harness.handle('check-required', async (args) => { /* … */ })
    harness.handle('export-required', async (args) => { /* … */ })
    harness.handle('import-required', async (args) => { /* … */ })
    // agent-side enforcement tool
    const checkTool = harness.defineTool({ name: 'check_required_skills', /* … */ })
    harness.registerTool(ctx, checkTool)
  },
}

// Client half
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    styles.insert(/* … */)
    function SkillsPage(props) { /* … React … */ }
    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'skills-manager', label: 'Skills', order: 30 },
      (props) => React.createElement(SkillsPage, props),
    ))
  },
}
```

## Slot & version notes

- The page mounts in **Settings → Skills** (slot `settings.section`, id
  `skills-manager`). It is additive and does not replace any shipped page.
- Every change to behavior is a new immutable **package** under the same plugin
  id; activation requires approval the first time.
