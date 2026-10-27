/**
 * Host-half tests: the required-set store, the loaded-skill derivation, the
 * `/skills-manager` command, and the `check_required_skills` tool.
 *
 * The tests build a fake plugin context (tools/commands/agents/skills/fs), so
 * they exercise the real `apply` path without a running Harness. What they do
 * NOT establish: that the bundle installs, that the Settings page renders, or
 * that the Remote calls in `client.js` are accepted by a live Gateway.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  apply,
  loadedSkillNames,
  parseImport,
  parseState,
  runCommand,
  stateFileName,
} from '../index.js'

const CATALOG = [
  {
    name: 'systematic-debugging',
    description: 'Use when encountering any bug.',
    source: 'user-dsh',
    provider: 'filesystem',
    path: '/home/u/.dsh/skills/systematic-debugging/SKILL.md',
    invocation: { modelInvocable: true, userInvocable: true },
  },
  {
    name: 'writing-plans',
    description: 'Use when you have a spec.',
    source: 'bundled',
    provider: 'bundled',
    path: '/opt/dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills/writing-plans/SKILL.md',
    invocation: { modelInvocable: true, userInvocable: false },
  },
]

/**
 * One in-memory Harness stand-in.
 * @param options - catalog override and pre-seeded files.
 * @returns the fake context plus the registrations it received.
 */
function harness(options = {}) {
  const files = new Map(Object.entries(options.files ?? {}))
  const tools = []
  const commands = []
  const agents = new Map()
  const skills = options.skills ?? CATALOG
  const ctx = {
    effect(fn) {
      return fn()
    },
    skills: {
      list: async () => skills,
    },
    agents: {
      get: (id) => agents.get(String(id)),
    },
    fs: {
      resolve: async (path, opts) => ({ path: `${opts?.cwd ?? ''}/${path}`.replace(/\/+/g, '/') }),
      stat: async (target) => (files.has(target.path) ? { type: 'file' } : undefined),
      readText: async (target) => files.get(target.path),
      writeText: async (target, text) => {
        files.set(target.path, text)
        return { ok: true }
      },
    },
    tools: {
      register: (tool) => {
        tools.push(tool)
        return () => tools.splice(tools.indexOf(tool), 1)
      },
    },
    commands: {
      register: (definition) => {
        commands.push(definition)
        return () => commands.splice(commands.indexOf(definition), 1)
      },
    },
  }
  return { ctx, files, tools, commands, agents }
}

/**
 * One agent stand-in whose conversation is the supplied messages.
 * @param options - session identity, workspace, and derived messages.
 * @returns an object shaped like the pieces the host reads.
 */
function agent({ sessionId = 'sess-1', cwd = '/work', messages = [] } = {}) {
  return {
    sessionId,
    session: {
      header: { cwd },
      deriveMessages: () => messages,
    },
  }
}

test('the state file is keyed per session and stays one path segment', () => {
  assert.equal(stateFileName('sess-1'), '.dsh/skills-manager-sess-1.json')
  assert.equal(stateFileName('a/b:c*d'), '.dsh/skills-manager-a_b_c_d.json')
  assert.notEqual(stateFileName('one'), stateFileName('two'))
})

test('parseState survives junk, keeps order, and de-duplicates', () => {
  assert.deepEqual(parseState('').required, [])
  assert.deepEqual(parseState('not json').required, [])
  assert.deepEqual(parseState('{"required":"nope"}').required, [])
  const parsed = parseState(JSON.stringify({ required: ['b', 'a', 'b', 7], loaded: ['a'], checkedAt: '2026-01-01T00:00:00.000Z' }))
  assert.deepEqual(parsed.required, ['b', 'a'])
  assert.deepEqual(parsed.loaded, ['a'])
  assert.equal(parsed.checkedAt, '2026-01-01T00:00:00.000Z')
})

test('loaded skills come from both invocation paths, not from catalog membership', () => {
  const messages = [
    { source: { kind: 'skill-invocation', name: 'writing-plans' }, content: [] },
    { content: [{ type: 'tool-call', name: 'skill', arguments: JSON.stringify({ name: 'systematic-debugging' }) }] },
    { content: [{ type: 'tool-call', name: 'skill', arguments: 'not-json' }] },
    { content: [{ type: 'tool-call', name: 'bash', arguments: '{"name":"ignored"}' }] },
  ]
  const loaded = loadedSkillNames(agent({ messages }))
  assert.deepEqual([...loaded].sort(), ['systematic-debugging', 'writing-plans'])
  assert.equal(loadedSkillNames(undefined).size, 0)
})

test('apply registers exactly one tool and one command under their public names', () => {
  const { ctx, tools, commands } = harness()
  apply(ctx)
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'check_required_skills')
  assert.equal(commands.length, 1)
  assert.equal(commands[0].name, 'skills-manager')
  assert.equal(commands[0].recordInput, false)
})

