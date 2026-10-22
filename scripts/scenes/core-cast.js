// Scene: THE CORE's cast as the game draws it (src/liquid/gl.js), one creature per frame, for the
// chapter card thumbnails.
//
//   FX_CHROME_ARGS='--use-gl=angle --use-angle=gl --enable-gpu --ignore-gpu-blocklist' \
//   node scripts/fx-probe.mjs --scene scripts/scenes/core-cast.js --chapter core --dpr 3 --w 600 --h 800 \
//     --frames 14 --url 'http://127.0.0.1:5173/' --out /tmp/cc/f --json /tmp/cc/f.json
//   then: python3 scripts/core-cast-cut.py /tmp/cc/f   (writes src/cast/<id>.png)
//
//   Frame 2i is CAST[i] (2i+1 the same instant without it, for the alpha), 200 world px right of you; at 600 CSS px wide The Core's zoom is 1, so it
//   sits 200 CSS px right of __fxResult.frames[i] (the player's screen position). Poles alternate.
//   __fxResult.ids / radii name each frame's creature and its hitbox radius, for the crop.
const CAST = ['ferriteMite', 'needleUrchin', 'spinningTop', 'dipoleEel', 'ferroBlob', 'ferroBlobSmall', 'lodestoneGolem']
const FLAGS = { ferriteMite: ['poleLatch'], needleUrchin: ['needleFan'], spinningTop: ['poleStrobe'], dipoleEel: ['dipole'], ferroBlob: ['ferroSpikes'], ferroBlobSmall: ['ferroSpikes'], lodestoneGolem: ['lodestone'] }
const BASE_R = { normal: 16, fast: 12, tank: 26 }
const D = 200
const result = { frames: [], ids: CAST, radii: [] }
window.__fxResult = result
if (run.chapter !== 'core') throw new Error('not The Core: ' + run.chapter)
const p = run.player
run.weapons = []
H.until(() => run.enemies.some((e) => !e._dead && e.rosterId === 'ferriteMite'), 9000)
const tmpl = run.enemies.find((e) => !e._dead && e.rosterId === 'ferriteMite')
let n = 0
return () => {
  // odd frames: the same instant with the creature gone (no tick, so the floor is frozen); the
  // difference of the pair is the cutout's alpha
  if (n % 2) {
    run.enemies = []
    H.render()
    result.frames.push([window.__renderer.playerScreen.x, window.__renderer.playerScreen.y])
    n++
    return
  }
  const k = n / 2, id = CAST[k]
  const r = CHAPTERS_ROSTER_R(id)
  const e = { ...tmpl, id: 900000 + k, rosterId: id, flags: FLAGS[id], radius: r, kb: { x: 0, y: 0 }, pole: k % 2 ? -1 : 1, _splitChild: id === 'ferroBlobSmall', vx: -40, vy: 20 }
  e.hp = e.maxHP = 99999; e.latched = false; e.stunT = 0; e.hitFlash = 0
  for (let i = 0; i < 40; i++) {
    run.enemies = [e]; run.obstacles = []; run.corePools = []; run.needles = []; run.enemyShots = []; run.gems = []; run.coins = []
    e.x = p.x + D; e.y = p.y; e.hp = e.maxHP; e.hitFlash = 0; e.latched = false; e._pph = -run.time   // the top shows no flip warning
    p.invuln = 0
    H.tick()
    e.x = p.x + D; e.y = p.y; e.curl = 0   // no curled-up shell
  }
  H.render()
  result.frames.push([window.__renderer.playerScreen.x, window.__renderer.playerScreen.y])
  result.radii.push(r)
  n++
}
function CHAPTERS_ROSTER_R(id) {
  const ROSTER = { ferriteMite: ['normal', 0.58], needleUrchin: ['normal', 0.83], spinningTop: ['fast', 0.89], dipoleEel: ['fast', 1], ferroBlob: ['tank', 0.77], ferroBlobSmall: ['tank', 0.46], lodestoneGolem: ['tank', 1.08] }
  const [a, m] = ROSTER[id]
  return BASE_R[a] * m
}
