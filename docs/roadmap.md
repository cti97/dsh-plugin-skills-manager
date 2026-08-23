# Roadmap

Status of the originally planned follow-ups.

## Implemented ✅

1. **Durable "required" set** — persisted to `.dsh/skills-manager.json` in the
   session workspace via the `fs` service; survives DSH restarts.
2. **Agent-side enforcement** — a model tool `check_required_skills` lets the
   agent verify which required skills are loaded for the current turn.
3. **Show used-in-current-prompt state** — the page shows green **available** /
   amber **not loaded** badges on each required skill.
4. **Import / export the required set** — Export fills a textarea with JSON;
   Import applies a pasted JSON array.
5. **Grouping & search improvements** — group by source/provider, sort by
   name/required-first, and a metadata line (source · provider · model/user).

## Ideas for later

- **Prompt injection of the required set.** When the required set is non-empty,
  inject a short reminder into the session prompt so the agent always knows which
  skills are mandatory (beyond the opt-in tool call).
- **Per-skill notes.** Let the user attach a short note to a required skill
  (e.g. "use the v2 variant").
- **Cross-session sharing.** Export/import already works; a future step could
  sync the required set across sessions or workspaces.
- **Better "used in current prompt" signal.** Today availability is derived from
  the session catalog; a deeper integration could read the live conversation's
  `<available_skills>` context to show which are actually active in the present
  prompt.
