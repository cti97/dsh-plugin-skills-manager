# Loading this plugin

This page moved. The 1.x instructions described a **dynamic Cordis package**
(call `cordis_define`, paste the body of each half, approve the run). Current DSH
no longer offers that flow to an agent — its Host runner's own README states that
the shipped Creator workflow installs persistent bundles and that no model tool
creates dynamic definitions.

Use [installation.md](installation.md): clone the checkout, `npm test`, then
`plugin_manager` with `action: install_bundle` and the checkout's absolute path.

The retired 1.x halves are kept in [`legacy/`](../legacy/) for reference only;
nothing in the package loads them.
