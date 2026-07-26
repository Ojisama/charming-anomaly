// ---- TERRAIN (v5.11) — the world generator -------------------------------------------------------
//
// WHY THIS MODULE EXISTS (playtest report, screenshot: "you never see a satellite view like this,
// what the fuck are all those lines, roads are 10 meters long, no building etc").
//
// What shipped through v5.10 was not a terrain generator. It was `districtCellType`: an INDEPENDENT
// weighted die roll per 600px Voronoi cell, nudged by a 3x3-cell "region" roll. That construction
// cannot produce geography, only clumped confetti — there is no elevation, so a coastline is just
// the cells that happened to roll `sea`; no moisture, so nothing explains why one place is forest
// and the next is field; and no cities, so "downtown" was a tint that a cell won a lottery for.
// Roads made it worse: the grid was a GLOBAL infinite lattice on its own seed (run._obstacleSeed),
// deliberately unaware of what it crossed, while render gated road DRAWING per district cell — so a
// street materialised for 600px, vanished, and reappeared. That is the "roads are 10 meters long"
// report, exactly. It was not a tuning problem, and it is not fixed by weights.
//
// THE MODEL HERE. Three layers, each one the reason the next can be coherent:
//
//   1. FIELDS — two fBm value-noise scalars over the whole plane. `elevation` puts water in the low
//      places and hills in the high ones, so a coastline is a CONTOUR (elevation == SEA_LEVEL) and
//      is therefore automatically closed, continuous and wiggly. `moisture` is an independent field
//      that decides, on land, whether a place is desert, ordinary, or forest.
//   2. CITIES — real objects, not noise. A jittered lattice (CITY_GRID) where each site rolls
//      whether it's a city at all, and cities are REJECTED on unbuildable ground (water, mountain).
//      A city owns a centre, a radius, a street angle and a block size. `urban` is falloff from the
//      nearest city centre, so downtown -> suburbs -> farmland -> wild comes out as concentric
//      rings for free, which is what a real settlement looks like from orbit.
//   3. ROADS — owned by the cities from (2), which is the whole fix. Streets exist only inside a
//      city's own radius, laid out in THAT city's rotated frame, so one city is one continuous grid
//      that ends where the city ends. Highways are segments between neighbouring city centres, so
//      the long roads in the countryside go somewhere.
//
// ONE SEED. Everything here keys off a single world seed (run._districtSeed). This is load-bearing,
// not tidiness: roads previously ran on a different seed from districts, which is precisely how
// streets got carved through open water. Cities are placed by consulting `elevation`, streets are
// placed by consulting cities. A single seed is what lets each layer see the one below it.
//
// PURITY. No imports, no Math.random, no module state that a caller can observe: every export is a
// pure function of (x, y, seed). sim.js calls these during stepSim, where a stray Math.random draw
// has broken the seeded test suite twice (see sim.js's streamObstacles header). The caches below are
// memo tables keyed by the full input tuple — they change timing, never results.

// ---- hashing + value noise ----------------------------------------------------------------------
// Integer-lattice hash: Math.imul mix, no string keys and no allocation. This runs per floor cell
// per frame times (octaves x 4 corners x 2 fields), i.e. tens of thousands of times a frame, so the
// hashString/hash01 style used elsewhere in config.js for per-obstacle work is far too slow here.
function ihash(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Smoothstep the lattice interpolation. Plain linear interpolation of a value lattice leaves visible
// creases along the integer grid lines — with terrain this reads as a faint square mesh over the
// whole world, which is exactly the artefact this module exists to remove.
const smooth = (t) => t * t * (3 - 2 * t)

// One octave of 2D value noise on a unit lattice, in [0,1).
function vnoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = smooth(x - x0), fy = smooth(y - y0)
  const a = ihash(x0, y0, seed), b = ihash(x0 + 1, y0, seed)
  const c = ihash(x0, y0 + 1, seed), d = ihash(x0 + 1, y0 + 1, seed)
  const top = a + (b - a) * fx
  return top + ((c + (d - c) * fx) - top) * fy
}

