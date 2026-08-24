# Roadmap

Status of the originally planned follow-ups.

## Implemented ✅

1. **Durable "required" set** — persisted to a per-session
   `.dsh/skills-manager-<sessionId>.json` in the session workspace via the `fs`
   service; survives DSH restarts and does not leak across sessions sharing a
   workspace.
2. **Agent-side enforcement** — a model tool `check_required_skills` lets the
   agent verify which required skills are loaded for the current turn.
3. **Show used-in-current-prompt state** — the page shows green **loaded** /
   amber **not loaded** badges on each required skill, derived from the live
   conversation history (skill-invocation messages + `skill` tool calls), not
   just catalog membership.
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
