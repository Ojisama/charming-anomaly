// Scene: HOW OFTEN IS A SUNKEN SHIP ON SCREEN, over a real 300s, for three ways of moving.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-hull-rate.js --chapter wreck \
//     --url 'http://127.0.0.1:PORT/' --out /tmp/hr --frames 3 [--w 1280 --h 800]
//
// The answer is in the NOTE on each frame, not in the picture. Owner, 2026-09-07: "i almost never
// seen wreckage ships i don't know why". The hull field is dense in its own layer (wreck-spawn.js,
// map mode) but that layer moves at CHAPTERS.wreck.render.hull.parallax of the world, so the
// question is how much of the layer a player actually crosses. Three arms, 300s each from (0,0):
//   frame 0  standing still — the tide alone
//   frame 1  kiting: the joystick turns at 0.35 rad/s, the survivors-genre circle
//   frame 2  swimming in one straight line
// Every second the renderer syncs and every visible Sprite scaled >= 4x whose screen bounds exceed
// 1500px (only a hull is that big and that scaled) is tested against the viewport. Reports the
// seconds a hull was on screen, the distinct encounters (off -> on), and how many hull sprites the
// pool held at all — the denominator that proves the detector saw hulls somewhere.
const p = run.player
const W = app.screen.width, HGT = app.screen.height
const ARMS = ['still', 'kite', 'straight']
let arm = 0
function hullsOnScreen() {
  let on = 0, pooled = 0
  const walk = (node) => {
    if (!node.visible) return
    if (node.texture && node.scale && node.scale.x >= 4) {
      const b = node.getBounds()
      if (Math.max(b.width, b.height) > 1500) {
        pooled++
        if (b.maxX > 0 && b.minX < W && b.maxY > 0 && b.minY < HGT) on++
      }
    }
    if (node.children) for (const c of node.children) walk(c)
  }
  walk(app.stage)
  return { on, pooled }
}
return () => {
  const name = ARMS[arm]
  p.x = 0; p.y = 0; p.vx = 0; p.vy = 0
  run.time = 0
  const dt = 1 / 30
  let onSecs = 0, encounters = 0, was = false, maxPooled = 0, acc = 0, far = 0
  for (let s = 0; s < 300 * 30; s++) {
    const t = s * dt
    const input = name === 'still' ? { x: 0, y: 0 }
      : name === 'kite' ? { x: Math.cos(t * 0.35), y: Math.sin(t * 0.35) }
      : { x: 1, y: 0 }
    step(run, input, dt)
    run.events.length = 0
    p.hp = p.maxHP
    run.enemies.length = 0
    acc += dt
    if (acc >= 1) {
      acc = 0
      window.__renderer.sync(run, 0.05, [])
      const { on, pooled } = hullsOnScreen()
      maxPooled = Math.max(maxPooled, pooled)
      if (on > 0) onSecs++
      if (on > 0 && !was) encounters++
      was = on > 0
      far = Math.max(far, Math.hypot(p.x, p.y))
    }
  }
  H.note(JSON.stringify({ arm: name, view: W + 'x' + HGT, onSecs, of: 300, encounters, maxPooled, farthestPx: Math.round(far) }))
  app.renderer.render(app.stage)
  arm++
}
