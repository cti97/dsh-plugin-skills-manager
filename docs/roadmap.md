# Roadmap

What is deliberately still open, in rough value order. Everything here is
optional; the shipped plugin works without it.

## Candidate work

1. **Generated Typert face for a real RPC.** A bundle can expose
   `remote.<namespace>` methods only through artifacts produced by the Typert
   generator. With them, the page could read and write the required set in one
   call each and the `/skills-manager` command would stop being the write path.
   Cost: a build step, a runtime schema dependency, and a `dsh.client.external`
   wiring decision.
2. **A live "loaded" signal.** Today the badge carries the last verification
   time. A session projection whose `wire.view` publishes the loaded set would
   make it live without the page reading the log itself.
3. **Reach the model-only catalog.** `remote.skills.list` returns the
   user-invocable set; model-only skills never appear in the page. Fixing this
   needs a Host-side catalog surface the Client may call, i.e. item 1.
4. **Enforcement, not intent.** Pinning records intent. Injecting a required-skill
   reminder through `agent.inject()` (or a `skill` guard) when a turn starts
   would act on it. This changes agent behavior, so it needs its own design and
   its own verification.

## Explicitly not planned

- Reviving the dynamic-package halves in [`legacy/`](../legacy/): the model-facing
  authoring flow no longer exists.
- Storing the required set in the profile's settings file: it is per-session
  state, and the workspace file already survives restart with the right scope.