// Fractal sum. `wavelength` is the size in WORLD PX of the largest feature; each further octave
// halves it and quarters its contribution to a total normalised back to [0,1).
function fbm(x, y, seed, octaves, wavelength) {
  let amp = 1, sum = 0, norm = 0, f = 1 / wavelength
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x * f, y * f, (seed + o * 7919) | 0)
    norm += amp
    amp *= 0.5
    f *= 2
  }
  return sum / norm
}

// ---- the two scalar fields ----------------------------------------------------------------------
// Wavelengths are chosen against what the player can actually see: the viewport is ~1900px wide and
// OBSTACLE_STREAM_RADIUS is 1400, so a feature has to be several thousand px across to read as
// "somewhere" rather than as texture. ELEV_WAVELENGTH 5200 puts roughly one coastline or one
// mountain shoulder across two or three screens — big enough to be a place you cross, small enough
// that a 5-minute run visits several.
const ELEV_WAVELENGTH = 5200
const MOIST_WAVELENGTH = 6800
const SEED_ELEV = 0x1a2b
const SEED_MOIST = 0x51d3

// Elevation in [0,1). The extra low-amplitude octave pair (4 total) is what gives coves and
// headlands rather than a smooth blob boundary — the coastline is this field's SEA_LEVEL contour,
// so all of the coastline's interest has to already exist here.
export function elevationAt(x, y, seed) {
  return fbm(x, y, (seed ^ SEED_ELEV) | 0, 4, ELEV_WAVELENGTH)
}

// Moisture in [0,1). Deliberately smoother (3 octaves, longer wavelength) than elevation: a desert
// should be a broad dry REGION you notice yourself entering, not a scatter of dry patches.
export function moistureAt(x, y, seed) {
  return fbm(x, y, (seed ^ SEED_MOIST) | 0, 3, MOIST_WAVELENGTH)
}

// Thresholds on the two fields. SEA_LEVEL at 0.40 gives ~30-35% water by area (fBm clusters toward
// its midpoint, so the area below 0.40 is well under 40%) — enough coast to matter, not an ocean
// world. SHORE_BAND is the sand strip above the waterline: 0.022 of elevation range works out to a
// beach a few hundred px deep on a typical gradient, which reads as a shore rather than a hairline.
export const SEA_LEVEL = 0.40
export const SHORE_BAND = 0.022
export const HILL_LEVEL = 0.66
export const DESERT_MOIST = 0.40
export const FOREST_MOIST = 0.58

// ---- rivers --------------------------------------------------------------------------------------
// RIDGED NOISE, not hydrology. The canonical approach (Red Blob Games' polygonal map generation)
// routes water downhill over a graph of the whole map, which needs the map to BE a whole map — this
// world is infinite and streamed around the player, so there is no graph to route over and no
// downstream to accumulate into.
//
// The standing trick for infinite worlds is to take a noise field's ZERO CROSSING instead: |2n-1| is
// near zero along a continuous, winding, non-self-intersecting curve, so thresholding it draws a
// river without anyone ever having to simulate flow. It is purely local — one fbm evaluation, no
// neighbours consulted — which is exactly what a streamed world can afford.
//
// // ponytail: these are rivers that LOOK right, not rivers that ARE right. They do not always run
// downhill, they do not merge into a dendritic network, and they can run out at a coast rather than
// into it. Real routing needs the finite-map graph above; upgrade only if the world ever stops being
// infinite. What it buys today is the one feature that makes an overhead view read as a photograph
// of somewhere rather than a texture, for a single extra noise sample.
const RIVER_WAVELENGTH = 7400
const SEED_RIVER = 0x77c1
// How close to the zero crossing counts as water. Widened toward sea level so a river broadens as
// it approaches the coast, which is both true of real rivers and the cheapest possible estuary.
export const RIVER_CORE = 0.012
export const RIVER_MOUTH_GAIN = 0.030

export function riverAt(x, y, seed) {
  const n = fbm(x, y, (seed ^ SEED_RIVER) | 0, 3, RIVER_WAVELENGTH)
  return Math.abs(n * 2 - 1)
}

