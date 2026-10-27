# Install, verify, remove

This package is a **bundle**: a package whose `package.json` declares
`dsh.bundle.patch`. Plugin Manager installs it into one Harness profile; every
session in that profile sees it, and it survives a restart.

## Install

1. Clone the repository somewhere stable (the profile links to that directory, so
   do not install from a temporary checkout):

   ```bash
   git clone https://github.com/cti97/dsh-plugin-skills-manager
   ```

2. Check it first, from the checkout:

   ```bash
   npm test        # 13 tests, no dependencies
   npm run check   # node --check on index.js and client.js
   ```

3. In the Harness profile that should carry it, call `plugin_manager` with:

   - `action: install_bundle`
   - `target`: the **absolute path** of the checkout

   The tool performs the package installation and bundle selection itself; do not
   reproduce those steps with shell commands, and do not edit the profile's
   `package.json` or `cordis.patch.yml` by hand.

4. Read the result. `application: applied` means the change is live; `failed`,
   `overridden`, or `restart-required` each mean something specific and should be
   resolved before you claim success.

## Verify

- **Inventory** — the Plugins settings page lists a row titled **Skills Manager**
  with the description from [`locale/en.json`](../locale/en.json), and its own
  icon.
- **Page** — **Settings → Skills** lists this session's skills. If it says
  *"Open a session to see its skills"*, the page is mounted but no session is
  selected; open one.
- **Command** — type `/skills-manager show`. `required: (none)` is the expected
  first answer.
- **Tool** — ask the agent to call `check_required_skills`. With nothing pinned it
  answers *"No skills are marked required for this session."*

Host-only contract checks, from the checkout: `node scripts/verify-mount.mjs`
mounts the Host half in a real Cordis context and confirms the tool and command
register and unwind on dispose.

What static checks cannot establish: that the page looks right in light and dark
themes, and that the Gateway accepts each Remote call. Both need the running
page; the test suite stubs them.

## State

The required set lives in the session workspace, not in the profile:

```
<session cwd>/.dsh/skills-manager-<sessionId>.json
```

```json
{
  "version": 1,
  "required": ["systematic-debugging"],
  "loaded": ["systematic-debugging"],
  "checkedAt": "2026-10-27T14:02:11.000Z"
}
```

`loaded` and `checkedAt` are the **last** verification result, written whenever
the tool runs. Deleting the file clears the pin set for that session; the next
command recreates it.

## Remove

- Remove the bundle with `plugin_manager` `action: remove_bundle` and the package
  name (`dsh-skills-manager`).
- Delete any `.dsh/skills-manager-*.json` files you no longer want; they are inert
  without the plugin.
