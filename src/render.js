// STUB — implemented by the render subagent. PixiJS v8 only; reads run state, never mutates it.

/**
 * Contract used by main.js:
 *   const r = createRenderer(app)
 *   r.reset(run|null)          new run started (build world) or back to title (clear)
 *   r.sync(run, dt, events)    draw current state; dt=0 means "frozen behind a modal"
 *   r.idle(dt)                 no run active (title screen background)
 */
export function createRenderer(app) {
  return {
    reset(run) {},
    sync(run, dt, events) {},
    idle(dt) {},
  }
}