// ---- cities ------------------------------------------------------------------------------------
// A city is an OBJECT on a jittered lattice, not a noise threshold, because everything downstream
// needs to ask it questions a scalar field cannot answer: where is your centre, which way does your
// street grid run, how big is a block. CITY_GRID is the lattice pitch; CITY_CHANCE is how many
// sites are actually built.
export const CITY_GRID = 3400
const CITY_CHANCE = 0.78
const CITY_R_MIN = 1350
const CITY_R_MAX = 2450
// Street grid angle range. A square grid is symmetric every 90 degrees, so rolling the angle over
// [0, PI/2) covers every distinct orientation — a wider range would just repeat.
const CITY_ANGLE_SPAN = Math.PI / 2
const CITY_BLOCK_MIN = 300
const CITY_BLOCK_MAX = 440
// Cities are rejected on ground you could not build on. Both margins are generous on purpose: a
// city centre sitting exactly at the waterline would put half its street grid in the sea.
const CITY_MIN_ELEV = SEA_LEVEL + 0.05
// Strictly BELOW HILL_LEVEL, not above it. terrainAt tests rock before it tests the city (a
// mountainside is a mountainside whoever built on it), so a centre allowed above the treeline would
// produce a "city" that classifies as hills all the way through — no streets drawn, no towers, just
// moorland wearing an urban falloff. Individual outlying blocks can still ride up over the line,
// which is correct and is what a hillside suburb looks like.
const CITY_MAX_ELEV = HILL_LEVEL - 0.02

// Memo table for lattice-site lookups. Keyed by the full (ci, cj, seed) tuple, so this is a pure
// speed cache: same key always maps to the same city, and dropping the whole table changes nothing
// but timing. Bounded because the player roams an infinite plane and this would otherwise grow
// without limit over a long run.
const cityCache = new Map()
const CITY_CACHE_MAX = 4096

// The city at lattice site (ci, cj), or null if that site rolled empty or sits on unbuildable
// ground. `r` is the URBAN radius: the distance at which `urbanAt` reaches zero, i.e. the edge of
// the suburbs, not the edge of downtown.
export function cityAt(ci, cj, seed) {
  const key = ci + ',' + cj + ',' + seed
  const hit = cityCache.get(key)
  if (hit !== undefined) return hit
  // THE HOME CITY. Site (0, 0) is always built and always centred on the world origin, because the
  // run spawns at (0, 0) and the chapter's opening image is "you are a kaiju standing downtown".
  // Leaving this to the same die roll every other site takes would open a majority of runs in empty
  // countryside with the chapter's entire premise over the horizon. The seed itself guarantees the
  // origin is buildable land (state.js rejects world seeds where it is not), so this needs no
  // elevation test and never lands in the sea.
  if (ci === 0 && cj === 0) {
    const home = {
      x: 0, y: 0,
      r: CITY_R_MAX,
      angle: ihash(0, 0, (seed + 503) | 0) * CITY_ANGLE_SPAN,
      block: CITY_BLOCK_MIN + ihash(0, 0, (seed + 601) | 0) * (CITY_BLOCK_MAX - CITY_BLOCK_MIN),
      ci, cj,
    }
    cityCache.set(key, home)
    return home
  }
  let city = null
  if (ihash(ci, cj, (seed + 101) | 0) < CITY_CHANCE) {
    // Jitter the site off the lattice centre so the set of cities is not visibly a grid. 0.62 of a
    // cell of total travel keeps neighbouring centres from crossing each other.
    const jx = (ihash(ci, cj, (seed + 211) | 0) - 0.5) * CITY_GRID * 0.62
    const jy = (ihash(ci, cj, (seed + 307) | 0) - 0.5) * CITY_GRID * 0.62
    const x = (ci + 0.5) * CITY_GRID + jx
    const y = (cj + 0.5) * CITY_GRID + jy
    const e = elevationAt(x, y, seed)
    if (e > CITY_MIN_ELEV && e < CITY_MAX_ELEV) {
      const rr = ihash(ci, cj, (seed + 401) | 0)
      city = {
        x, y,
        r: CITY_R_MIN + rr * (CITY_R_MAX - CITY_R_MIN),
        angle: ihash(ci, cj, (seed + 503) | 0) * CITY_ANGLE_SPAN,
        block: CITY_BLOCK_MIN + ihash(ci, cj, (seed + 601) | 0) * (CITY_BLOCK_MAX - CITY_BLOCK_MIN),
        ci, cj,
      }
    }
  }
  if (cityCache.size >= CITY_CACHE_MAX) cityCache.clear()
  cityCache.set(key, city)
  return city
}

