// Scene: KRAKEN FIGHT LAG. Measures, does not judge a look. Plays the fight with kraken-live.js's
// bot and times sim step / renderer.sync / draw per frame, tagged by what the fight is doing.
//
//   FX_CHROME_ARGS='--use-angle=gl --enable-gpu --ignore-gpu-blocklist' \
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-lag.js --chapter kraken --difficulty 3 \
//     --frames 1 --wait 580000 --out /tmp/kg --json /tmp/kg.json --url 'http://127.0.0.1:5203/?secs=220&every=1'
//
// FX_CHROME_ARGS puts it on the laptop's weak Intel GPU (a phone stand-in; without it WebGL is
// software and one frame can take seconds). ?ablate=1 redraws each spike with every layer hidden in
// turn. SPIKE COUNTS (over25) ARE NOISY: the same build read 4 and 26 across runs, and they move with
// any code change (JIT/GC). Compare the per-state MEANS, and take two runs a side before a spike claim.
H.until(() => run.script.phase === 'boss' && run.krakenArms.length > 0, 8000)
const rung = window.__cfg.krakenRung(run.difficulty)
const head = () => run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null
const SECS = Number(new URLSearchParams(location.search).get('secs') || 150)

function input() {
  const p = run.player, h = head()
  let ix = 0, iy = 0, tx = p.x, ty = p.y
  const limp = run.krakenArms.filter((a) => !a.dead && a.limpT > 0)
  const winding = run.krakenArms.filter((a) => !a.dead && a.limpT <= 0 && (a.tele > 0 || a.gripT > 0))
  if (limp.length) { tx = limp[0].x; ty = limp[0].y }
  else if (winding.length) { tx = winding[0].x; ty = winding[0].y }
  else if (h) {
    const ang = Math.atan2(p.y - h.y, p.x - h.x)
    tx = h.x + Math.cos(ang) * window.__cfg.KRAKEN_ARM_REACH * 1.2
    ty = h.y + Math.sin(ang) * window.__cfg.KRAKEN_ARM_REACH * 1.2
  }
  const dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy)
  if (dl > 6) { ix = dx / dl * 0.85; iy = dy / dl * 0.85 }
  const reach2 = (window.__cfg.KRAKEN_LASH_R * 1.6) ** 2
  let press = false
  if ((run.repulseCd ?? 0) <= 0) {
    if (h && run.script.phase === 'chase' && (h.dashWin ?? 0) > 0) press = true
    for (const a of run.krakenArms) {
      if (a.dead || a.limpT > 0 || (a.x - p.x) ** 2 + (a.y - p.y) ** 2 > reach2) continue
      if (a.tele > 0 && a.tele <= rung.window) { press = true; break }
    }
  }
  const g = run.krakenArms.find((a) => !a.dead && a.gripT > 0)
  if (g) { g._botA = (g._botA ?? 0) + Math.PI / 30; ix = Math.cos(g._botA); iy = Math.sin(g._botA) }
  return { x: ix, y: iy, skill: press }
}
function tag() {
  const s = run.script, live = run.krakenArms.filter((a) => !a.dead)
  const t = []
  if ((s.coilT ?? 0) > 0) t.push('coil')
  if (live.some((a) => a.grabArm)) t.push('grab')
  if (live.some((a) => a.slapArm)) t.push('slap')
  if (live.some((a) => a.gripT > 0)) t.push('grip')
  if (live.some((a) => a.rageArm)) t.push('rage')
  if (live.some((a) => a.tele > 0 && !a.grabArm && !a.slapArm)) t.push('slam')
  if (live.some((a) => a.limpT > 0)) t.push('limp')
  return (s.phase || '?') + ':' + (t.join('+') || 'idle')
}
const countVisible = (o) => {
  if (!o.visible || o.alpha === 0) return 0
  let n = o.children?.length ? 0 : 1
  for (const c of o.children ?? []) n += countVisible(c)
  return n
}
// Software WebGL is slow, so only every EVERY-th frame is drawn and timed (every frame while a Coil
// is up): step is the sim time of that frame alone, sync is handed the frames' summed dt + events.
// ?every=1 on a real GPU (FX_CHROME_ARGS) times every frame; draw includes gl.finish(), so the GPU's
// own time is in it, and worst lists each spike with the fight clock and the events of its frame.
const EVERY = Number(new URLSearchParams(location.search).get('every') || 6)
const gl = app.renderer.gl
const ABLATE = new URLSearchParams(location.search).get('ablate') === '1'
// raw GL traffic per frame (texture uploads, buffer uploads in KB, shader links), listed on each spike
const glc = {}
for (const m of ['texImage2D', 'texSubImage2D', 'bufferData', 'bufferSubData', 'linkProgram', 'compileShader', 'texStorage2D', 'createTexture']) {
  const f = gl[m].bind(gl)
  gl[m] = (...a) => {
    glc[m] = (glc[m] ?? 0) + 1
    if (m.startsWith('buffer')) { const d = a[m === 'bufferData' ? 1 : 2]; glc[m + 'KB'] = (glc[m + 'KB'] ?? 0) + ((typeof d === 'number' ? d : d?.byteLength ?? 0) >> 10) }
    if (m.startsWith('tex') && m !== 'texStorage2D') { const w = a.find((x) => x?.width) ?? null; glc[m + 'px'] = (glc[m + 'px'] ?? 0) + (w ? w.width * w.height : (a[3] ?? 0) * (a[4] ?? 0)) }
    return f(...a)
  }
}
// ?nofilter=1: strip every filter off the stage tree before the fight, for an A/B of their cost
if (new URLSearchParams(location.search).get('nofilter') === '1') {
  const strip = (o) => { if (o.filters?.length) o.filters = null; o.children?.forEach(strip) }
  strip(app.stage)
}
const spikes = []
// re-syncs at dt 0 first, so every Graphics the frame redraws is rebuilt (and re-tessellated) again
const timeDraw = (o) => {
  window.__renderer.sync(run, 0, [])
  const was = o?.visible
  if (o) o.visible = false
  gl.finish()
  const a = performance.now()
  app.renderer.render(app.stage)
  gl.finish()
  if (o) o.visible = was
  return performance.now() - a
}
const ablate = () => {
  const out = []
  const walk = (o, path, depth) => {
    if (!o.visible) return
    out.push({ path, what: o.constructor.name + (o.filters?.length ? ' FILTER' : '') + (o.mask || o._maskEffect ? ' MASK' : '') + ' ch' + (o.children?.length ?? 0), ms: +timeDraw(o).toFixed(1) })
    if (depth < 3 && o.children?.length < 60) o.children.forEach((c, i) => walk(c, path + '[' + i + ']', depth + 1))
  }
  app.stage.children.forEach((c, i) => walk(c, 'stage[' + i + ']', 1))
  return out.sort((x, y) => x.ms - y.ms).slice(0, 6)
}
// every Graphics holding > 40 draw calls, its calls grouped by style: [count, path ops, poly points]
const gstats = () => {
  const out = {}
  const walk = (o, path) => {
    if (!o.visible) return
    const ins = o.context?.instructions
    if (ins && ins.length > 40) {
      const g = out[path] = {}
      for (const it of ins) {
        const st = it.data?.style ?? {}
        const key = it.action + ' #' + (st.color ?? 0).toString(16) + ' w' + Math.round(st.width ?? 0) + ' ' + (st.join ?? '') + ' ' + (st.cap ?? '')
        const pi = it.data?.path?.instructions ?? []
        let pts = 0
        for (const p of pi) for (const a of p.data ?? []) if (Array.isArray(a)) pts += a.length / 2
        const r = g[key] ??= [0, 0, 0]
        r[0]++; r[1] += pi.length; r[2] += pts
      }
    }
    o.children?.forEach((c, i) => walk(c, path + '[' + i + ']'))
  }
  app.stage.children.forEach((c, i) => walk(c, 'stage[' + i + ']'))
  return out
}
// the visible Graphics with the most tessellated vertices this frame: path -> [verts, draw calls]
const gverts = () => {
  const out = []
  const walk = (o, path) => {
    if (!o.visible) return
    if (o.context) {
      const v = app.renderer.graphicsContext.getGpuContext(o.context)?.geometryData?.vertices.length ?? 0
      out.push([path, v / 2, o.context.instructions.length])
    }
    o.children?.forEach((c, i) => walk(c, path + '[' + i + ']'))
  }
  app.stage.children.forEach((c, i) => walk(c, 'stage[' + i + ']'))
  return out.sort((x, y) => y[1] - x[1]).slice(0, 5)
}
const rows = []
const landVerts = []
let landAt = 0
let ev = [], acc = 0
for (let f = 0; f < SECS * 60 && run.phase !== 'victory'; f++) {
  run.player.hp = run.player.maxHP
  const a = performance.now()
  step(run, input(), 1 / 60)
  const b = performance.now()
  ev.push(...run.events.splice(0)); acc += 1 / 60
  if (run.phase === 'levelup') run.phase = 'playing'
  const k = tag()
  if (f % EVERY && !k.includes('coil')) continue
  for (const k in glc) delete glc[k]

  const c0 = performance.now()
  window.__renderer.sync(run, acc, ev)
  const c = performance.now()
  app.renderer.render(app.stage)
  const rEnd = performance.now()
  gl?.finish()
  const d = performance.now()
  rows.push({ k, t: +run.time.toFixed(2), types: [...new Set(ev.map((e) => e.type))].join(','), step: b - a, sync: c - c0, draw: d - c, rjs: rEnd - c, ev: ev.length, kb: glc.bufferSubDataKB ?? 0, gl: d - c > 25 ? { ...glc, verts: gverts() } : null, vis: rows.length % 5 ? 0 : countVisible(app.stage) })
  if (ev.some((e) => e.type === "coilClose")) landAt = 5
  if (landAt > 0 && --landAt === 0) landVerts.push(gverts())
  ev = []; acc = 0
  // ?ablate=1: on a spike (draw > 25ms) redraw that same frame with each layer hidden in turn
  if (ABLATE && d - c > 25 && spikes.length < 12) spikes.push({ t: +run.time.toFixed(2), k, draw: +(d - c).toFixed(1), redraw: +timeDraw(null).toFixed(1), top: ablate(), shapes: gstats() })
}
window.__spikes = spikes
// every Coil landing (coilClose) lined up: per frame offset from impact, the median and max ms (sync + draw)
const landing = () => {
  const at = rows.map((r, i) => (r.types.includes("coilClose") ? i : -1)).filter((i) => i >= 0)
  const per = []
  for (let o = -5; o <= 40; o++) {
    const xs = at.map((i) => rows[i + o]).filter(Boolean).map((r) => r.sync + r.draw).sort((x, y) => x - y)
    const sy = at.map((i) => rows[i + o]).filter(Boolean).map((r) => r.sync).sort((x, y) => x - y)
    if (xs.length) per.push([o, +xs[xs.length >> 1].toFixed(1), +xs[xs.length - 1].toFixed(1), "sync", +sy[sy.length >> 1].toFixed(1)])
  }
  return { coils: at.length, at: at.map((i) => rows[i].t), per, verts: landVerts }
}
const agg = {}
for (const r of rows) {
  const g = agg[r.k] ??= { n: 0, step: 0, sync: 0, draw: 0, ev: 0, vis: 0, nv: 0, max: 0 }
  g.n++; g.step += r.step; g.sync += r.sync; g.draw += r.draw; g.ev += r.ev
  if (r.vis) { g.vis += r.vis; g.nv++ }
  g.max = Math.max(g.max, r.step + r.sync + r.draw)
}
const out = Object.entries(agg).map(([k, g]) => ({ k, n: g.n, step: +(g.step / g.n).toFixed(2), sync: +(g.sync / g.n).toFixed(2), draw: +(g.draw / g.n).toFixed(2), ev: +(g.ev / g.n).toFixed(1), vis: g.nv ? Math.round(g.vis / g.nv) : null, max: +g.max.toFixed(1) }))
out.sort((x, y) => (y.step + y.sync + y.draw) - (x.step + x.sync + x.draw))
const worst = [...rows].sort((x, y) => (y.step + y.sync + y.draw) - (x.step + x.sync + x.draw)).slice(0, 30).map((r) => ({ k: r.k, t: r.t, types: r.types, step: +r.step.toFixed(1), sync: +r.sync.toFixed(1), draw: +r.draw.toFixed(1), rjs: +r.rjs.toFixed(1), ev: r.ev, gl: r.gl }))
const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
const median = (k) => { const s = rows.map((r) => r[k]).sort((x, y) => x - y); return +s[s.length >> 1].toFixed(2) }
window.__fxResult = { land: landing(), kbMedian: [...rows].map((r) => r.kb).sort((x, y) => x - y)[rows.length >> 1], over25: rows.filter((r) => r.draw > 25).length, over16: rows.filter((r) => r.sync + r.draw > 16).length, spikes, gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?', median: { step: median('step'), sync: median('sync'), draw: median('draw') }, frames: rows.length, phase: run.phase, byState: out, worst }
H.note('done ' + rows.length)
