// Scene: the player wearing the CHEEKS skin (SHOP.cheeks), clean and idle, for judging the art.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/cheeks.js --chapter body  --out /tmp/b1
//   node scripts/fx-probe.mjs --scene scripts/scenes/cheeks.js --chapter surf  --out /tmp/b2
//   node scripts/fx-probe.mjs --scene scripts/scenes/cheeks.js --chapter skies --out /tmp/k
//
// The skin is set on the RUN and the renderer re-reset, rather than bought in the seeded save:
// the shop is per BOOK (meta.shop for book 1, meta.books.undertow.shop for Undertow), so a save
// seed would need a different shape per chapter. render.js latches run.skin in reset(), which has
// already happened by the time a scene runs — hence the explicit re-reset here.
run.skin = 'cheeks'
window.__renderer.reset(run)

const p = run.player
p.hp = p.maxHP = 99999
H.note(run.chapter + ' — cheeks skin')

return () => {
  run.enemies.length = 0
  run.gems.length = 0
  run.coins.length = 0
  p.hp = p.maxHP
  p.hitFlash = 0
  p.facingAngle = null
  p.moving = false
  H.render()
}