// Pick a world seed whose ORIGIN IS BUILDABLE LAND, by walking forward from the caller's raw seed
// until one qualifies. The home city above is unconditional, so without this a run could open with
// downtown underwater or halfway up a mountain. Rejecting the seed is the honest fix: the
// alternative — bending the elevation field upward near the origin — would carve a visible circular
// island into the terrain of every single run. Deterministic (no RNG of its own) and effectively
// always resolves on the first try or two, since the buildable band covers most of the plane; the
// bound just stops a pathological seed from looping forever.
export function pickWorldSeed(rawSeed) {
  let s = rawSeed | 0
  for (let i = 0; i < 64; i++) {
    // Ask the classifier itself rather than re-deriving its thresholds here. Restating them would
    // be a second copy to keep in sync, and it would miss the cases that are not about elevation at
    // all — a river runs on perfectly buildable land, and would otherwise open the run in the water.
    if (terrainAt(0, 0, s).biome === 'downtown') return s
    s = (s + 7919) | 0
  }
  return s
}

// Nearest city to (x, y) and the distance to it, or null if none is in range. The 3x3 lattice scan
// is sufficient because CITY_R_MAX (1750) is less than CITY_GRID (3400): a city can never influence
// a point more than one lattice cell away from its own site.
export function nearestCity(x, y, seed) {
  const ci = Math.floor(x / CITY_GRID), cj = Math.floor(y / CITY_GRID)
  let best = null, bestD = Infinity
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      const c = cityAt(i, j, seed)
      if (!c) continue
      const d = Math.hypot(x - c.x, y - c.y)
      if (d < bestD) { bestD = d; best = c }
    }
  }
  return best ? { city: best, dist: bestD } : null
}

// Multiplier on a city's radius, per point — this is what stops the urban boundary being a circle.
//
// v5.11: the first cut was `0.78 + 0.44 * fbm(...)` and produced visibly round cities anyway. The
// reason is that fBm is a normalised SUM of octaves, so its output clusters hard around 0.5 and
// almost never reaches 0 or 1 — a 2-octave field spans roughly 0.3..0.7 in practice, so that
// expression only ever varied the radius by about +-9%, which the eye reads as a circle with a
// slightly soft edge. Re-centring the noise to +-1 first and THEN scaling is what turns the same
// field into a genuinely ragged outline (about +-22%), and a shorter wavelength with one more
// octave adds the bays and spurs that make a city look like it grew rather than like it was
// stamped.
function cityEdgeWobble(x, y, seed) {
  const n = fbm(x, y, (seed + 977) | 0, 3, 780)
  return 1 + 0.55 * ((n - 0.5) * 2)
}

// Urbanisation in [0,1]: 1 at a city centre, 0 at its edge and beyond. The radius is perturbed by a
// short-wavelength noise so the city outline is ragged — a perfectly circular suburb boundary is
// the single most obvious "this was generated" tell, and it is much cheaper to break it here than
// to add shape to every consumer downstream.
export function urbanAt(x, y, seed) {
  // MAX over every nearby city, not just the nearest. Two cities whose discs overlap are a
  // conurbation, and the point between them is urban because BOTH reach it — taking only the
  // nearest makes urbanisation jump discontinuously the instant the nearest flips, which shows up
  // as a hard colour seam running down the gap between them (caught by run BB's tint-continuity
  // check the moment the edge wobble got strong enough to make the two discs actually interleave).
  // A max of continuous functions is continuous, so the seam cannot come back.
  //
  // roadAt deliberately does NOT do this: a street grid belongs to exactly one city, and which one
  // owns a given block is precisely the nearest-city question. An orientation change where two
  // grids meet is a real feature of real cities, not a seam to smooth away.
  const ci = Math.floor(x / CITY_GRID), cj = Math.floor(y / CITY_GRID)
  const wobble = cityEdgeWobble(x, y, seed)
  let best = 0
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      const c = cityAt(i, j, seed)
      if (!c) continue
      const t = Math.hypot(x - c.x, y - c.y) / (c.r * wobble)
      if (t < 1 && 1 - t > best) best = 1 - t
    }
  }
  return best
}

