// The staging looks (src/ophan/staging.js), one file per beat or world. Each draws in the boss's slot's stage px, through
// px2d (the painters' own Canvas2D-shaped context) and the sprite layer, so a look the owner picks in the playground IS the
// one the fight draws. Each look id is registered by one file only: an import's body runs before its importer's.
import './arrive-core.js'
import './beats.js'
import './leave.js'
import './break-macro.js'
import './break-holo.js'
import './break-ascii.js'
import './break-pixel.js'
import './break-toon.js'
import './break-liquid.js'
