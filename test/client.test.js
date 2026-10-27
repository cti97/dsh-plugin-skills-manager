/**
 * Client-half smoke test: the ModuleLoader contract, the slot registration, and
 * one render pass against realistic Remote payloads.
 *
 * React and the plugin host are stubbed, so this proves the data path and the
 * markup wiring — not that the page looks right, and not that a live Gateway
 * accepts these calls.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const SOURCE = await readFile(new URL('../client.js', import.meta.url), 'utf8')

/**
 * Evaluate client.js against a fake browser module loader.
 * @param options - Remote payloads the fake gateway answers with.
 * @returns the registered factory result and render helper.
 */
function loadClient(options = {}) {
  const registrations = []
  const created = []
  let states = []
  let cursor = 0
  const React = {
    Fragment: Symbol.for('react.fragment'),
    createElement(type, props, ...children) {
      const element = { type, props: { ...(props ?? {}), children: children.length === 1 ? children[0] : children } }
      created.push(element)
      return element
    },
    useState(initial) {
      const index = cursor
      cursor += 1
      if (states[index] === undefined) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
    },
    useCallback(fn) {
      return fn
    },
    useEffect(fn) {
      pendingEffects.push(fn)
    },
  }
  const pendingEffects = []
  const calls = []

  const window = {
    __ModuleLoader__: {
      load(entry) {
        registrations.push(entry)
      },
    },
  }

  const context = new Function('window', `${SOURCE}; return window.__ModuleLoader__`) (window)
  const entry = registrations[0]
  const plugin = entry.factory((specifier) => {
    if (specifier === 'react') return React
    throw new Error(`unexpected require: ${specifier}`)
  })

  const ctx = {
    get: () => undefined,
    effect: (fn) => fn(),
    slots: {
      inject: (owner, callback) => callback(),
      register: (definition, component) => {
        calls.push({ definition, component })
        return () => {}
      },
    },
    remote: {
      skills: {
        list: async (request, signal) => {
          calls.push({ catalogRequest: request, signal })
          return { ok: true, value: { skills: options.skills ?? [] } }
        },
      },
      workspaceFiles: {
        read: async (sessionId, path, range, signal) => {
          calls.push({ fileRequest: { sessionId, path, range }, signal })
          if (options.stateText === undefined) {
            return { ok: false, error: { code: 'workspace-file/not-found', message: 'missing' } }
          }
          return { ok: true, value: { offset: 0, text: options.stateText, lines: 1, eof: true } }
        },
      },
      commands: {
        execute: async (sessionId, line) => {
          calls.push({ command: { sessionId, line } })
          return { ok: true, value: { commandId: 'cmd-1', result: { kind: 'success', text: 'required: x' } } }
        },
      },
    },
  }

  /**
   * Expand function components down to host elements, since the stub replaces
   * React's reconciler. Hooks are read on this single pass, so the cursor is
   * reset once per render, not once per component.
   * @param element - element returned by a component.
   * @returns the same tree with every function component expanded.
   */
  function evaluate(element) {
    if (element === null || element === undefined || typeof element !== 'object') return element
    if (typeof element.type === 'function') return evaluate(element.type(element.props))
    const children = element.props?.children
    const resolve = (child) => (Array.isArray(child) ? child.map(resolve) : evaluate(child))
    return { ...element, props: { ...(element.props ?? {}), children: resolve(children) } }
  }

  const render = () => {
    cursor = 0
    const registration = calls.find((call) => call.definition !== undefined)
    const element = registration.component({ useSessions: (selector) => selector({ current: 'sess-1' }) })
    return { element: evaluate(element), flush }
  }

  async function flush() {
    for (const effect of pendingEffects.splice(0)) effect()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  function text(element) {
    if (Array.isArray(element)) return element.map(text).join('')
    if (element === null || element === undefined || element === false || element === true) return ''
    if (typeof element === 'string' || typeof element === 'number') return String(element)
    const children = element.props?.children
    return children === undefined ? '' : text(children)
  }

  return { entry, plugin, ctx, calls, render, text, context, flush }
}

test('client.js registers one lazy factory whose id is the package name', async () => {
  const loaded = loadClient()
  assert.equal(loaded.entry.id, 'dsh-skills-manager')
  assert.equal(typeof loaded.entry.factory, 'function')
})

test('the plugin declares the services its data path needs and registers the settings section', async () => {
  const loaded = loadClient()
  for (const service of ['slots', 'remote.skills', 'remote.workspaceFiles', 'remote.commands']) {
    assert.ok(loaded.plugin.inject.includes(service), `missing inject: ${service}`)
  }
  loaded.plugin.apply(loaded.ctx)
  const registration = loaded.calls.find((call) => call.definition !== undefined)
  assert.equal(registration.definition.name, 'settings.section')
  assert.equal(registration.definition.id, 'skills-manager')
  assert.equal(typeof registration.component, 'function')
})

test('one render pass lists the session catalog and the required set', async () => {
  const loaded = loadClient({
    skills: [
      { name: 'systematic-debugging', description: 'Use when debugging.', path: '/home/u/.dsh/skills/systematic-debugging/SKILL.md', modelInvocable: true },
      { name: 'writing-plans', description: 'Use when planning.', path: undefined, modelInvocable: false },
    ],
    stateText: JSON.stringify({ version: 1, required: ['systematic-debugging'], loaded: ['systematic-debugging'], checkedAt: '2026-10-27T10:00:00.000Z' }),
  })
  loaded.plugin.apply(loaded.ctx)

  const first = loaded.render()
  await loaded.flush()
  const second = loaded.render()

  const catalogCall = loaded.calls.find((call) => call.catalogRequest !== undefined)
  assert.deepEqual(catalogCall.catalogRequest, { sessionId: 'sess-1' })
  const fileCall = loaded.calls.find((call) => call.fileRequest !== undefined)
  assert.equal(fileCall.fileRequest.path, '.dsh/skills-manager-sess-1.json')

  const markup = `${loaded.text(first.element)} ${loaded.text(second.element)}`
  assert.match(markup, /Skills Manager/)
  assert.match(markup, /systematic-debugging/)
  assert.match(markup, /writing-plans/)
  assert.match(markup, /2 installed · 1 required/)
})

test('a missing state file renders as an empty required set, not an error', async () => {
  const loaded = loadClient({ skills: [{ name: 'writing-plans', description: 'planning', modelInvocable: true }] })
  loaded.plugin.apply(loaded.ctx)
  loaded.render()
  await loaded.flush()
  const { element } = loaded.render()
  const markup = loaded.text(element)
  assert.match(markup, /writing-plans/)
  assert.match(markup, /1 installed · 0 required/)
  assert.doesNotMatch(markup, /Error:/)
})
