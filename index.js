/**
 * Skills Manager — Host half of a persistent DSH bundle.
 * ------------------------------------------------------------------
 * Mounted by `cordis.patch.yml` as one row, this half:
 *
 *   1. Owns the per-session "required for my prompts" set, persisted to
 *      `.dsh/skills-manager-<sessionId>.json` in the session workspace through
 *      the `fs` service, so it survives a DSH restart and does not leak across
 *      sessions sharing a workspace.
 *   2. Registers the model tool `check_required_skills`, so an agent can verify
 *      which required skills are actually loaded in the conversation before it
 *      answers.
 *   3. Registers the `/skills-manager` session command, which is the ONLY
 *      browser-reachable write path: current DSH installs `remote.<namespace>`
 *      client services from generated descriptors, so a plain-JS bundle has no
 *      private client→host RPC. A command is the documented Host entry point a
 *      plugin page may invoke (`ctx.remote.commands.execute`), and its
 *      `command/run` / `command/done` records are the audit trail of a user
 *      action.
 *
 * No imports: a bundle installed as a linked directory resolves its bare
 * specifiers from its own checkout, not from the DSH installation.
 */

/** Services this plugin needs; a missing one keeps the row inactive instead of throwing. */
export const inject = ['tools', 'commands', 'skills', 'agents', 'fs']

/** Directory (relative to the session workspace) holding this plugin's state file. */
const STATE_DIRECTORY = '.dsh'
const STATE_VERSION = 1
const COMMAND_NAME = 'skills-manager'
const TOOL_NAME = 'check_required_skills'

/**
 * Sanitize one session id into the state-file stem.
 * @param sessionId - session identity as supplied by a slot prop or an agent.
 * @returns a filesystem-safe single path segment.
 */
