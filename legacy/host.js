/**
 * Skills Manager — Host half
 * ---------------------------
 * Runs in the DSH (DeepSeek Harness) Node.js process.
 *
 * Responsibilities:
 *   1. Reads the live skill registry (`ctx.get('skills')`) for the current
 *      session's agent, so the list reflects exactly what the agent sees.
 *   2. Keeps the "required for prompts" set DURABLY — persisted to a
 *      per-session `.dsh/skills-manager-<sessionId>.json` file in the session
 *      workspace via the `fs` service, so it survives DSH restarts and does not
 *      leak across sessions sharing a workspace.
 *   3. Exposes package-private RPC methods the browser half calls:
 *        list-skills      ({ sessionId }) -> [{ name, description, source,
 *                                               provider, modelInvocable,
 *                                               userInvocable }, ...]
 *        get-required     ({ sessionId }) -> [skillName, ...]
 *        set-required     ({ sessionId, names }) -> [skillName, ...]
 *        check-required   ({ sessionId }) -> { required, loaded, missing }
 *        export-required  ({ sessionId }) -> JSON string
 *        import-required  ({ sessionId, json }) -> [skillName, ...]
 *   4. Registers a model tool `check_required_skills` so the agent itself can
 *      verify which required skills are loaded for the current turn.
 *
 * Note: skills are scoped to the agent, so the client passes its current
 * `sessionId`; the host resolves the live agent via `ctx.agents.get(id)` and
 * uses it as the viewing `scope` for `skills.list()`. The enforcement tool
 * instead uses `exec.agent` (the reliable scope inside a tool call).
 *
 * Loaded by the host composition as a dynamic Cordis plugin. Do not import
 * Node modules; only the sandbox builtins (`ctx`, `harness`, `console`) are
 * available.
 */
