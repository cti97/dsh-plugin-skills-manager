/**
 * Skills Manager — Client half
 * -----------------------------
 * Runs in the browser page of the DSH (DeepSeek Harness) web GUI.
 *
 * Responsibilities:
 *   1. Registers a "Skills" page in the Settings panel (`settings.section`).
 *   2. Lists every skill the current session's agent can see, with a filter box.
 *   3. Lets the user check which skills must be used for their prompts, and
 *      persists that set through the host's `set-required` RPC (durable).
 *   4. Shows availability state (available / not loaded) for required skills.
 *   5. Grouping (source / provider) and sorting (name / required-first).
 *   6. Import / export the required set as JSON.
 *
 * Communicates with the host via `host.call(method, args)` (Client → Host).
 * Uses plain JavaScript + React.createElement (no JSX, no imports).
 */
export default {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    const css = `
      .skm-wrap { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; }
      .skm-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
      .skm-title { font-size: 15px; font-weight: 600; margin: 0; }
      .skm-count { font-size: 12px; opacity: 0.6; }
      .skm-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .skm-search { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border, rgba(128,128,128,0.3)); background: transparent; color: inherit; width: 100%; box-sizing: border-box; }
      .skm-select { padding: 6px 8px; border-radius: 8px; border: 1px solid var(--border, rgba(128,128,128,0.3)); background: transparent; color: inherit; font-size: 12px; }
      .skm-btn { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border, rgba(128,128,128,0.3)); background: transparent; color: inherit; font-size: 12px; cursor: pointer; }
      .skm-btn:hover { background: var(--hover, rgba(128,128,128,0.08)); }
      .skm-list { display: flex; flex-direction: column; gap: 6px; max-height: 60vh; overflow: auto; }
      .skm-group { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.55; margin: 8px 0 2px; }
      .skm-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border, rgba(128,128,128,0.18)); cursor: pointer; }
      .skm-item:hover { background: var(--hover, rgba(128,128,128,0.08)); }
      .skm-item.skm-required { border-color: rgba(80,160,255,0.55); background: rgba(80,160,255,0.10); }
      .skm-body { flex: 1; min-width: 0; }
      .skm-name { font-weight: 600; font-size: 13px; }
      .skm-name .skm-badge { margin-left: 6px; font-size: 11px; font-weight: 600; color: #4a90ff; }
      .skm-name .skm-badge.skm-avail { color: #3fbf6f; }
      .skm-name .skm-badge.skm-miss { color: #e0a030; }
      .skm-meta { font-size: 11px; opacity: 0.55; margin-top: 2px; }
      .skm-desc { font-size: 12px; opacity: 0.7; margin-top: 2px; }
      .skm-empty { font-size: 12px; opacity: 0.6; padding: 8px; }
      .skm-loading { font-size: 12px; opacity: 0.6; padding: 8px; }
      .skm-err { font-size: 12px; color: #e06060; padding: 8px; }
      .skm-io { display: flex; gap: 8px; align-items: center; }
      .skm-io textarea { flex: 1; min-height: 60px; border-radius: 8px; border: 1px solid var(--border, rgba(128,128,128,0.3)); background: transparent; color: inherit; font-size: 12px; padding: 6px; box-sizing: border-box; }
    `
    styles.insert(css)

    // settings.section standard props give us the session list + current selection.
    function SkillsPage(props) {
      const [skills, setSkills] = React.useState([])
      const [required, setRequired] = React.useState([])
      const [avail, setAvail] = React.useState([])
      const [query, setQuery] = React.useState('')
      const [groupBy, setGroupBy] = React.useState('none')
      const [sortBy, setSortBy] = React.useState('name')
      const [loading, setLoading] = React.useState(true)
      const [err, setErr] = React.useState('')
      const [ioOpen, setIoOpen] = React.useState(false)
      const [ioText, setIoText] = React.useState('')
      const [ioMsg, setIoMsg] = React.useState('')
      const useSessions = props.useSessions
      const currentSessionId = (useSessions ? useSessions((s) => s.current) : undefined) || null

      const refresh = React.useCallback(() => {
        let alive = true
        Promise.all([
          host.call('list-skills', { sessionId: currentSessionId }),
          host.call('get-required', { sessionId: currentSessionId }),
          host.call('check-required', { sessionId: currentSessionId }),
        ])
          .then(([sk, req, chk]) => {
            if (!alive) return
            setSkills(sk || [])
            setRequired(req || [])
            setAvail((chk && chk.available) || [])
            setLoading(false)
          })
          .catch((e) => { if (alive) { setLoading(false); setErr(String(e && e.message || e)) } })
        return () => { alive = false }
      }, [currentSessionId])

      React.useEffect(() => refresh(), [refresh])

      const toggle = (name) => {
        const next = required.includes(name)
          ? required.filter((n) => n !== name)
          : [...required, name]
        setRequired(next)
        host.call('set-required', { sessionId: currentSessionId, names: next }).then(() => refresh()).catch(() => {})
      }

      const doExport = () => {
        host.call('export-required', { sessionId: currentSessionId })
          .then((json) => { setIoText(json); setIoOpen(true); setIoMsg('Copied to textarea — copy it to save.') })
          .catch((e) => setIoMsg('Export failed: ' + String(e && e.message || e)))
      }

      const doImport = () => {
        host.call('import-required', { sessionId: currentSessionId, json: ioText })
          .then((names) => { setRequired(names || []); setIoOpen(false); setIoMsg('Imported ' + (names || []).length + ' required skills.'); refresh() })
          .catch((e) => setIoMsg('Import failed: ' + String(e && e.message || e)))
      }

      const q = query.trim().toLowerCase()
      let rows = skills.filter((s) =>
        !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )

      if (sortBy === 'required') {
        rows = rows.slice().sort((a, b) => (required.includes(b.name) ? 1 : 0) - (required.includes(a.name) ? 1 : 0) || a.name.localeCompare(b.name))
      } else {
        rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name))
      }

      const groupKey = (s) => {
        if (groupBy === 'source') return s.source || 'unknown'
        if (groupBy === 'provider') return s.provider || 'unknown'
        return null
      }
      const groups = []
      if (groupBy === 'none') {
        groups.push({ key: null, items: rows })
      } else {
        const map = new Map()
        rows.forEach((s) => { const k = groupKey(s); if (!map.has(k)) map.set(k, []); map.get(k).push(s) })
        Array.from(map.keys()).sort().forEach((k) => groups.push({ key: k, items: map.get(k) }))
      }

      const renderItem = (s) => {
        const isReq = required.includes(s.name)
        const isAvail = avail.includes(s.name)
        return React.createElement('label', {
          key: s.name,
          className: 'skm-item' + (isReq ? ' skm-required' : ''),
        },
          React.createElement('input', {
            type: 'checkbox',
            className: 'skm-req',
            checked: isReq,
            onChange: () => toggle(s.name),
          }),
          React.createElement('div', { className: 'skm-body' },
            React.createElement('div', { className: 'skm-name' },
              s.name,
              isReq ? React.createElement('span', { className: 'skm-badge' }, 'required') : null,
              isReq && isAvail ? React.createElement('span', { className: 'skm-badge skm-avail' }, 'available') : null,
              isReq && !isAvail ? React.createElement('span', { className: 'skm-badge skm-miss' }, 'not loaded') : null,
            ),
            React.createElement('div', { className: 'skm-meta' },
              [s.source, s.provider].filter(Boolean).join(' · ') + (s.modelInvocable ? ' · model' : '') + (s.userInvocable ? ' · user' : ''),
            ),
            s.description ? React.createElement('div', { className: 'skm-desc' }, s.description) : null,
          ),
        )
      }

      return React.createElement('div', { className: 'skm-wrap' },
        React.createElement('div', { className: 'skm-head' },
          React.createElement('h3', { className: 'skm-title' }, 'Skills Manager'),
          React.createElement('span', { className: 'skm-count' },
            skills.length + ' installed · ' + required.length + ' required'),
        ),
        React.createElement('input', {
          className: 'skm-search',
          placeholder: 'Filter skills…',
          value: query,
          onChange: (e) => setQuery(e.target.value),
        }),
        React.createElement('div', { className: 'skm-toolbar' },
          React.createElement('select', {
            className: 'skm-select',
            value: groupBy,
            onChange: (e) => setGroupBy(e.target.value),
          },
            React.createElement('option', { value: 'none' }, 'No grouping'),
            React.createElement('option', { value: 'source' }, 'Group by source'),
            React.createElement('option', { value: 'provider' }, 'Group by provider'),
          ),
          React.createElement('select', {
            className: 'skm-select',
            value: sortBy,
            onChange: (e) => setSortBy(e.target.value),
          },
            React.createElement('option', { value: 'name' }, 'Sort by name'),
            React.createElement('option', { value: 'required' }, 'Required first'),
          ),
          React.createElement('button', { className: 'skm-btn', onClick: doExport }, 'Export'),
          React.createElement('button', { className: 'skm-btn', onClick: () => { setIoOpen(!ioOpen); setIoMsg('') } }, 'Import'),
        ),
        ioOpen ? React.createElement('div', { className: 'skm-io' },
          React.createElement('textarea', {
            value: ioText,
            placeholder: 'Paste a JSON array of skill names here…',
            onChange: (e) => setIoText(e.target.value),
          }),
          React.createElement('button', { className: 'skm-btn', onClick: doImport }, 'Apply'),
        ) : null,
        ioMsg ? React.createElement('div', { className: 'skm-meta' }, ioMsg) : null,
        loading
          ? React.createElement('div', { className: 'skm-loading' }, 'Loading skills…')
          : err
            ? React.createElement('div', { className: 'skm-err' }, 'Error: ' + err)
            : React.createElement('div', { className: 'skm-list' },
                groups.length === 0 || groups.every((g) => g.items.length === 0)
                  ? React.createElement('div', { className: 'skm-empty' }, 'No skills match.')
                  : groups.map((g) =>
                      React.createElement(React.Fragment, { key: g.key || 'all' },
                        g.key !== null ? React.createElement('div', { className: 'skm-group' }, g.key) : null,
                        g.items.map(renderItem),
                      ),
                    ),
              ),
      )
    }

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'skills-manager', label: 'Skills', order: 30 },
      (props) => React.createElement(SkillsPage, props),
    ))
  },
}
