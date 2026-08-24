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
  catalog with its name, description, source, provider, and invocation policy.
- **Filter** — a search box narrows the list by name or description.
- **Mark skills as required** — check a box to flag a skill as "required for my
  prompts"; it gets a blue highlight and a **required** badge.
- **Durable required set** — the required list persists to a per-session
  `.dsh/skills-manager-<sessionId>.json` in the session workspace, so it survives
  DSH restarts and stays isolated per session.
- **Loaded state** — each required skill shows a green **loaded** or amber
  **not loaded** badge, derived from the live conversation (which skills were
  actually invoked), not just catalog membership.
- **Grouping & sorting** — group by source or provider, and sort by name or
  required-first.
- **Import / export** — copy the required list to JSON and paste it back in.
- **Agent-side enforcement** — registers a `check_required_skills` model tool so
  the agent can verify which required skills are loaded before answering.
- **Live counts** — the header shows `N installed · M required`.
- **Session-aware** — resolves the current session's agent scope, so the list
  reflects exactly what that session's agent can load (not an empty global view).

## Screenshot (conceptual)

```
Settings → Skills
──────────────────────────────────────────────
Skills Manager                   132 installed · 5 required
[ Filter skills…                                ]
[No grouping ▾] [Sort by name ▾] [Export] [Import]
☐ accessibility        Design and implement inclusive digital products…
☐ api-design           REST API design patterns including resource naming…
☑ cordis-plugin-development   Create, modify, debug, or extend dynamic Cordis Plugins…
    ↳ [required] [loaded] · bundled · model
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

| method            | args                    | returns                                          |
|-------------------|-------------------------|--------------------------------------------------|
| `list-skills`     | `{ sessionId }`         | `[{ name, description, source, provider, modelInvocable, userInvocable }, …]` |
| `get-required`    | `{ sessionId }`         | `[skillName, …]`                                  |
| `set-required`    | `{ sessionId, names }`  | `[skillName, …]`                                  |
| `check-required`  | `{ sessionId }`         | `{ required, loaded, missing }`                   |
| `export-required` | `{ sessionId }`         | JSON string of the required list                  |
| `import-required` | `{ sessionId, json }`   | `[skillName, …]`                                  |

The host also registers a model tool **`check_required_skills`** so the agent
itself can verify which required skills are loaded for the current turn.

---

## Repository layout

```
.
├── src/
│   ├── host.js       # Host half: skills registry read + durable required-set + enforcement tool
│   └── client.js     # Client half: Settings page UI (React, no JSX)
├── docs/
│   ├── architecture.md   # How the two planes fit together
│   ├── loading.md        # How to load this plugin into DSH
│   └── roadmap.md        # Implemented items + future ideas
├── package.json
├── README.md
└── LICENSE
```

---

## Notes & limitations

- **Durable required set.** Persisted to a per-session
  `.dsh/skills-manager-<sessionId>.json` in the session workspace; it survives
  DSH restarts and stays isolated per session. The plugin itself is a dynamic
  package and must be re-activated after a restart (the required set survives).
- **Session-scoped.** The list reflects the current session's agent scope.
- **Plain JS halves.** The sandboxed code is plain JavaScript (no TS/JSX); the
  `.js` exports here are the maintainable source consumed by the authoring flow.

---

## Roadmap

Implemented: durable required set, agent-side enforcement tool, loaded-state
badges, import/export, and grouping/sorting. Future ideas (prompt injection of the
required set, per-skill notes, cross-session sync) are in
[docs/roadmap.md](docs/roadmap.md).

---

## License

[MIT](LICENSE)