test('require → persist → check reports the missing skill, and loading it clears the gap', async () => {
  const { ctx, files, tools, commands, agents } = harness()
  apply(ctx)
  const live = agent()
  agents.set('sess-1', live)

  const refused = await commands[0].handler({ agent: live, rawInput: 'require not-a-skill' })
  assert.equal(refused.kind, 'error')
  assert.match(refused.text, /unknown skill/)

  const accepted = await commands[0].handler({ agent: live, rawInput: 'require systematic-debugging' })
  assert.equal(accepted.kind, 'success')
  assert.match(accepted.text, /systematic-debugging/)

  const persisted = JSON.parse(files.get('/work/.dsh/skills-manager-sess-1.json'))
  assert.deepEqual(persisted.required, ['systematic-debugging'])
  assert.equal(persisted.version, 1)

  const beforeAnswer = await tools[0].execute({}, { agent: live })
  assert.deepEqual(beforeAnswer.required, ['systematic-debugging'])
  assert.deepEqual(beforeAnswer.missing, ['systematic-debugging'])
  assert.deepEqual(beforeAnswer.loaded, [])
  assert.equal(typeof beforeAnswer.checkedAt, 'string')

  live.session.deriveMessages = () => [
    { source: { kind: 'skill-invocation', name: 'systematic-debugging' }, content: [] },
  ]
  const afterLoad = await tools[0].execute({}, { agent: live })
  assert.deepEqual(afterLoad.loaded, ['systematic-debugging'])
  assert.deepEqual(afterLoad.missing, [])

  // The last verification result is what the Settings page shows.
  const stamped = JSON.parse(files.get('/work/.dsh/skills-manager-sess-1.json'))
  assert.deepEqual(stamped.loaded, ['systematic-debugging'])
  assert.equal(typeof stamped.checkedAt, 'string')
})

test('the required set survives a restart and stays isolated per session', async () => {
  const first = harness()
  apply(first.ctx)
  const sessionOne = agent({ sessionId: 'sess-1', cwd: '/work' })
  const sessionTwo = agent({ sessionId: 'sess-2', cwd: '/work' })
  first.agents.set('sess-1', sessionOne)
  first.agents.set('sess-2', sessionTwo)
  await first.commands[0].handler({ agent: sessionOne, rawInput: 'require systematic-debugging' })

  // A fresh plugin over the same workspace: the cache is gone, the file is not.
  const second = harness({ files: Object.fromEntries(first.files) })
  apply(second.ctx)
  second.agents.set('sess-1', sessionOne)
  second.agents.set('sess-2', sessionTwo)
  const restored = await second.tools[0].execute({}, { agent: sessionOne })
  assert.deepEqual(restored.required, ['systematic-debugging'])

  const otherSession = await second.tools[0].execute({}, { agent: sessionTwo })
  assert.deepEqual(otherSession.required, [])
})

test('two pins dispatched together both persist', async () => {
  // A page can dispatch two pins before either read settles: without the
  // per-session write queue the later save drops the earlier pin.
  const { ctx, files, commands, agents } = harness({
    files: { '/work/.dsh/skills-manager-sess-1.json': JSON.stringify({ version: 1, required: ['systematic-debugging'] }) },
  })
  const readText = ctx.fs.readText
  ctx.fs.readText = async (target) => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    return readText(target)
  }
  apply(ctx)
  const live = agent()
  agents.set('sess-1', live)

  await Promise.all([
    commands[0].handler({ agent: live, rawInput: 'require writing-plans' }),
    commands[0].handler({ agent: live, rawInput: 'require systematic-debugging' }),
  ])

  const persisted = JSON.parse(files.get('/work/.dsh/skills-manager-sess-1.json'))
  assert.deepEqual(persisted.required, ['systematic-debugging', 'writing-plans'])
})

test('clear empties the set, import accepts both document and bare array, export round-trips', async () => {
  const { ctx, commands } = harness()
  apply(ctx)
  const live = agent()
  const handler = commands[0].handler

  await handler({ agent: live, rawInput: 'require systematic-debugging' })

  const exported = await handler({ agent: live, rawInput: 'export' })
  assert.equal(exported.kind, 'success')
  assert.deepEqual(JSON.parse(exported.text).required, ['systematic-debugging'])

  await handler({ agent: live, rawInput: 'clear' })
  const cleared = await handler({ agent: live, rawInput: 'show' })
  assert.match(cleared.text, /\(none\)/)

  const imported = await handler({ agent: live, rawInput: 'import ["systematic-debugging"]' })
  assert.equal(imported.kind, 'success')
  assert.deepEqual(parseImport(JSON.stringify({ required: ['writing-plans'] })), ['writing-plans'])
  assert.deepEqual(parseImport('not json'), [])

  const unknownVerb = await handler({ agent: live, rawInput: 'nope' })
  assert.equal(unknownVerb.kind, 'error')
})

test('a session without a workspace keeps the set in memory instead of failing the command', async () => {
  const { ctx, commands } = harness()
  apply(ctx)
  const noWorkspace = agent({ sessionId: 'sess-nowhere', cwd: undefined })
  const result = await commands[0].handler({ agent: noWorkspace, rawInput: 'require systematic-debugging' })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /not persisted/)
})

test('runCommand refuses an invocation without a session', async () => {
  const { ctx } = harness()
  apply(ctx)
  const state = { read: async () => ({ required: new Set(), loaded: new Set() }), listSkills: async () => [], save: async () => ({ ok: true }) }
  const result = await runCommand(state, { agent: undefined, rawInput: 'show' })
  assert.equal(result.kind, 'error')
})
