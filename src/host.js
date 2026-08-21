/**
 * Skills Manager — Host half
 * ---------------------------
 * Runs in the DSH (DeepSeek Harness) Node.js process.
 *
 * Responsibilities:
 *   1. Reads the live skill registry (`ctx.get('skills')`) for the current
 *      session's agent, so the list reflects exactly what the agent sees.
 *   2. Keeps the "required for prompts" set in memory.
 *   3. Exposes three package-private RPC methods the browser half calls:
 *        list-skills   (args)  -> [{ name, description }, ...]
 *        get-required  ()      -> [skillName, ...]
 *        set-required  (names) -> [skillName, ...]
 *
 * Note: skills are scoped to the agent, so the client passes its current
 * `sessionId`; the host resolves the live agent via `ctx.agents.get(id)` and
 * uses it as the viewing `scope` for `skills.list()`.
 *
 * Loaded by the host composition as a dynamic Cordis plugin. Do not import
 * Node modules; only the sandbox builtins (`ctx`, `harness`, `console`) are
 * available.
 */
export default {
  inject: ['agents'],

  apply(ctx) {
    const skills = ctx.get('skills')
    if (skills === undefined) return

    // In-memory set of skill names the user marked "required for prompts".
    // Lives only for the life of this process/plugin (see README).
    let required = new Set()

    // List skills visible to the given session's agent.
    harness.handle('list-skills', async (args) => {
      try {
        const sessionId = args && typeof args === 'object' ? args.sessionId : undefined
        let scope
        if (sessionId) {
          const agent = ctx.agents.get(String(sessionId))
          if (agent !== undefined) scope = agent
        }
        const options = scope === undefined ? {} : { scope }
        const list = await skills.list(options)
        return list.map((s) => ({
          name: String((s && s.name) || ''),
          description: String((s && s.description) || ''),
        }))
      } catch (err) {
        console.error('[Skills Manager] list-skills failed:', err)
        return []
      }
    })

    // Current set of required skill names.
    harness.handle('get-required', async () => Array.from(required))

    // Replace the required set (idempotent, JSON array in/out).
    harness.handle('set-required', async (names) => {
      required = new Set(Array.isArray(names) ? names.map(String) : [])
      return Array.from(required)
    })
  },
}
