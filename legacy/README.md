# Legacy: the pre-2.0 dynamic-package halves

These two files are the retired 1.x form of this plugin. They are kept only as a
record; nothing in the package loads them.

They were written as **dynamic Cordis packages**: sandboxed function bodies
(`harness.handle`, `harness.defineTool`, `host.call`) submitted through an
authoring flow and activated per process. Current DSH keeps that registry for
programmatic callers, but **no model tool creates dynamic definitions** —
`dsh-cordis-host-runner`'s own README says so, and the shipped Creator workflow
installs persistent bundles instead. A definition also disappeared on restart.

The live plugin is the bundle at the package root:

| File | Role |
|---|---|
| `index.js` | Host half — `check_required_skills` tool + `/skills-manager` command |
| `client.js` | Client half — the Settings → Skills page |
| `cordis.patch.yml` | The row `plugin_manager install_bundle` mounts |

Why the halves could not be reused verbatim:

- a bundle host half is a normal module (`export function apply`), so there is no
  `harness` global;
- a bundle client half is loaded by `window.__ModuleLoader__`, so there is no
  `styles`/`host.call` facade and React arrives through `require('react')`;
- `remote.<namespace>` client services are installed from **generated** Typert
  descriptors, so a plain-JS plugin has no private client→host RPC. The
  documented replacement is a Host command, which `client.js` uses.