// Where the rings fall inside a city.
export const DOWNTOWN_URBAN = 0.42
export const SUBURB_URBAN = 0.10

// ---- roads ---------------------------------------------------------------------------------------
// Two classes, both anchored to cities. Widths are in px; a "major" road is drawn wider by render.
export const STREET_SPACING_MAJOR_EVERY = 4   // every Nth street in a city grid is an avenue
export const STREET_MINOR_WIDTH = 30
export const STREET_MAJOR_WIDTH = 54
export const HIGHWAY_WIDTH = 64
// Streets stop before the very edge of the urban falloff so the outermost houses sit on unpaved
// ground — a city whose grid runs exactly to its own boundary reads as a stamped rectangle.
const STREET_MIN_URBAN = 0.15

// Highway segments passing near lattice cell (ci, cj), memoised. Each city links only to the sites
// at (+1, 0) and (0, +1); every unordered pair is therefore generated exactly once, from its
// lower-indexed end, so two cities can never disagree about where the road between them runs.
const highwayCache = new Map()
const HIGHWAY_CACHE_MAX = 2048

function highwaysNear(ci, cj, seed) {
  const key = ci + ',' + cj + ',' + seed
  const hit = highwayCache.get(key)
  if (hit !== undefined) return hit
  const segs = []
  // Scan a 3x3 of ORIGIN sites: a segment starting one cell to the left/up can still pass through
  // this cell, so origins outside the neighbourhood cannot be skipped.
  for (let i = ci - 2; i <= ci + 1; i++) {
    for (let j = cj - 2; j <= cj + 1; j++) {
      const a = cityAt(i, j, seed)
      if (!a) continue
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        const b = cityAt(i + di, j + dj, seed)
        if (!b) continue
        segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y })
      }
    }
  }
  if (highwayCache.size >= HIGHWAY_CACHE_MAX) highwayCache.clear()
  highwayCache.set(key, segs)
  return segs
}

// Perpendicular distance from a point to a segment, plus the segment's own heading.
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay
  const len2 = vx * vx + vy * vy
  if (len2 === 0) return { d: Math.hypot(px - ax, py - ay), angle: 0 }
  let t = ((px - ax) * vx + (py - ay) * vy) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return { d: Math.hypot(px - (ax + t * vx), py - (ay + t * vy)), angle: Math.atan2(vy, vx) }
}