export function stateFileName(sessionId) {
  const safe = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${STATE_DIRECTORY}/skills-manager-${safe}.json`
}

/**
 * Normalize one persisted state document, tolerating any older or broken shape.
 * @param text - raw file contents.
 * @returns arrays of unique skill names plus the last check timestamp.
 */
export function parseState(text) {
  const required = []
  const loaded = []
  let checkedAt
  if (typeof text !== 'string' || text.length === 0) return { required, loaded, checkedAt }
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return { required, loaded, checkedAt }
  }
  if (data === null || typeof data !== 'object') return { required, loaded, checkedAt }
  const names = (value) => {
    const seen = new Set()
    if (!Array.isArray(value)) return []
    for (const entry of value) {
      if (typeof entry === 'string' && entry.length > 0 && !seen.has(entry)) seen.add(entry)
    }
    return [...seen]
  }
  required.push(...names(data.required))
  loaded.push(...names(data.loaded))
  if (typeof data.checkedAt === 'string' && data.checkedAt.length > 0) checkedAt = data.checkedAt
  return { required, loaded, checkedAt }
}

/**
 * Collect the skill names actually loaded into one agent's conversation.
 *
 * Two sources are load-bearing and both are derived from committed session
 * events, never from catalog membership:
 *   · a `skill-invocation` message source — the user typed `/name`;
 *   · a `skill` tool call — the model invoked it.
 *
 * @param agent - live agent, or `undefined` when the session is gone.
 * @returns the set of loaded skill names.
 */
export function loadedSkillNames(agent) {
  const names = new Set()
  if (agent === undefined || agent === null) return names
  let messages
  try {
    messages = agent.session.deriveMessages()
  } catch {
    return names
  }
  if (!Array.isArray(messages)) return names
  for (const message of messages) {
    const source = message === null || message === undefined ? undefined : message.source
    if (source !== null && typeof source === 'object' && source.kind === 'skill-invocation') {
      if (typeof source.name === 'string' && source.name.length > 0) names.add(source.name)
    }
    const content = message === null || message === undefined ? undefined : message.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block === null || typeof block !== 'object') continue
      if (block.type !== 'tool-call' || block.name !== 'skill') continue
      try {
        const args = JSON.parse(typeof block.arguments === 'string' ? block.arguments : '{}')
        if (args !== null && typeof args === 'object' && typeof args.name === 'string' && args.name.length > 0) {
          names.add(args.name)
        }
      } catch {
        // A malformed call cannot name a skill; the conversation still holds the result.
      }
    }
  }
  return names
}

/**
 * Build the per-session state store over the injected services.
 * @param ctx - plugin context (real or a test double).
 * @returns the store, catalog, and check operations.
 */
export function createSkillState(ctx) {
  /**
   * sessionId -> promise of { required: Set, loaded: Set, checkedAt?: string }.
   * The PROMISE is cached, not the value: caching an empty state before the disk
   * read settles would let a concurrent command persist that empty set over a
   * non-empty file.
   */
  const cache = new Map()

  function emptyState() {
    return { required: new Set(), loaded: new Set(), checkedAt: undefined }
  }

  function sessionCwd(sessionId) {
    try {
      const agent = ctx.agents.get(String(sessionId))
      const cwd = agent === undefined || agent === null ? undefined : agent.session?.header?.cwd
      return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
    } catch {
      return undefined
    }
  }

  async function loadFromDisk(sessionId) {
    const state = emptyState()
    const cwd = sessionCwd(sessionId)
    if (cwd === undefined) return state
    try {
      const target = await ctx.fs.resolve(stateFileName(sessionId), { cwd })
      const info = await ctx.fs.stat(target)
      if (info === undefined) return state
      const persisted = parseState(await ctx.fs.readText(target))
      state.required = new Set(persisted.required)
      state.loaded = new Set(persisted.loaded)
      state.checkedAt = persisted.checkedAt
      return state
    } catch (error) {
      // Do not cache a failure: the next call retries instead of pinning an
      // empty set for the rest of the process.
      cache.delete(sessionId)
      console.error('[skills-manager] could not read the required set:', error)
      return state
    }
  }

  function read(sessionId) {
    const pending = cache.get(sessionId)
    if (pending !== undefined) return pending
    const started = loadFromDisk(sessionId)
    cache.set(sessionId, started)
    return started
  }

  /** sessionId -> tail of that session's mutation chain. */
  const queues = new Map()

  /**
   * Run one read-modify-write against the freshest state, alone for its session.
   * Without this, two pins dispatched from one page both read the pre-pin set and
   * the later write drops the earlier pin.
   * @param sessionId - session being mutated.
   * @param apply - receives the current state, returns the operation result.
   * @returns the operation result.
   */
  function mutate(sessionId, apply) {
    const previous = queues.get(sessionId) ?? Promise.resolve()
    const run = previous.then(async () => apply(await read(sessionId)), async () => apply(await read(sessionId)))
    queues.set(sessionId, run.then(() => undefined, () => undefined))
    return run
  }

  async function save(sessionId, state) {
    cache.set(sessionId, Promise.resolve(state))
    const cwd = sessionCwd(sessionId)
    if (cwd === undefined) return { ok: false, reason: 'this session has no workspace, so the required set stays in memory' }
    try {
      const target = await ctx.fs.resolve(stateFileName(sessionId), { cwd })
      const document = {
        version: STATE_VERSION,
        required: [...state.required].sort(),
        loaded: [...state.loaded].sort(),
        ...state.checkedAt === undefined ? {} : { checkedAt: state.checkedAt },
      }
      await ctx.fs.writeText(target, `${JSON.stringify(document, null, 2)}\n`)
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: String(error?.message ?? error) }
    }
  }

  async function listSkills(agent) {
    const options = agent === undefined || agent === null ? {} : { scope: agent }
    const skills = await ctx.skills.list(options)
    if (!Array.isArray(skills)) return []
    return skills.map((skill) => ({
      name: String(skill?.name ?? ''),
      description: String(skill?.description ?? ''),
      whenToUse: typeof skill?.whenToUse === 'string' ? skill.whenToUse : undefined,
      path: typeof skill?.path === 'string' ? skill.path : undefined,
      source: String(skill?.source ?? ''),
      provider: String(skill?.provider ?? ''),
      modelInvocable: skill?.invocation?.modelInvocable === true,
      userInvocable: skill?.invocation?.userInvocable === true,
    }))
  }

  async function agentFor(sessionId) {
    try {
      return ctx.agents.get(String(sessionId))
    } catch {
      return undefined
    }
  }

  function check(agent, sessionId, required) {
    const loaded = loadedSkillNames(agent)
    const loadedList = required.filter((name) => loaded.has(name))
    const missing = required.filter((name) => !loaded.has(name))
    return { required, loaded: loadedList, missing }
  }

  async function runCheck(sessionId) {
    const agent = await agentFor(sessionId)
    const state = await read(sessionId)
    const required = [...state.required].sort()
    if (required.length === 0) {
      return { required: [], loaded: [], missing: [], checkedAt: state.checkedAt }
    }
    const outcome = check(agent, sessionId, required)
    const checkedAt = new Date().toISOString()
    await save(sessionId, { required: state.required, loaded: new Set(outcome.loaded), checkedAt })
    return { ...outcome, checkedAt }
  }

  return { read, save, mutate, listSkills, runCheck, check, sessionCwd, agentFor }
}

/**
 * Render the tool result for the model: one line per requirement, missing first.
 * @param value - the canonical tool value.
 * @returns a content-block array.
 */
function renderCheck(value) {
  const required = value.required ?? []
  const loaded = value.loaded ?? []
  const missing = value.missing ?? []
  if (required.length === 0) {
    return [{ type: 'text', text: 'No skills are marked required for this session.' }]
  }
  const lines = [`Required skills: ${required.join(', ')}`]
  lines.push(`Loaded in this conversation: ${loaded.length === 0 ? '(none)' : loaded.join(', ')}`)
  if (missing.length > 0) {
    lines.push(`Missing — load these before relying on them: ${missing.join(', ')}`)
    lines.push('Load a missing skill with the `skill` tool (or the user types `/name`).')
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/**
 * Build the model tool definition accepted by `ctx.tools.register`.
 * @param state - the store from {@link createSkillState}.
 * @returns a tool definition.
 */
export function createTool(state) {
  return {
    name: TOOL_NAME,
    description:
      'Check which skills marked as required for this session are actually loaded in this conversation. '
      + 'Returns the required list plus which are loaded and which are missing. Call it before answering when required skills matter.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          required: { type: 'array', items: { type: 'string' } },
          loaded: { type: 'array', items: { type: 'string' } },
          missing: { type: 'array', items: { type: 'string' } },
          checkedAt: { type: 'string' },
        },
        required: ['required', 'loaded', 'missing'],
        additionalProperties: false,
      },
      render: (_args, value) => renderCheck(value),
    },
    async execute(_args, exec) {
      const sessionId = exec?.agent?.sessionId
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        return { required: [], loaded: [], missing: [] }
      }
      return state.runCheck(sessionId)
    },
  }
}

/**
 * Parse and apply one `/skills-manager` invocation.
 * @param state - the store from {@link createSkillState}.
 * @param invocation - command invocation supplied by the registry.
 * @returns a command result.
 */
export async function runCommand(state, invocation) {
  const agent = invocation?.agent
  const sessionId = agent?.sessionId
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { kind: 'error', text: 'skills-manager: this command needs an open session.' }
  }
  const rest = typeof invocation.rawInput === 'string' ? invocation.rawInput.trim() : ''
  const [verb = 'show', ...args] = rest.length === 0 ? [] : rest.split(/\s+/)

  const describe = (next, saved) => ({
    kind: 'success',
    text: `required: ${[...next].sort().join(', ') || '(none)'}${saved.ok ? '' : ` (not persisted: ${saved.reason})`}`,
  })

  /** Validate names against the live catalog, then union them into the set. */
  const addNames = (candidates) => state.mutate(sessionId, async (current) => {
    const catalog = await state.listSkills(agent)
    const known = new Set(catalog.map((skill) => skill.name))
    const accepted = []
    const unknown = []
    for (const candidate of candidates) {
      if (known.has(candidate)) accepted.push(candidate)
      else unknown.push(candidate)
    }
    if (unknown.length > 0) {
      return {
        kind: 'error',
        text: `skills-manager: unknown skill${unknown.length > 1 ? 's' : ''} ${unknown.map((name) => `"${name}"`).join(', ')}. `
          + 'Only skills the current session can invoke are accepted.',
      }
    }
    const next = new Set(current.required)
    for (const name of accepted) next.add(name)
    const saved = await state.save(sessionId, { required: next, loaded: current.loaded, checkedAt: current.checkedAt })
    return describe(next, saved)
  })

  switch (verb) {
    case 'show': {
      const current = await state.read(sessionId)
      const required = [...current.required].sort()
      return {
        kind: 'success',
        text: required.length === 0 ? 'required: (none)' : `required: ${required.join(', ')}`,
      }
    }
    case 'require':
    case 'add': {
      if (args.length === 0) return { kind: 'error', text: 'skills-manager: name at least one skill.' }
      return addNames(args)
    }
    case 'unrequire':
    case 'remove': {
      if (args.length === 0) return { kind: 'error', text: 'skills-manager: name at least one skill.' }
      return state.mutate(sessionId, async (current) => {
        const next = new Set(current.required)
        for (const name of args) next.delete(name)
        const saved = await state.save(sessionId, { required: next, loaded: current.loaded, checkedAt: current.checkedAt })
        return describe(next, saved)
      })
    }
    case 'clear':
      return state.mutate(sessionId, async (current) => {
        const saved = await state.save(sessionId, { required: new Set(), loaded: new Set(), checkedAt: current.checkedAt })
        return describe(new Set(), saved)
      })
    case 'check': {
      const outcome = await state.runCheck(sessionId)
      const loadedText = outcome.loaded.length === 0 ? '(none)' : outcome.loaded.join(', ')
      const missingText = outcome.missing.length === 0 ? '(none)' : outcome.missing.join(', ')
      return { kind: 'success', text: `loaded: ${loadedText}\nmissing: ${missingText}` }
    }
    case 'export': {
      const current = await state.read(sessionId)
      const document = {
        version: STATE_VERSION,
        required: [...current.required].sort(),
        loaded: [...current.loaded].sort(),
        ...current.checkedAt === undefined ? {} : { checkedAt: current.checkedAt },
      }
      return { kind: 'success', text: JSON.stringify(document, null, 2) }
    }
    case 'import': {
      if (args.length === 0) return { kind: 'error', text: 'skills-manager: paste a JSON array or state document after `import`.' }
      const imported = parseImport(rest.replace(/^import\s+/, ''))
      if (imported.length === 0) {
        return { kind: 'error', text: 'skills-manager: import needs a JSON array of skill names or a state document with a `required` array.' }
      }
      return addNames(imported)
    }
    default:
      return {
        kind: 'error',
        text: `skills-manager: unknown action "${verb}". Use show | require <name…> | unrequire <name…> | clear | check | export | import <json>.`,
      }
  }
}

/**
 * Read skill names out of an imported JSON value (bare array or state document).
 * @param raw - the JSON text supplied after `import`.
 * @returns candidate names; an unparseable document yields none.
 */
export function parseImport(raw) {
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (Array.isArray(data)) return data.filter((entry) => typeof entry === 'string')
  if (data !== null && typeof data === 'object' && Array.isArray(data.required)) {
    return data.required.filter((entry) => typeof entry === 'string')
  }
  return []
}

/**
 * Mount the plugin.
 * @param ctx - plugin context.
 */
export function apply(ctx) {
  const state = createSkillState(ctx)

  ctx.effect(() => ctx.tools.register(createTool(state)), 'skills-manager: check_required_skills tool')

  ctx.effect(
    () => ctx.commands.register({
      name: COMMAND_NAME,
      description:
        'Show or edit the skills required for this session '
        + '(show | require <name…> | unrequire <name…> | clear | check | export | import <json>).',
      input: { hint: 'show | require <name…> | unrequire <name…> | clear | check | export | import <json>' },
      recordInput: false,
      handler: (invocation) => runCommand(state, invocation),
    }),
    'skills-manager: /skills-manager command',
  )
}
