/**
 * Skills Manager — Client half of a persistent DSH bundle.
 * ------------------------------------------------------------------
 * Registers a "Skills" page in Settings (`settings.section`) that lists the
 * skills the current session can invoke and lets the user mark which ones are
 * required for their prompts.
 *
 * Data paths (all shipped, no private RPC):
 *   · catalog      → `ctx.remote.skills.list({ sessionId })`
 *                    (user-invocable skills of that Session composition)
 *   · required set → `.dsh/skills-manager-<sessionId>.json`, read through the
 *                    read-only `ctx.remote.workspaceFiles` API
 *   · mutations    → the host's `/skills-manager` session command, executed
 *                    with `ctx.remote.commands.execute` — the documented
 *                    Client-callable Host entry point
 *
 * The factory must stay free of side effects: everything registers in `apply`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skills-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'skills-manager'
    const COMMAND = 'skills-manager'

    const DICTIONARIES = {
      en: {
        'title': 'Skills Manager',
        'count': '{installed} installed · {required} required',
        'filter': 'Filter skills…',
        'group.none': 'No grouping',
        'group.origin': 'Group by origin',
        'sort.name': 'Sort by name',
        'sort.required': 'Required first',
        'export': 'Export',
        'import': 'Import',
        'apply': 'Apply',
        'close': 'Close',
        'applyHint': 'Paste a JSON array of skill names, then Apply.',
        'loading': 'Loading skills…',
        'empty': 'No skills match.',
        'noSession': 'Open a session to see its skills.',
        'error': 'Error: {message}',
        'required': 'required',
        'verified': 'verified',
        'unverified': 'unverified',
        'model': 'model-facing',
        'userOnly': 'user-only',
        'lastCheck': 'last check {time}',
        'neverChecked': 'not verified yet — ask the agent to call check_required_skills',
        'origin.user-dsh': 'user (~/.dsh/skills)',
        'origin.user-agents': 'user (~/.agents/skills)',
        'origin.bundled': 'bundled with DSH',
        'origin.custom': 'custom',
        'origin.virtual': 'virtual',
      },
      zh: {
        'title': '技能管理',
        'count': '{installed} 个已安装 · {required} 个必需',
        'filter': '筛选技能…',
        'group.none': '不分组',
        'group.origin': '按来源分组',
        'sort.name': '按名称排序',
        'sort.required': '必需的在前',
        'export': '导出',
        'import': '导入',
        'apply': '应用',
        'close': '关闭',
        'applyHint': '粘贴技能名称的 JSON 数组，然后点击应用。',
        'loading': '正在加载技能…',
        'empty': '没有匹配的技能。',
        'noSession': '打开一个会话以查看它的技能。',
        'error': '错误：{message}',
        'required': '必需',
        'verified': '已验证',
        'unverified': '未验证',
        'model': '模型可用',
        'userOnly': '仅用户',
        'lastCheck': '上次检查 {time}',
        'neverChecked': '尚未验证 — 让代理调用 check_required_skills',
        'origin.user-dsh': '用户 (~/.dsh/skills)',
        'origin.user-agents': '用户 (~/.agents/skills)',
        'origin.bundled': 'DSH 内置',
        'origin.custom': '自定义',
        'origin.virtual': '虚拟',
      },
    }

    const CSS = `
      .skm-wrap { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; }
      .skm-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
      .skm-title { font-size: 15px; font-weight: 600; margin: 0; color: var(--dsw-alias-label-primary); }
      .skm-count { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
      .skm-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .skm-search { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); width: 100%; box-sizing: border-box; font-size: 13px; }
      .skm-select { padding: 6px 8px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12px; }
      .skm-btn { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font-size: 12px; cursor: pointer; }
      .skm-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
      .skm-list { display: flex; flex-direction: column; gap: 6px; max-height: 60vh; overflow: auto; }
      .skm-group { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dsw-alias-label-caption); margin: 8px 0 2px; }
      .skm-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); cursor: pointer; }
      .skm-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
      .skm-item-on { border-color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-bg-layer-2); }
      .skm-body { flex: 1; min-width: 0; }
      .skm-name { font-weight: 600; font-size: 13px; color: var(--dsw-alias-label-primary); }
      .skm-badge { margin-left: 6px; font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-tertiary); }
      .skm-badge-on { color: var(--dsw-alias-state-business-primary); }
      .skm-badge-ok { color: var(--dsw-alias-state-success-primary); }
      .skm-badge-warn { color: var(--dsw-alias-state-warn-primary); }
      .skm-meta { font-size: 11px; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
      .skm-desc { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
      .skm-empty { font-size: 12px; color: var(--dsw-alias-label-tertiary); padding: 8px; }
      .skm-err { font-size: 12px; color: var(--dsw-alias-state-error-primary); padding: 8px; }
      .skm-io { display: flex; gap: 8px; align-items: flex-start; }
      .skm-io textarea { flex: 1; min-height: 72px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12px; padding: 6px; box-sizing: border-box; font-family: inherit; }
    `

    /**
     * The state file this session's required set lives in.
     * @param sessionId - current session.
     * @returns a path relative to the session workspace.
     */
    function statePath(sessionId) {
      return `.dsh/skills-manager-${String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '_')}.json`
    }

    /**
     * Coarse origin label derived from a skill's absolute path, standing in for
     * the `source` field the client-callable catalog does not carry.
     * @param skill - catalog entry.
     * @returns a dictionary key suffix.
     */
    function originOf(skill) {
      const path = typeof skill.path === 'string' ? skill.path : ''
      if (path.length === 0) return 'virtual'
      if (path.includes('/node_modules/@deepseek-ai/dsh')) return 'bundled'
      if (path.includes('/.dsh/skills/')) return 'user-dsh'
      if (path.includes('/.agents/skills/')) return 'user-agents'
      return 'custom'
    }

    /**
     * Unwrap one RemoteResult or throw its failure.
     * @param result - `{ ok, value }` / `{ ok, error }`.
     * @param label - call name for the error text.
     * @returns the success value.
     */
    function unwrap(result, label) {
      if (result !== null && typeof result === 'object' && result.ok === true) return result.value
      const failure = result?.error
      const code = typeof failure?.code === 'string' ? `${failure.code}: ` : ''
      throw new Error(`${label} — ${code}${String(failure?.message ?? 'unknown failure')}`)
    }

    /**
     * Read the catalog for one session.
     * @param ctx - client plugin context.
     * @param sessionId - current session.
     * @param signal - cancellation signal.
     * @returns catalog entries.
     */
    async function loadCatalog(ctx, sessionId, signal) {
      const value = unwrap(await ctx.remote.skills.list({ sessionId }, signal), 'skills.list')
      const skills = Array.isArray(value?.skills) ? value.skills : []
      return skills.map((skill) => ({
        name: String(skill?.name ?? ''),
        description: String(skill?.description ?? ''),
        whenToUse: typeof skill?.whenToUse === 'string' ? skill.whenToUse : undefined,
        path: typeof skill?.path === 'string' ? skill.path : undefined,
        modelInvocable: skill?.modelInvocable === true,
      }))
    }

    /**
     * Read the persisted required set and the last verification result.
     * A missing or unreadable file is an empty set, not an error: the page must
     * open on a session that has never pinned anything.
     * @param ctx - client plugin context.
     * @param sessionId - current session.
     * @param signal - cancellation signal.
     * @returns `{ required, loaded, checkedAt }`.
     */
    async function loadState(ctx, sessionId, signal) {
      const empty = { required: [], loaded: [], checkedAt: undefined }
      let value
      try {
        value = unwrap(
          await ctx.remote.workspaceFiles.read(sessionId, statePath(sessionId), { offset: 0 }, signal),
          'workspaceFiles.read',
        )
      } catch {
        return empty
      }
      let data
      try {
        data = JSON.parse(typeof value?.text === 'string' ? value.text : '{}')
      } catch {
        return empty
      }
      const names = (input) => (Array.isArray(input) ? input.filter((entry) => typeof entry === 'string') : [])
      return {
        required: names(data?.required),
        loaded: names(data?.loaded),
        checkedAt: typeof data?.checkedAt === 'string' ? data.checkedAt : undefined,
      }
    }

    /**
     * Run one `/skills-manager` invocation and surface a handler failure.
     * @param ctx - client plugin context.
     * @param sessionId - current session.
     * @param line - complete slash-command line.
     * @returns the handler's success text.
     */
    async function runCommand(ctx, sessionId, line) {
      const value = unwrap(await ctx.remote.commands.execute(sessionId, line, []), `/${COMMAND}`)
      const result = value?.result
      if (result?.kind === 'error') throw new Error(result.text)
      return typeof result?.text === 'string' ? result.text : ''
    }

    /**
     * Settings → Skills.
     * @param props - slot props; `useSessions` is a standard settings prop.
     * @returns the page element.
     */
    function SkillsPage(props) {
      const { ctx, t } = props.sm
      const useSessions = props.useSessions
      const currentSessionId = (typeof useSessions === 'function' ? useSessions((state) => state.current) : undefined) || null
      const [skills, setSkills] = React.useState([])
      const [required, setRequired] = React.useState([])
      const [loaded, setLoaded] = React.useState([])
      const [checkedAt, setCheckedAt] = React.useState(undefined)
      const [query, setQuery] = React.useState('')
      const [groupBy, setGroupBy] = React.useState('none')
      const [sortBy, setSortBy] = React.useState('name')
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [ioOpen, setIoOpen] = React.useState(false)
      const [ioText, setIoText] = React.useState('')

      const refresh = React.useCallback((signal) => {
        if (currentSessionId === null) {
          setLoading(false)
          return
        }
        setLoading(true)
        setError('')
        Promise.all([
          loadCatalog(ctx, currentSessionId, signal),
          loadState(ctx, currentSessionId, signal),
        ]).then(([catalog, state]) => {
          if (signal.aborted) return
          setSkills(catalog)
          setRequired(state.required)
          setLoaded(state.loaded)
          setCheckedAt(state.checkedAt)
          setLoading(false)
        }, (failure) => {
          if (signal.aborted) return
          setLoading(false)
          setError(String(failure?.message ?? failure))
        })
        return () => {}
      }, [currentSessionId])

      React.useEffect(() => {
        const abort = new AbortController()
        refresh(abort.signal)
        return () => abort.abort()
      }, [refresh])

      const mutate = (line, after) => {
        if (currentSessionId === null) return
        setNotice('')
        runCommand(ctx, currentSessionId, line).then(() => {
          const abort = new AbortController()
          refresh(abort.signal)
          if (typeof after === 'string') setNotice(after)
        }, (failure) => setNotice(String(failure?.message ?? failure)))
      }

      const toggle = (name) => {
        const isRequired = required.includes(name)
        const line = `/skills-manager ${isRequired ? 'unrequire' : 'require'} ${name}`
        setRequired((previous) => (isRequired ? previous.filter((entry) => entry !== name) : [...previous, name]))
        mutate(line)
      }

      const q = query.trim().toLowerCase()
      let rows = skills.filter((skill) => !q || skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q))
      if (sortBy === 'required') {
        rows = rows.slice().sort((a, b) => (required.includes(b.name) ? 1 : 0) - (required.includes(a.name) ? 1 : 0) || a.name.localeCompare(b.name))
      } else {
        rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name))
      }

      const groups = []
      if (groupBy === 'origin') {
        const map = new Map()
        for (const skill of rows) {
          const key = originOf(skill)
          if (!map.has(key)) map.set(key, [])
          map.get(key).push(skill)
        }
        for (const key of [...map.keys()].sort()) groups.push({ key, items: map.get(key) })
      } else {
        groups.push({ key: null, items: rows })
      }

      const verifiedAt = checkedAt === undefined ? '' : new Date(checkedAt).toLocaleString()

      const renderItem = (skill) => {
        const isRequired = required.includes(skill.name)
        const isLoaded = loaded.includes(skill.name)
        return h('label', { key: skill.name, className: `skm-item${isRequired ? ' skm-item-on' : ''}` },
          h('input', { type: 'checkbox', checked: isRequired, onChange: () => toggle(skill.name) }),
          h('div', { className: 'skm-body' },
            h('div', { className: 'skm-name' },
              skill.name,
              isRequired ? h('span', { className: 'skm-badge skm-badge-on' }, t('required')) : null,
              isRequired ? h('span', { className: `skm-badge ${isLoaded ? 'skm-badge-ok' : 'skm-badge-warn'}` }, isLoaded ? t('verified') : t('unverified')) : null,
              h('span', { className: 'skm-badge' }, skill.modelInvocable ? t('model') : t('userOnly')),
            ),
            h('div', { className: 'skm-meta' }, t(`origin.${originOf(skill)}`)),
            skill.description.length > 0 ? h('div', { className: 'skm-desc' }, skill.description) : null,
          ),
        )
      }

      if (currentSessionId === null) {
        return h('div', { className: 'skm-wrap' }, h('div', { className: 'skm-empty' }, t('noSession')))
      }

      return h('div', { className: 'skm-wrap' },
        h('div', { className: 'skm-head' },
          h('h3', { className: 'skm-title' }, t('title')),
          h('span', { className: 'skm-count' }, t('count', { installed: skills.length, required: required.length })),
        ),
        h('input', {
          className: 'skm-search',
          placeholder: t('filter'),
          value: query,
          onChange: (event) => setQuery(event.target.value),
        }),
        h('div', { className: 'skm-toolbar' },
          h('select', { className: 'skm-select', value: groupBy, onChange: (event) => setGroupBy(event.target.value) },
            h('option', { value: 'none' }, t('group.none')),
            h('option', { value: 'origin' }, t('group.origin')),
          ),
          h('select', { className: 'skm-select', value: sortBy, onChange: (event) => setSortBy(event.target.value) },
            h('option', { value: 'name' }, t('sort.name')),
            h('option', { value: 'required' }, t('sort.required')),
          ),
          h('button', {
            className: 'skm-btn',
            onClick: () => {
              runCommand(ctx, currentSessionId, '/skills-manager export').then((text) => {
                setIoText(text)
                setIoOpen(true)
                setNotice('')
              }, (failure) => setNotice(String(failure?.message ?? failure)))
            },
          }, t('export')),
          h('button', { className: 'skm-btn', onClick: () => { setIoOpen(!ioOpen); setNotice('') } }, t('import')),
        ),
        ioOpen ? h('div', { className: 'skm-io' },
          h('textarea', {
            value: ioText,
            placeholder: t('applyHint'),
            onChange: (event) => setIoText(event.target.value),
          }),
          h('button', {
            className: 'skm-btn',
            onClick: () => mutate(`/skills-manager import ${ioText.replace(/\s+/g, ' ').trim()}`),
          }, t('apply')),
        ) : null,
        notice.length > 0 ? h('div', { className: 'skm-meta' }, notice) : null,
        h('div', { className: 'skm-meta' },
          checkedAt === undefined ? t('neverChecked') : t('lastCheck', { time: verifiedAt }),
        ),
        loading
          ? h('div', { className: 'skm-empty' }, t('loading'))
          : error.length > 0
            ? h('div', { className: 'skm-err' }, t('error', { message: error }))
            : h('div', { className: 'skm-list' },
              rows.length === 0
                ? h('div', { className: 'skm-empty' }, t('empty'))
                : groups.map((group) => h(React.Fragment, { key: group.key ?? 'all' },
                  group.key === null ? null : h('div', { className: 'skm-group' }, t(`origin.${group.key}`)),
                  group.items.map(renderItem),
                )),
            ),
      )
    }

    /**
     * Settings section wrapper: owns the stylesheet as a rendered element, so
     * unmounting the section removes it.
     * @param props - slot props plus `sm` (context + translator).
     * @returns the section element.
     */
    function SkillsSection(props) {
      return h(React.Fragment, null,
        h('style', { key: 'skills-manager-css' }, CSS),
        h(SkillsPage, props),
      )
    }

    return {
      inject: ['slots', 'remote', 'remote.skills', 'remote.workspaceFiles', 'remote.commands'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale !== undefined && typeof locale.register === 'function') {
          ctx.effect(() => locale.register(NS, DICTIONARIES), 'skills-manager: dictionaries')
        }
        const t = locale !== undefined && typeof locale.bind === 'function'
          ? locale.bind(NS)
          : (key, params) => {
            let text = DICTIONARIES.en[key] ?? key
            if (params !== null && typeof params === 'object') {
              for (const [name, value] of Object.entries(params)) text = text.replace(`{${name}}`, String(value))
            }
            return text
          }
        ctx.slots.inject('settings.section', () => ctx.slots.register(
          { name: 'settings.section', id: 'skills-manager', label: () => t('title'), order: 30 },
          (props) => h(SkillsSection, { ...props, sm: { ctx, t } }),
        ))
      },
    }
  },
})