// Is (x, y) roadway? Returns { onRoad: false }, or:
//   angle  — the road's heading in world space (0 = runs along +x)
//   dist   — px from the centreline (>= 0)
//   half   — this road's own half-width, so dist/half is "how far toward the kerb"
//   major  — avenue or highway: render draws these wider and with different markings
//   kind   — 'street' | 'highway'
// Signature-compatible with the v5.9 roadAt it replaces, minus the global lattice: EVERY road
// returned here belongs to a city, either inside one or running between two.
export function roadAt(x, y, seed) {
  // Highways first — they outrank a city street where the two overlap, since a highway running into
  // a city becomes its main artery rather than stopping at the boundary.
  const ci = Math.floor(x / CITY_GRID), cj = Math.floor(y / CITY_GRID)
  const half = HIGHWAY_WIDTH / 2
  let bestD = Infinity, bestAngle = 0
  for (const s of highwaysNear(ci, cj, seed)) {
    const r = segDist(x, y, s.ax, s.ay, s.bx, s.by)
    if (r.d < bestD) { bestD = r.d; bestAngle = r.angle }
  }
  if (bestD <= half) return { onRoad: true, angle: bestAngle, dist: bestD, half, major: true, kind: 'highway' }

  // City streets: laid out in the nearest city's OWN rotated frame, which is what makes one city one
  // continuous grid instead of a slice of an infinite global lattice.
  const near = nearestCity(x, y, seed)
  if (!near) return { onRoad: false }
  const wobble = cityEdgeWobble(x, y, seed)
  const urban = 1 - near.dist / (near.city.r * wobble)
  if (urban < STREET_MIN_URBAN) return { onRoad: false }

  const c = near.city
  const cos = Math.cos(-c.angle), sin = Math.sin(-c.angle)
  const dx = x - c.x, dy = y - c.y
  const u = dx * cos - dy * sin
  const v = dx * sin + dy * cos

  const ui = Math.round(u / c.block)
  const vi = Math.round(v / c.block)
  const uDist = Math.abs(u - ui * c.block)
  const vDist = Math.abs(v - vi * c.block)
  const uMajor = ((ui % STREET_SPACING_MAJOR_EVERY) + STREET_SPACING_MAJOR_EVERY) % STREET_SPACING_MAJOR_EVERY === 0
  const vMajor = ((vi % STREET_SPACING_MAJOR_EVERY) + STREET_SPACING_MAJOR_EVERY) % STREET_SPACING_MAJOR_EVERY === 0
  const uHalf = (uMajor ? STREET_MAJOR_WIDTH : STREET_MINOR_WIDTH) / 2
  const vHalf = (vMajor ? STREET_MAJOR_WIDTH : STREET_MINOR_WIDTH) / 2
  const onU = uDist <= uHalf   // a street running along +v, i.e. crossing the u axis
  const onV = vDist <= vHalf
  if (!onU && !onV) return { onRoad: false }
  // NO STREETS ON OPEN WATER. A city centre is always on land, but its urban radius is a circle and
  // the coast is not, so a seaside city's grid would otherwise march straight out across the bay —
  // the exact "roads in the sea" artefact this rewrite exists to remove, just arriving by a
  // different route than the old global lattice did. Checked only AFTER the grid test passes, so
  // the extra elevation sample is paid on the ~20% of queries that are actually on a street rather
  // than on every query. Rivers are deliberately NOT excluded: a street crossing a river inside a
  // city is a bridge, which is correct, and is why this tests sea level rather than the biome.
  if (elevationAt(x, y, seed) < SEA_LEVEL) return { onRoad: false }
  // At a junction the nearer centreline wins — that is the one anything distance-based should key
  // off (kerb fade, lane markings).
  if (onU && (!onV || uDist <= vDist)) {
    return { onRoad: true, angle: c.angle + Math.PI / 2, dist: uDist, half: uHalf, major: uMajor, kind: 'street' }
  }
  return { onRoad: true, angle: c.angle, dist: vDist, half: vHalf, major: vMajor, kind: 'street' }
}

// ---- biome classification ------------------------------------------------------------------------
// The order of these tests IS the model, and it is deliberately water -> shore -> mountain -> city
// -> climate. Water and rock come first because they are physical facts that override everything
// (you cannot build downtown in a lake); the city ring comes before climate because a suburb is a
// suburb whether it is dry or wet; climate decides only what the leftover countryside is.
export const BIOMES = ['sea', 'beach', 'hills', 'downtown', 'suburbs', 'desert', 'parks', 'farms']

// Full terrain sample. Returns every field the callers need, so a consumer that wants two or three
// of them pays for one evaluation instead of three — sim's structure placement wants biome + urban,
// render's floor wants biome + elevation.
export function terrainAt(x, y, seed) {
  const elev = elevationAt(x, y, seed)
  if (elev < SEA_LEVEL) return { biome: 'sea', elev, moist: 0, urban: 0 }
  if (elev < SEA_LEVEL + SHORE_BAND) return { biome: 'beach', elev, moist: 0, urban: 0 }
  // Rivers run on land below the treeline, and broaden toward the coast. Classified as `sea` rather
  // than as their own biome on purpose: every water consumer downstream — the water floor tile, the
  // shore seam, "no buildings here", piers — is already written against `sea` and is correct
  // verbatim for a river. A separate biome would be a second copy of all of it to keep in sync, and
  // roads already cross water as causeways, so a street meeting a river reads as a bridge for free.
  if (elev < HILL_LEVEL) {
    const lowness = (HILL_LEVEL - elev) / (HILL_LEVEL - SEA_LEVEL)
    if (riverAt(x, y, seed) < RIVER_CORE + RIVER_MOUTH_GAIN * lowness * lowness) {
      return { biome: 'sea', elev, moist: 1, urban: 0, river: true }
    }
  }
  if (elev > HILL_LEVEL) return { biome: 'hills', elev, moist: moistureAt(x, y, seed), urban: 0 }
  const urban = urbanAt(x, y, seed)
  if (urban > DOWNTOWN_URBAN) return { biome: 'downtown', elev, moist: 0, urban }
  if (urban > SUBURB_URBAN) return { biome: 'suburbs', elev, moist: 0, urban }
  const moist = moistureAt(x, y, seed)
  if (moist < DESERT_MOIST) return { biome: 'desert', elev, moist, urban }
  if (moist > FOREST_MOIST) return { biome: 'parks', elev, moist, urban }
  return { biome: 'farms', elev, moist, urban }
}

