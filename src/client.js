/**
 * Skills Manager — Client half
 * -----------------------------
 * Runs in the browser page of the DSH (DeepSeek Harness) web GUI.
 *
 * Responsibilities:
 *   1. Registers a "Skills" page in the Settings panel (`settings.section`).
 *   2. Lists every skill the current session's agent can see, with a filter box.
 *   3. Lets the user check which skills must be used for their prompts, and
 *      persists that set through the host's `set-required` RPC.
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
      .skm-head { display: flex; align-items: baseline; justify-content: space-between; }
      .skm-title { font-size: 15px; font-weight: 600; margin: 0; }
      .skm-count { font-size: 12px; opacity: 0.6; }
      .skm-search { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border, rgba(128,128,128,0.3)); background: transparent; color: inherit; width: 100%; box-sizing: border-box; }
      .skm-list { display: flex; flex-direction: column; gap: 6px; max-height: 60vh; overflow: auto; }
      .skm-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border, rgba(128,128,128,0.18)); cursor: pointer; }
      .skm-item:hover { background: var(--hover, rgba(128,128,128,0.08)); }
      .skm-item.skm-required { border-color: rgba(80,160,255,0.55); background: rgba(80,160,255,0.10); }
      .skm-body { flex: 1; min-width: 0; }
      .skm-name { font-weight: 600; font-size: 13px; }
      .skm-name .skm-badge { margin-left: 6px; font-size: 11px; font-weight: 600; color: #4a90ff; }
      .skm-desc { font-size: 12px; opacity: 0.7; margin-top: 2px; }
      .skm-empty { font-size: 12px; opacity: 0.6; padding: 8px; }
      .skm-loading { font-size: 12px; opacity: 0.6; padding: 8px; }
      .skm-err { font-size: 12px; color: #e06060; padding: 8px; }
    `
    styles.insert(css)

    // settings.section standard props give us the session list + current selection.
    function SkillsPage(props) {
      const [skills, setSkills] = React.useState([])
      const [required, setRequired] = React.useState([])
      const [query, setQuery] = React.useState('')
      const [loading, setLoading] = React.useState(true)
      const [err, setErr] = React.useState('')
      const useSessions = props.useSessions
      const currentSessionId = (useSessions ? useSessions((s) => s.current) : undefined) || null

      React.useEffect(() => {
        let alive = true
        Promise.all([
          host.call('list-skills', { sessionId: currentSessionId }),
          host.call('get-required'),
        ])
          .then(([sk, req]) => {
            if (!alive) return
            setSkills(sk || [])
            setRequired(req || [])
            setLoading(false)
          })
          .catch((e) => { if (alive) { setLoading(false); setErr(String(e && e.message || e)) } })
        return () => { alive = false }
      }, [currentSessionId])

      const toggle = (name) => {
        const next = required.includes(name)
          ? required.filter((n) => n !== name)
          : [...required, name]
        setRequired(next)
        host.call('set-required', next).catch(() => {})
      }

      const q = query.trim().toLowerCase()
      const filtered = skills.filter((s) =>
        !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )

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
        loading
          ? React.createElement('div', { className: 'skm-loading' }, 'Loading skills…')
          : err
            ? React.createElement('div', { className: 'skm-err' }, 'Error: ' + err)
            : React.createElement('div', { className: 'skm-list' },
                filtered.length === 0
                  ? React.createElement('div', { className: 'skm-empty' }, 'No skills match.')
                  : filtered.map((s) => {
                      const isReq = required.includes(s.name)
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
                          ),
                          s.description ? React.createElement('div', { className: 'skm-desc' }, s.description) : null,
                        ),
                      )
                    }),
              ),
      )
    }

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'skills-manager', label: 'Skills', order: 30 },
      (props) => React.createElement(SkillsPage, props),
    ))
  },
}
