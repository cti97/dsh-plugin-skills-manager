# Roadmap

Possible follow-ups, roughly ordered by value.

## 1. Durable "required" set (recommended)
The current required-set lives only in the Host process's memory and is lost on
DSH restart. Make it survive by persisting it:

- **Option A — settings namespace.** Use a persistent `settings` service to
  store `{ plugin: 'dsh-skills-manager', key: 'requiredSkills', value: [...] }`.
- **Option B — a file.** Write the set to a JSON file under the session
  workspace and read it back on load.

## 2. Agent-side enforcement / verification
Let the **agent itself** consult the required set before answering a prompt.
Two sub-ideas:

- Register a dynamic model **tool** (e.g. `harness.registerTool`) named
  `check_required_skills` that returns which required skills are loaded for the
  current turn, so the agent can verify them.
- Or inject a lightweight reminder into the session prompt when the required
  set is non-empty.

## 3. Show "used in current prompt" state
Read the current conversation's `<available_skills>` / skill-invocation context
and highlight which of the marked-required skills are actually active in the
present prompt.

## 4. Import / export the required set
Add buttons to copy the required list to JSON and paste it back in, so users can
share or back it up without durable storage.

## 5. Grouping & search improvements
- Group skills by source/provider.
- Show invocation policy (model-invocable vs user-invocable).
- Sort by name or by "required first".