// Biome name only — the common case, and the drop-in replacement for the old districtAt.
export function biomeAt(x, y, seed) {
  return terrainAt(x, y, seed).biome
}

// ---- farm parcels ---------------------------------------------------------------------------------
// Farmland from above is a PATCHWORK OF FLAT COLOURED RECTANGLES — quarter-section parcels, each a
// different crop at a different stage — and emphatically not a scribble of individual crop strokes,
// which is what v5.10 drew and what the playtest report called "so ugly it doesn't resemble
// anything". The parcels are axis-aligned on purpose: real surveyed farmland follows section lines,
// and an axis-aligned lattice also tiles a square floor-cell grid perfectly, so the fields meet
// edge-to-edge with no gaps and no overlap.
export const PARCEL = 280

// Which parcel covers (x, y), and what is growing on it. `rows` is the in-parcel furrow direction
// (0 = furrows run east-west, 1 = north-south) — varying it per parcel is most of what makes a
// patchwork read as cultivated rather than as a colour grid. `pivot` marks the occasional
// centre-pivot irrigation circle, the one non-rectangular thing in real farmland.
export function parcelAt(x, y, seed) {
  const fi = Math.floor(x / PARCEL), fj = Math.floor(y / PARCEL)
  const h = ihash(fi, fj, (seed + 733) | 0)
  return {
    fi, fj,
    cx: (fi + 0.5) * PARCEL, cy: (fj + 0.5) * PARCEL,
    crop: Math.floor(h * 6) % 6,
    rows: ihash(fi, fj, (seed + 839) | 0) < 0.5 ? 0 : 1,
    pivot: ihash(fi, fj, (seed + 941) | 0) < 0.14,
    shade: ihash(fi, fj, (seed + 1049) | 0),
  }
}

// ---- structure placement helpers ------------------------------------------------------------------
// How densely each biome is built, as a multiplier on the chapter's base obstacle probability. This
// is what turns "structures scattered uniformly across the world" into "a city is dense and the
// desert is empty" — the previous generator had no such notion, which is why the report says "no
// building": downtown existed as a floor tint with the same sparse scatter as everywhere else.
export const BIOME_BUILD_DENSITY = {
  downtown: 3.2,
  suburbs: 1.5,
  farms: 0.34,
  parks: 0.42,
  hills: 0.30,
  desert: 0.12,
  beach: 0.06,
  sea: 0.05,   // piers only, and only near the shore
}

// Snap a structure onto its city block. Inside a city, buildings do not sit where a hash dropped
// them: they line the streets, set back from the kerb, squared to the grid. Given a raw (x, y) this
// returns the position pushed to the nearest block interior plus the rotation that faces it onto the
// street, or null when the point is not in a city (countryside keeps its free scatter).
// `setback` is how far the facade sits from the street centreline.
export function blockSnap(x, y, seed, setback) {
  const near = nearestCity(x, y, seed)
  if (!near) return null
  const c = near.city
  const cos = Math.cos(-c.angle), sin = Math.sin(-c.angle)
  const dx = x - c.x, dy = y - c.y
  let u = dx * cos - dy * sin
  let v = dx * sin + dy * cos
  // Distance from each axis' nearest street centreline, signed, so a building can be pushed to
  // whichever side of the block it already sits on rather than always the same side.
  const ui = Math.round(u / c.block), vi = Math.round(v / c.block)
  const du = u - ui * c.block, dv = v - vi * c.block
  if (Math.abs(du) < setback) u = ui * c.block + Math.sign(du || 1) * setback
  if (Math.abs(dv) < setback) v = vi * c.block + Math.sign(dv || 1) * setback
  // Rotate back into world space.
  const bcos = Math.cos(c.angle), bsin = Math.sin(c.angle)
  return {
    x: c.x + (u * bcos - v * bsin),
    y: c.y + (u * bsin + v * bcos),
    angle: c.angle,
  }
}
