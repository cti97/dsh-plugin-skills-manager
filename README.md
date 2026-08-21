# dsh-skills-manager

A **dynamic Cordis plugin** for the DSH (DeepSeek Harness) web GUI that shows
every skill installed in your session and lets you mark which skills **must be
used for your prompts**.

> It solves the "wait, what skills do I actually have?" problem: instead of
> guessing from memory, open **Settings → Skills** and see the live catalog the
> agent can invoke — then pin the ones you care about.

[![Status](https://img.shields.io/badge/dsh-dynamic--cordis%20plugin-blue)](https://github.com/cti97/dsh-plugin-skills-manager)
[![License](https://img.shields.io/badge/license-MIT-green)](https://github.com/cti97/dsh-plugin-skills-manager/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/cti97/dsh-plugin-skills-manager/ci.yml?label=CI)](https://github.com/cti97/dsh-plugin-skills-manager/actions)

---

## Features

- **See all installed skills** — lists every skill in the current session's
  catalog with its name and description.
- **Filter** — a search box narrows the list by name or description.
- **Mark skills as required** — check a box to flag a skill as "required for my
  prompts"; it gets a blue highlight and a **required** badge.
- **Live counts** — the header shows `N installed · M required`.
- **Session-aware** — resolves the current session's agent scope, so the list
  reflects exactly what that session's agent can load (not an empty global view).

## Screenshot (conceptual)

```
Settings → Skills
──────────────────────────────────────────────
Skills Manager                   132 installed · 5 required
[ Filter skills…                                ]
☐ accessibility        Design and implement inclusive digital products…
☐ api-design           REST API design patterns including resource naming…
☑ cordis-plugin-development   Create, modify, debug, or extend dynamic Cordis Plugins…
    ↳ [required]
☐ systematic-debugging When encountering any bug, test failure…
```

## Why "0 installed skills" happened (and the fix)

Skills are **scoped to the agent/session**, not global. Calling
`skills.list()` without a `scope` reads only the global layer, which is usually
empty. This plugin passes the current session's agent as the viewing `scope` —
the same mechanism the built-in `skill` tool uses — so the real catalog shows
up. See [docs/architecture.md](docs/architecture.md).

---

## Installation

This is a **dynamic Cordis plugin**: it's defined and activated at runtime, and
never edits the deployment's shipped config.

```bash
git clone https://github.com/cti97/dsh-plugin-skills-manager
cd dsh-plugin-skills-manager
```

Then load the two halves into the DSH authoring flow. The full steps are in
[docs/loading.md](docs/loading.md). In short:

1. Start a new dynamic plugin (idPrefix e.g. `sklm`).
2. Host code ← `src/host.js`
3. Client code ← `src/client.js`
4. Run the package and approve activation.

### Requirements

- DSH with the dynamic-Cordis authoring surface (web GUI or `cordis_*` tools).
- No npm dependencies.

---

## Usage

1. In the DSH web GUI, open **Settings** (left sidebar).
2. Select the **Skills** page.
3. Browse or filter the skill list.
4. Check any skill you want honored for your prompts — it's marked *required*.

### RPC surface (Client → Host)

| method         | args                    | returns                       |
|----------------|-------------------------|-------------------------------|
| `list-skills`  | `{ sessionId }`         | `[{ name, description }, …]`  |
| `get-required` | —                       | `[skillName, …]`              |
| `set-required` | `[skillName, …]`        | `[skillName, …]`              |

---

## Repository layout

```
.
├── src/
│   ├── host.js       # Host half: skills registry read + required-set in memory
│   └── client.js     # Client half: Settings page UI (React, no JSX)
├── docs/
│   ├── architecture.md   # How the two planes fit together
│   ├── loading.md        # How to load this plugin into DSH
│   └── roadmap.md        # Ideas: durability, agent-side checks, export
├── package.json
├── README.md
└── LICENSE
```

---

## Notes & limitations

- **In-memory only.** The "required" set lives in the Host process for the
  life of the activation and is lost on restart. Durable storage is a planned
  follow-up (see [docs/roadmap.md](docs/roadmap.md)).
- **Session-scoped.** The list reflects the current session's agent scope.
- **Plain JS halves.** The sandboxed code is plain JavaScript (no TS/JSX); the
  `.js` exports here are the maintainable source consumed by the authoring flow.

---

## Roadmap

- Persist the required set (settings namespace or file).
- Agent-side enforcement: let the model check required skills before answering.
- Show which required skills are active in the current prompt.
- Import/export the required set as JSON.
- Group/sort skills by source and invocation policy.

See [docs/roadmap.md](docs/roadmap.md).

---

## License

[MIT](LICENSE)
