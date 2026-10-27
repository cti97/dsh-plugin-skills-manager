# dsh-skills-manager

A **DSH bundle** that answers two questions the harness otherwise leaves to
memory:

1. *Which skills can this session actually invoke?* — **Settings → Skills** lists
   the live catalog for the current session's agent.
2. *Did the agent use the ones I care about?* — pin skills as **required**, and
   the agent can call the **`check_required_skills`** tool to see which of them
   are loaded in the conversation before it answers.

Version 2.0 is a rewrite for the current DSH plugin model: this is a persistent
**bundle** installed through Plugin Manager, not a process-local dynamic package.
See [Why 2.0 exists](docs/architecture.md#why-20-exists) for what changed and
what was lost.

[![Status](https://img.shields.io/badge/dsh-bundle%20plugin-blue)](https://github.com/cti97/dsh-plugin-skills-manager)
[![License](https://img.shields.io/badge/license-MIT-green)](https://github.com/cti97/dsh-plugin-skills-manager/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/cti97/dsh-plugin-skills-manager/ci.yml?label=CI)](https://github.com/cti97/dsh-plugin-skills-manager/actions)

---

## What you get

- **The real catalog** — read from the same client-callable source the shipped
  `/` skill picker uses, scoped to the current session's agent, so it is never
  the empty global layer.
- **Pin required skills** — a checkbox per skill; required rows are highlighted
  and badged.
- **Durable per-session set** — persisted to
  `.dsh/skills-manager-<sessionId>.json` in the session workspace, so it survives
  a restart and stays isolated per session.
- **Agent-side verification** — the `check_required_skills` tool reports
  `required`, `loaded`, and `missing`, derived from committed session events
  (a `/name` invocation or a `skill` tool call), not from catalog membership.
- **Filter, group by origin, sort required-first** — origin (user / bundled /
  custom / virtual) is derived from the skill's absolute path.
- **Import / export** the required set as JSON.
- **Last-check stamp** — the page shows when a required set was last verified, so
  a "verified" badge never pretends to be live.

## Install

```bash
git clone https://github.com/cti97/dsh-plugin-skills-manager
cd dsh-plugin-skills-manager
npm test          # 13 host + client tests, no dependencies
```

Then, from the Harness profile that should carry it, ask the agent to install the
bundle — `plugin_manager` with action `install_bundle` and this directory's
absolute path — and approve the activation. The row mounts from
[`cordis.patch.yml`](cordis.patch.yml); the page attaches through the
`dsh.client` section of [`package.json`](package.json).

Full steps, including verification and removal: [docs/installation.md](docs/installation.md).

## Using it

**Settings → Skills** — filter, pin, import/export. Each pin runs one
`/skills-manager` command; that command record in the transcript is the audit
trail of the action (see the limitation below).

**The command** — `/skills-manager` is also usable by hand:

```
/skills-manager show                         # current required set
/skills-manager require systematic-debugging
/skills-manager unrequire systematic-debugging
/skills-manager clear
/skills-manager check                        # loaded vs missing, right now
/skills-manager export                       # JSON state document
/skills-manager import ["a", "b"]            # bare array or state document
```

**The tool** — `check_required_skills` takes no arguments and returns:

```json
{ "required": ["systematic-debugging"], "loaded": ["systematic-debugging"], "missing": [], "checkedAt": "2026-10-27T14:02:11.000Z" }
```

## Honest limitations

These are properties of the current platform, not bugs to be fixed later:

- **Each pin appends a command record.** A bundle's only Client-callable Host
  entry point is a command (`ctx.remote.commands.execute`); `remote.<namespace>`
  services exist only for generated Typert descriptors. A page that read state
  through a command on every open would litter the transcript, so the page
  *reads* the state file through the read-only `workspaceFiles` API and only
  *writes* through the command.
- **The catalog is the user-invocable set.** `remote.skills.list` returns skills
  the user can invoke, with a `modelInvocable` flag; model-only skills do not
  appear. The `source` and `provider` fields are not on that wire, so grouping
  by origin is derived from each skill's path.
- **"Verified" is a timestamp, not a live badge.** Only the host can see which
  skills are loaded, and only the tool call is a supported way to ask. The page
  shows the last verification result and when it happened.
- **Not a policy.** Pinning a skill records intent. It does not force the model
  to load one; it gives the model (and you) a way to notice when it did not.

## Layout

| Path | What it is |
|---|---|
| `index.js` | Host half: state store, `check_required_skills` tool, `/skills-manager` command |
| `client.js` | Client half: the Settings → Skills page |
| `cordis.patch.yml` | Bundle patch that mounts the Host row |
| `locale/*.json` | Plugin Manager title/description, English and Chinese |
| `icon.svg` | Plugin icon |
| `test/` | `node:test` suites for both halves (fake context, no Harness needed) |
| `legacy/` | The retired 1.x dynamic-package halves, for reference only |

## Development

```bash
npm test        # node --test test/*.test.js
npm run check   # node --check on both halves
```

No dependencies, no build step, no imports: a bundle installed as a linked
directory resolves bare specifiers from its own checkout, not from the DSH
installation.

## License

MIT
