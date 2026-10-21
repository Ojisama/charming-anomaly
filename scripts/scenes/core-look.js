// Scene: THE CORE's look (src/liquid.js), PLAYED rather than staged: the real spawner fills the
// crowd, the sim moves it, the player stands where each mode puts it.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/core-look.js --chapter core \
//     --url 'http://127.0.0.1:PORT/?mode=crowd&pole=1' --out /tmp/cl --frames 6
//
//   mode=crowd   warm up until every roster id is alive (or 7000 ticks), then one frame per 6 ticks
//   mode=move    the same crowd, the player walking east-north-east: the world must scroll
//   mode=pool    the nearest pool, the player walking up to its shore (rel=opp: the other pole,
//                rel=same: yours) and standing there
//   mode=pillar  the nearest pillar, the player 70px off it (rel=opp: it pulls, rel=same: it pushes)
//   mode=cost    times sync + render (ms/frame, 120 frames) with the crowd up; --json for the numbers
//                (any --chapter: run it on mantle for the A/B)
//   pole=1|-1    your pole (North / South)
const q = new URLSearchParams(location.search)
const mode = q.get('mode') || 'crowd'
const pole = Number(q.get('pole') || 1)
const rel = q.get('rel') || 'opp'
const IDS = ['ferriteMite', 'needleUrchin', 'spinningTop', 'ferroBlob', 'dipoleEel', 'lodestoneGolem']
const result = { mode, chapter: run.chapter }
window.__fxResult = result
// cost mode runs on any chapter (the A/B against The Mantle); every other mode needs The Core
if (run.chapter !== 'core' && mode !== 'cost') throw new Error('not The Core: ' + run.chapter)
const p = run.player
let frame = 0
const setPole = () => { if (run.polarity) { run.polarity.pole = pole; run.polarity.poolCd = 9 } }
const crowd = () => {
  run.weapons = [{ id: 'sling', level: 3 }]
  H.tick()
  setPole()
  H.until(() => { setPole(); return (run.chapter !== 'core' || IDS.every((id) => run.enemies.some((e) => !e._dead && e.rosterId === id))) && run.time > 40 }, 7000)
  result.ids = IDS.filter((id) => run.enemies.some((e) => !e._dead && e.rosterId === id))
  result.enemies = run.enemies.length
}
const near = (list) => list.reduce((b, o) => (!b || Math.hypot(o.x - p.x, o.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? o : b), null)
const play = (n, mv = { x: 0, y: 0 }, pin = null) => {
  for (let i = 0; i < n; i++) {
    setPole()
    step(run, mv, 1 / 60)
    const ev = run.events.splice(0)
    p.hp = p.maxHP
    if (pin) { p.x = pin.x; p.y = pin.y }
    window.__renderer.sync(run, 1 / 60, ev)
  }
  app.renderer.render(app.stage)
}
let pool = null, pil = null
return () => {
  if (frame === 0) {
    if (mode === 'crowd' || mode === 'move' || mode === 'cost') crowd()
    else { H.tick(); setPole(); run.weapons = [] }
    for (let i = 0; i < 30; i++) H.render()
  }
  if (mode === 'crowd') play(6)
  else if (mode === 'move') play(10, { x: 0.92, y: 0.38 })
  else if (mode === 'pool') {
    if (!pool) {
      const want = rel === 'opp' ? -pole : pole
      pool = near(run.corePools.filter((c) => c.pole === want))
      if (!pool) throw new Error('no pool of pole ' + want)
      run.enemies.length = 0
      result.pool = pool
    }
    // walk in along the pool's local +x axis, from 220px past the shore to 18px off it
    const k = Math.min(1, frame / 4), off = 220 - 202 * k
    const c = Math.cos(pool.rot), s = Math.sin(pool.rot)
    const d = pool.rx + off
    play(frame === 0 ? 120 : 30, { x: 0, y: 0 }, { x: pool.x + c * d, y: pool.y + s * d })
  } else if (mode === 'pillar') {
    if (!pil) {
      const want = rel === 'opp' ? -pole : pole
      pil = near(run.obstacles.filter((o) => o.kind === 'pillar' && o.pole === want))
      if (!pil) throw new Error('no pillar of pole ' + want)
      run.enemies.length = 0
      result.pillar = { x: pil.x, y: pil.y, r: pil.r, pole: pil.pole }
    }
    const a = 0.5 + frame * 0.35
    play(frame === 0 ? 120 : 20, { x: 0, y: 0 }, { x: pil.x + Math.cos(a) * 70, y: pil.y + Math.sin(a) * 70 })
  } else if (mode === 'cost') {
    play(30)
    const t = { sync: [], draw: [] }
    const gl = app.renderer.gl, px = new Uint8Array(4)
    for (let f = 0; f < 120; f++) {
      step(run, { x: Math.cos(f / 20), y: Math.sin(f / 20) }, 1 / 60)
      const ev = run.events.splice(0)
      p.hp = p.maxHP
      const a = performance.now()
      window.__renderer.sync(run, 1 / 60, ev)
      const b = performance.now()
      app.renderer.render(app.stage)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)   // wait for the GPU, or render ms is only the submit
      const c = performance.now()
      t.sync.push(b - a); t.draw.push(c - b)
    }
    const stat = (xs) => { const s = [...xs].sort((x, y) => x - y); return { mean: +(s.reduce((u, x) => u + x, 0) / s.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2) } }
    result.rows = (result.rows || []).concat([{ enemies: run.enemies.length, sync: stat(t.sync), draw: stat(t.draw) }])
  }
  frame++
}
