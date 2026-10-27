#!/usr/bin/env node
/**
 * Integration check: mount the Host half in a REAL Cordis context with stub
 * services, then dispose it and confirm both effects unwind.
 *
 * `npm test` deliberately has no dependencies, so this lives here: it needs the
 * DSH installation's own `@deepseek-ai/cordis`. Point `DSH_INSTALL` at a dsh
 * checkout when the default does not exist.
 *
 *   node scripts/verify-mount.mjs
 *
 * What it proves: `inject` + `apply` + `ctx.effect` are used correctly, the tool
 * and command register, and unloading removes them.
 * What it does not prove: that the bundle installs, or that the Client half
 * renders — those need the running Harness.
 */
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const DEFAULT_INSTALL = '/Users/ixici/.local/lib/node_modules/@deepseek-ai/dsh'
const install = process.env.DSH_INSTALL ?? DEFAULT_INSTALL
const cordisEntry = `${install}/node_modules/@deepseek-ai/cordis/lib/index.js`

if (!existsSync(cordisEntry)) {
  console.error(`Cannot find @deepseek-ai/cordis under ${install}`)
  console.error('Set DSH_INSTALL to the directory that contains the dsh installation.')
  process.exit(2)
}

const { Context } = await import(pathToFileURL(cordisEntry).href)
const plugin = await import(pathToFileURL(new URL('../index.js', import.meta.url).pathname).href)

const registered = { tools: new Set(), commands: new Set() }

const ctx = new Context()
ctx.provide('skills', { list: async () => [] })
ctx.provide('agents', { get: () => undefined })
ctx.provide('fs', {
  resolve: async (path, opts) => ({ path: `${opts?.cwd ?? ''}/${path}` }),
  stat: async () => undefined,
  readText: async () => '',
  writeText: async () => ({}),
})
ctx.provide('tools', {
  register: (tool) => {
    registered.tools.add(tool.name)
    return () => registered.tools.delete(tool.name)
  },
})
ctx.provide('commands', {
  register: (definition) => {
    registered.commands.add(definition.name)
    return () => registered.commands.delete(definition.name)
  },
})

const settled = () => new Promise((resolve) => setTimeout(resolve, 50))
const snapshot = () => ({ tools: [...registered.tools], commands: [...registered.commands] })

ctx.plugin(plugin)
await settled()
const mounted = snapshot()
console.log('mounted:', JSON.stringify(mounted))

await ctx.registry.delete(plugin)
await settled()
const disposed = snapshot()
console.log('disposed:', JSON.stringify(disposed))

const ok = mounted.tools.length === 1
  && mounted.tools[0] === 'check_required_skills'
  && mounted.commands.length === 1
  && mounted.commands[0] === 'skills-manager'
  && disposed.tools.length === 0
  && disposed.commands.length === 0

if (!ok) {
  console.error('FAIL: the Host half did not register and unwind as expected')
  process.exit(1)
}
console.log('OK: the Host half registers both resources and unwinds on dispose')