export default {
  inject: ['agents', 'fs'],

  apply(ctx) {
    const skills = ctx.get('skills')
    const fs = ctx.get('fs')
    if (skills === undefined) return

    // ---- Durable per-session required set, persisted to a JSON file in the
    // session workspace so it survives DSH restarts. ----
    const store = new Map() // sessionId -> Set<string>

    function sessionCwd(sessionId) {
      try {
        const agent = ctx.agents.get(String(sessionId))
        const cwd = agent && agent.session && agent.session.header && agent.session.header.cwd
        return typeof cwd === 'string' && cwd ? cwd : undefined
      } catch (e) { return undefined }
    }

    // Per-session persistence file so sessions in the same workspace do not
    // share a required set (Bug 5 fix).
    function storePath(sessionId) {
      const safe = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '_')
      return '.dsh/skills-manager-' + safe + '.json'
    }

    async function loadRequired(sessionId) {
      if (store.has(sessionId)) return store.get(sessionId)
      const set = new Set()
      const cwd = sessionCwd(sessionId)
      if (cwd && fs) {
        try {
          const target = await fs.resolve(storePath(sessionId), { cwd })
          const info = await fs.stat(target)
          if (info) {
            const text = await fs.readText(target)
            const data = JSON.parse(text)
            if (Array.isArray(data && data.required)) data.required.forEach((n) => set.add(String(n)))
          }
        } catch (e) { console.error('[Skills Manager] load failed:', e) }
      }
      store.set(sessionId, set)
      return set
    }

    async function saveRequired(sessionId, set) {
      const cwd = sessionCwd(sessionId)
      if (cwd && fs) {
        try {
          const target = await fs.resolve(storePath(sessionId), { cwd })
          await fs.writeText(target, JSON.stringify({ required: Array.from(set) }, null, 2))
        } catch (e) { console.error('[Skills Manager] save failed:', e) }
      }
    }

    async function listFor(sessionId) {
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
        source: String((s && s.source) || ''),
        provider: String((s && s.provider) || ''),
        modelInvocable: !!(s && s.invocation && s.invocation.modelInvocable),
        userInvocable: !!(s && s.invocation && s.invocation.userInvocable),
      }))
    }

    // Skills actually loaded in the current conversation: user-invoked skills
    // (skill-invocation message source) and model-invoked skills (skill tool
    // calls). This is the real "loaded in prompt" signal (Bug 4 fix).
    function loadedSkillNames(agent) {
      const names = new Set()
      try {
        const messages = agent && agent.session ? agent.session.deriveMessages() : []
        for (const message of messages) {
          if (message.source && message.source.kind === 'skill-invocation' && message.source.name) {
            names.add(String(message.source.name))
          }
          const blocks = message.content || []
          for (const block of blocks) {
            if (block && block.type === 'tool-call' && block.name === 'skill') {
              try {
                const args = JSON.parse(block.arguments || '{}')
                if (args && args.name) names.add(String(args.name))
              } catch (e) { /* ignore malformed args */ }
            }
          }
        }
      } catch (e) { console.error('[Skills Manager] loadedSkillNames failed:', e) }
      return names
    }

    harness.handle('list-skills', async (args) => {
      try {
        const sessionId = args && typeof args === 'object' ? args.sessionId : undefined
        return await listFor(sessionId)
      } catch (err) {
        console.error('[Skills Manager] list-skills failed:', err)
        return []
      }
    })

    harness.handle('get-required', async (args) => {
      const sessionId = args && typeof args === 'object' ? args.sessionId : undefined
      if (!sessionId) return []
      const set = await loadRequired(sessionId)
      return Array.from(set)
    })

    harness.handle('set-required', async (args) => {
      const sessionId = args && typeof args === 'object' ? args.sessionId : undefined
      const names = args && Array.isArray(args.names) ? args.names.map(String) : []
      if (!sessionId) return []
      const set = new Set(names)
      store.set(sessionId, set)
      await saveRequired(sessionId, set)
      return Array.from(set)
    })

    // Which required skills are actually loaded in the current conversation.
    harness.handle('check-required', async (args) => {
      const sessionId = args && typeof args === 'object' ? args.sessionId : undefined
      if (!sessionId) return { required: [], loaded: [], missing: [] }
      const set = await loadRequired(sessionId)
      const required = Array.from(set)
      if (required.length === 0) return { required: [], loaded: [], missing: [] }
      const agent = ctx.agents.get(String(sessionId))
      const loaded = loadedSkillNames(agent)
      const loadedList = required.filter((n) => loaded.has(n))
      const missing = required.filter((n) => !loaded.has(n))
      return { required, loaded: loadedList, missing }
    })

    harness.handle('export-required', async (args) => {
      const sessionId = args && typeof args === 'object' ? args.sessionId : undefined
      if (!sessionId) return '[]'
      const set = await loadRequired(sessionId)
      return JSON.stringify(Array.from(set), null, 2)
    })

    harness.handle('import-required', async (args) => {
      const sessionId = args && typeof args === 'object' ? args.sessionId : undefined
      if (!sessionId) return []
      let names = []
      try {
        const parsed = JSON.parse(String((args && args.json) || '[]'))
        if (Array.isArray(parsed)) names = parsed.map(String)
      } catch (e) { throw new Error('Invalid JSON: ' + String(e && e.message || e)) }
      const set = new Set(names)
      store.set(sessionId, set)
      await saveRequired(sessionId, set)
      return Array.from(set)
    })

    // ---- Agent-side enforcement: a model tool that reports which required
    // skills are loaded for the current turn. exec.agent is the reliable scope. ----
    const checkTool = harness.defineTool({
      name: 'check_required_skills',
      description: 'Check which skills marked as required for this session are currently loaded in the conversation. Returns the required list plus which are loaded and which are missing. Call before answering when required skills matter.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          properties: {
            required: { type: 'array', items: { type: 'string' } },
            loaded: { type: 'array', items: { type: 'string' } },
            missing: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
        render(args, value) {
          return [{ type: 'text', text: JSON.stringify(value) }]
        },
      },
      async execute(args, exec) {
        const agent = exec && exec.agent
        const sessionId = agent && agent.sessionId
        if (!sessionId) return { required: [], loaded: [], missing: [] }
        const set = await loadRequired(sessionId)
        const required = Array.from(set)
        if (required.length === 0) return { required: [], loaded: [], missing: [] }
        const loaded = loadedSkillNames(agent)
        const loadedList = required.filter((n) => loaded.has(n))
        const missing = required.filter((n) => !loaded.has(n))
        return { required, loaded: loadedList, missing }
      },
    })
    harness.registerTool(ctx, checkTool)
  },
}
