// The Ophan's one shape and motion, ported from the approved mock-up's rig. Pure: no imports, no Math.random.
const TAU = Math.PI * 2
export const hh = (i, j) => { const s = Math.sin(i*127.1 + j*311.7)*43758.5453; return s - Math.floor(s); };

// Units: R (the body radius), y DOWN, origin = the boss centre (x, y) your boss()/attack() receives. Angles in radians.
//
// STATIC SHAPE (wing-local frame of the RIGHT wing; the left is its mirror x -> -x)
//   RIG.WINGS[i], i = 0 up, 1 out, 2 down: { pair, i, root:[x,y], th (rest heading, rad), A (arm length), w (blade
//     half-width), cv (curl), scale (rest scale about root), flex (breathing phase), pour (feather index the poured sheet
//     reaches), arm:[x0,y0,x1,y1], feathers:[F], coverts:[F], eyes:[{x,y,rot,from}] (from = phase it opens toward),
//     tips:[[x,y]] (tip beads, drip points) }
//   F (one blade): { base:[x,y], a, L, w, cv, tal (talon?), j (-.5..5 jitter), sp/l/r: 11 points each (spine, left and
//     right edge, root to tip), bead: {x,y,r} | null }
//   RIG.CORE: [F] the 12 short blades round the great eye.   RIG.feather(bx,by,a,L,w,cv,sharp) builds an F.
//   RIG.EYE = { x:0, y:-.1, r:.27 } the great eye (body frame);  RIG.HALO = { x:0, y:-.1, r:.52 }.
//
// POSE  RIG.pose(t, ph, atk = null, u = 0, gx, gy)   (gx, gy) = the player in R units from the centre (attacks)
//   ph 1..3 = the three phases (continuous: 2.65 is mid-opening); ph 4 (the pencil sketch) = exactly the ph 3 pose, and
//   attack()/attackUnit() at ph 4 = exactly ph 3. Full shape from ph 3: 6 wings, 8 feather eyes (4 of them the out pair's
//   laser eyes), the great eye open.
//   body:  { pivot:[0,-.1], sx, sy, rot, dx, dy, m, floor }. Apply as: translate(pivot) scale(sx,sy) rotate(rot)
//          translate(-pivot) = floor (the floor layer: halo, shadows); then translate(dx,dy) = m (wings, eyes).
//          m and floor are affine [a,b,c,d,e,f] (DOMMatrix order) from body frame to boss units.
//   wings: draw order (down, out, up; left then right), only those with vis > .01:
//          { pair, i, side (-1 left, 1 right), vis (0..1 fade-in), rot (swing about root, in the mirrored frame), scale,
//            flap (rot minus rest breathing), curl, root:[x,y], tip:[x,y] (arm end), angle (arm heading), len, width,
//            m (wing-local -> boss units: m = body.m . T(side*rx,ry) . S(side,1) . R(rot) . S(scale) . T(-rx,-ry)),
//            eyes:[E] }
//          Phases: ph 1 = up + out (4 wings), the down pair unfolds from under the out pair over ph 1 -> 1.4 (6 wings).
//   eyes:  all feather eyes, flat: E = { i, side, x, y (boss units), lx, ly, rot (wing-local), r, open (0..1, blinks),
//          heat (iris heat), las (an out-pair laser eye) }.  Open from ph 1 -> 2 (up, out: 6) and ph 2 -> 3 (down: 2).
//   eye:   the great eye { x, y, r, open (0 sealed .. 1, squints and flares), lid (1 - phase open: the seal), heat,
//          gape (spent, forced open), seam (the sealed lid's red seam brightness) }
//   halo:  { x, y, r, scale }   (floor layer: no dx/dy)
//   talons:[{ side, root:[x,y], tip:[x,y], angle, len }]  (the down pair's last two primaries)
//   tips:  [[x,y]] tip beads of the fully-shown wings (every other one): where drips and whip strands start
//   out:   [[x,y]] the 4 laser eyes (order: left 1.0, left 1.32, right 1.0, right 1.32)
//   gaze:  [x,y] where every eye stares
//   SPIN (tornado only): body.yaw = the turn about the screen's VERTICAL axis, body.face = cos(yaw) (= body.sx: < 0 means
//          the back is toward us: draw the back of the body, no eyes); w.depth = -side*sin(yaw) per wing (> 0 = in front
//          of the body: draw wings with depth < 0 BEFORE the core and depth > 0 AFTER it). Eyes close automatically.
//          body.ox = the top's wobble, a SCREEN-space x offset applied FIRST: translate(ox, 0), then the chain above (it is
//          in floor and m already; 0 outside the tornado). Inside the sx squash it would vanish every time the top is edge-on.
//          body.ground = floor without the yaw squash (= floor outside the tornado): for marks lying ON the floor (pool,
//          floor rays, the wings' cast shadows) so they stay round while the body turns. The halo is the body's own disc:
//          keep it on floor, it foreshortens with the turn.
//   beats: { windup, squash (peaks ~u .4), strike (~.55), recovery (spent), flash, fire, glint, spin (tornado: the top's spin
//          speed 0..1, drive motion blur / speed streaks from it), burst (the ph 2.25 -> 3 eye
//          opening event, peaks at ph 2.625), unfold (ph 1 -> 2), open (ph 2 -> 3) }  all 0..1
//   raw:   liquid's own pose record (rot/sc per pair, pin, spin, dx, dy, sx, sy, bk, gape, eo, fl, hot, lop, glint, ga, tx, ty, lamp)
//   The wings lag the body (secondary motion): rot and scale come from u - .05, extrapolated from u - .1.
//   A SKETCH ("wings and eyes only", ph 4 pencil) draws: wings[] (root, tip, angle, len, width, m to place the feathers of
//   WINGS[i].feathers / coverts), eyes[] and eye (the great eye), and may use gaze. It leaves out the BODY layers: halo,
//   CORE, talons (draw them as plain feathers or not at all) and everything on the floor layer (body.floor). It still
//   applies body.m (squash, spin, lift) so the motion reads, and beats for timing.
//
// ATTACK  RIG.attack(atk, u, ph, bx, by, R, px, py, t = 0, pose) -> the danger geometry in WORLD coords (pixels);
//   RIG.attackUnit(atk, u, ph, PX, PY, t = 0, pose) -> the same in R units from the boss centre. Points are {x,y}.
//   blast:   { dir, suck:[{x,y,r,al}] (beads drawn in), shock:{x,y,r,w,al}|null (the ring at the burst),
//              sheet:{ apex, dir, half (half-angle), front (radius), band (crest spacing), fade, s, kw,
//                      crests:[{r, a0, a1, f}], flows:[{a, r0, r1}], drops:[{x,y,z,a,tl}] } | null }
//   tornado: { path:[{x,y}] (10 telegraph rings), pathR:[r], end:{x,y,r}, tele (telegraph strength), pos:{x,y},
//              alive, collapse, pool, scale, height, radius (top), foot (foot radius), spin, wind (streak strength),
//              trail:[{x,y}] (11, oldest first), dizzy, road(v) }
//            DRAW ORDER: the floor marks (path, trail, pool, foot shadow) go UNDER the boss; the funnel itself goes OVER
//            the boss at every u. Its foot is always on the player's side of the boss, so it is the nearer object.
//   laser:   { aim, fire, sweep, scorch, reticle:{x,y,r,al}, pool, smoke, target:{x,y}, hit:{x,y},
//              track:{ start:{x,y} (at the boss's feet), now:{x,y} (= hit), end:{x,y} (where it ends, past the player), len, dx,dy, nx,ny (unit), lanes },
//              beams:[{ x, y (eye), base, a0 (angle at start), a (now), sg, amp, dist, len, w, off, start:{x,y}, end:{x,y} (its ground point) }] }
//            A HEAT RAY: every beam is a straight line from its eye to its own ground point. The ground points walk together,
//            side by side (lanes), from the boss's feet in a straight line through the player and on past them (sweep 0..1).
//            Scorch the ground along each lane from start to end; the floor marks go UNDER the boss, the beams OVER it.
//   THE BOSS MOVES in wheel and sword: body.ox/oy is a screen-space offset applied FIRST (it is in floor, ground and m already).
//   A style that builds its own transform from sx/sy/rot/dx/dy instead of using m/floor must translate(ox, oy) first.
//   wheel:   { pos:{x,y} (the disc centre = where the body is), r (its danger radius), roll (0..1 rolling), spin (its flat
//              spin angle = body.rot), rate (spin speed 0..1: blur, sparks), dir (heading), legs:[{x,y}] (home, two ricochet
//              corners, home), leg, hit (0..1 at each ricochet), hits:[{x,y,al}] (the two corners' impact, decaying),
//              trail:[{x,y}] (11, oldest first: the scour it cuts), rock (the rock back before launch: the tell), dizzy }
//            The pose folds every wing in round the body into one disc and spins it in the floor plane (body.rot).
//   recall:  { feathers:[{ x, y, a (heading: tip forward), len, w, z (height off the floor: offset its shadow), state
//              (0 on the wing, not drawn; 1 flying out; 2 staked in the floor; 3 flying home; 4 home, not drawn), k (0..1
//              within the state), vis, from, plant, home:{x,y}, quiver (0..1, staked: shake it), dust (the stake's impact),
//              tear (ripping free) }], ret (0..1 the return volley) }
//            The staked feathers ARE the telegraph: each one's way home is the straight line from it to the boss.
//   sword:   { dir, blade:{ base, tip (its point, drawn), ground (the point's shadow on the floor), len (drawn length), reach
//              (true length), w (half-width at the base), form (0..1: wings fused into it), lift (0 flat .. 1 upright),
//              theta, heading (base -> tip on screen), buried (stuck in the floor after the slam), dissolve (0..1
//              breaking back into feathers) }, impact:{x,y,r,al}|null (the slam's shock ring at the point),
//              fire:{ start, end, dx,dy,nx,ny, len, front (how far the eruption has run), w (half-width), flames:[{x,y,h,
//              al,s,sz}] (16 to 48 along the line, spaced as v9's 16: h 0..1 height, sz its size), on, scorch } }
//            Upright is drawn as screen-UP (the same oblique cheat as the tornado's height): tip = ground - (0, .6*reach*lift).
//            The raised blade is the telegraph. THE BLADE IS THE UP WINGS (owner: a blade built in front of the body read as
//            something else in front of the boss): while blade.under > .5 it is drawn UNDER the body, its base at the
//            converged up-wing tips (base starts at (0,-.9), the top of the boss). The up pair sweeps to vertical and
//            stretches (wing.merge 0..1): draw those wings thinning and fading INTO the blade, so the blade reads as their
//            continuation. No feathers fly in from the front. During the slam (under -> 0) it swings over the body to the front.
//   wing.merge (sword only, up pair): 0..1, how far that wing has become the blade.
const RIG = (() => {
  const RAD = Math.PI/180;
  const LAS = { lanes: [-.09, -.27, .09, .27], past: 1.6 };   // heat-ray band, in out-eye order (left inner, left outer, right inner, right outer): each beam's sideways offset from the walking hit point; how far past the player it walks
  const ease = (u) => .5 - .5*Math.cos(u), cl = (v) => Math.min(1, Math.max(0, v));
  const sm = (a, b, v) => { const k = cl((v - a)/(b - a)); return k*k*(3 - 2*k); };
  const backOut = (k) => 1 + 2.70158*Math.pow(k - 1, 3) + 1.70158*Math.pow(k - 1, 2);
  const blink = (u) => 1 - .92*Math.pow(ease(u), 12);
  // ---- affine 2D, DOMMatrix order [a,b,c,d,e,f]: x' = a x + c y + e, y' = b x + d y + f
  const mul = (M, N) => [M[0]*N[0] + M[2]*N[1], M[1]*N[0] + M[3]*N[1], M[0]*N[2] + M[2]*N[3], M[1]*N[2] + M[3]*N[3], M[0]*N[4] + M[2]*N[5] + M[4], M[1]*N[4] + M[3]*N[5] + M[5]];
  const T = (x, y) => [1, 0, 0, 1, x, y], S = (x, y) => [x, 0, 0, y, 0, 0], Ro = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; };
  const ap = (M, x, y) => [M[0]*x + M[2]*y + M[4], M[1]*x + M[3]*y + M[5]];
  // a blade: base b, heading a, length L, half-width w, tip swinging sideways by cv*L; only talons (sharp) are honed
  function feather(bx, by, a, L, w, cv, sharp){
    const ca = Math.cos(a), sa = Math.sin(a), l = [], r = [], sp = [];
    for (let k=0;k<=10;k++){ const u = k/10, off = cv*L*u*u, cx = bx + ca*L*u - sa*off, cy = by + sa*L*u + ca*off;
      const dx = ca - sa*2*cv*u, dy = sa + ca*2*cv*u, dl = Math.hypot(dx, dy), nx = -dy/dl, ny = dx/dl, hw = w*Math.min(1, u/.18 + .35)*(sharp ? Math.pow(1 - u, .7) : Math.pow(Math.max(0, 1 - u*u), .6));
      l.push([cx + nx*hw, cy + ny*hw]); r.push([cx - nx*hw, cy - ny*hw]); sp.push([cx, cy]); }
    return { base: [bx, by], a, L, w, cv, l, r, sp };
  }
  // one wing (the right): an arm from the root, blades fanning off it (the last `tal` are hooked talons), a shorter covert row
  const SPEC = [
    { root: [.05, -.2], th: -66, A: .48, ph0: 44, ph1: -6, n: 7, L0: .36, L1: .9, w: .075, cv: .1, eyes: [[1.1, 2]], flex: 0, seed: 11 },
    { root: [.08, -.1], th: -8, A: .58, ph0: 82, ph1: 4, n: 8, L0: .38, L1: .78, w: .08, cv: .1, eyes: [[1.0, 2], [1.32, 2]], flex: 2.1, seed: 23 },
    { root: [.05, .02], th: 46, A: .5, ph0: 70, ph1: 14, n: 9, L0: .4, L1: .7, w: .095, cv: .2, tal: 2, pour: 4, eyes: [[1.05, 3]], flex: 4.2, seed: 37 },
  ], WS = [1.06, 1, 1.08], PAIRS = ['up', 'out', 'down'];
  const WINGS = SPEC.map((S, i) => {
    const [rx, ry] = S.root, ca = Math.cos(S.th*RAD), sa = Math.sin(S.th*RAD), F = [], C = [], E = [], Tp = [];
    for (let k=0;k<S.n;k++){ const f = k/(S.n - 1), bx = rx + ca*S.A*(.15 + .85*f), by = ry + sa*S.A*(.15 + .85*f), j = (n) => hh(k + S.seed, n) - .5;
      const a = (S.th + S.ph0 + (S.ph1 - S.ph0)*f + 5*j(1))*RAD, tal = k >= S.n - (S.tal || 0), L = (S.L0 + (S.L1 - S.L0)*f)*(tal ? 1.12 : 1 + .2*j(2));
      const q = feather(bx, by, a, L, S.w*(tal ? .8 : 1 + .25*j(3)), (S.cv || 0)*(tal ? 1.8 : 1) + .1*j(4), tal); q.tal = tal; q.j = j(5); q.bead = null;
      if (!tal && q.j > -.3){ const [tx, ty] = q.sp[10], [px, py] = q.sp[9], d = Math.hypot(tx - px, ty - py); q.bead = { x: tx + (tx - px)/d*.012, y: ty + (ty - py)/d*.012, r: .03 + .025*(q.j + .3) }; Tp.push([tx + (tx - px)/d*.03, ty + (ty - py)/d*.03]); }
      F.push(q); }
    for (let k=0;k<S.n - 1;k++){ const f = (k + .5)/(S.n - 1), bx = rx + ca*S.A*(.1 + .7*f), by = ry + sa*S.A*(.1 + .7*f), a = (S.th + S.ph0 + (S.ph1 - S.ph0)*f)*RAD;
      C.push(feather(bx, by, a + .1*(hh(k + S.seed, 8) - .5), (S.L0 + (S.L1 - S.L0)*f)*(.4 + .2*hh(k + S.seed, 9)), S.w*(1 + .4*hh(k + S.seed, 10)), .1*(hh(k + S.seed, 11) - .5))); }
    for (const [u, from] of S.eyes){ const nx = -sa, ny = ca; E.push({ x: rx + ca*S.A*u + nx*.02, y: ry + sa*S.A*u + ny*.02, rot: S.th*RAD, from }); }
    return { pair: PAIRS[i], i, root: S.root, th: S.th*RAD, A: S.A, w: S.w, cv: S.cv, scale: WS[i], flex: S.flex, pour: S.pour || 3, arm: [rx, ry, rx + ca*S.A, ry + sa*S.A], feathers: F, coverts: C, eyes: E, tips: Tp };
  });
  const CORE = []; for (let k=0;k<12;k++){ const a = k/12*TAU + .26; CORE.push(feather(Math.cos(a)*.05, -.1 + Math.sin(a)*.05, a, .27, .065, .05)); }
  const EYE = { x: 0, y: -.1, r: .27 }, HALO = { x: 0, y: -.1, r: .52 };

  // ---- the pose record of one attack at progress u (liquid's stage(), the drawing taken out)
  const SAG = [.85, .95, .6];   // the spent pose: every pair hanging far below rest
  // THE ROAM (owner: "wander more like for 2 or 3 s more"): the tornado's u windows are written on a BASE s schedule and its
  // road (u AT .. TO) is walked EXTRA s slower; OPHAN_ATTACKS.tornado.dur is BASE + EXTRA. Real time below is in BASE-s units
  // the sword's blade length (config OPHAN_SWORD_REACH, which this module cannot import): the slam lands .5 + it from the boss
  const SWORD_REACH = 8.7;
  const ROAM = { base: 4.5, extra: 2.5, at: .44, to: .88 }, RK = 1 + ROAM.extra/((ROAM.to - ROAM.at)*ROAM.base);
  const toReal = (u) => u < ROAM.at ? u : u < ROAM.to ? ROAM.at + (u - ROAM.at)*RK : u + (ROAM.to - ROAM.at)*(RK - 1);
  const fromReal = (s) => s < ROAM.at ? s : s < ROAM.at + (ROAM.to - ROAM.at)*RK ? ROAM.at + (s - ROAM.at)/RK : s - (ROAM.to - ROAM.at)*(RK - 1);
  // d(u)/d(real u) over dur = BASE + EXTRA: the sim advances an attack's u by it
  const uRate = (atk, u) => atk !== 'tornado' ? 1 : (1 + ROAM.extra/ROAM.base)/(u >= ROAM.at && u < ROAM.to ? RK : 1);
  // an integral over REAL time of a speed given at u, so a spin keeps its turns per second through the roam
  const overReal = (f, u, N) => { const s1 = toReal(u); let a = 0; for (let k=0;k<N;k++) a += f(fromReal((k + .5)/N*s1))*s1/N; return a; };
  const spinOf = (u) => 22.7*overReal((v) => v < .3 ? sm(0, .3, v) : v < .9 ? 1 - .55*sm(.3, .9, v) : .45*(1 - sm(.9, 1, v)), u, 32);   // the tornado's spin: the integral of its speed
  // the boss as a top: its spin speed (0..1; the coil turns it slowly backwards) and its angle, the integral of that speed
  const spinRate = (u) => sm(.3, .43, u)*(1 - sm(.84, 1, u));
  const spun = (u) => overReal(spinRate, u, 64);
  // ~120 rad per unit u at full spin (about 4 turns/s; owner: faster), trimmed so coil + spin end on a WHOLE number of turns: the next pose is at
  // rest (angle 0) and the wings have no rotational symmetry, so any remainder would snap back at u = 1
  const COIL = .5, TOP =(Math.round((120*spun(1) - COIL)/TAU)*TAU + COIL)/spun(1);
  const topOf = (u) => TOP*spun(u) - COIL*sm(0, .3, u);   // a small turn back over the coil, then the spin
  // THE WHEEL: three straight legs from home, past the player and back, at constant speed after an easy start; the disc's flat
  // spin (in the floor plane), trimmed to whole turns like the top so u = 1 lands at rest
  const wheelLegs = (PX, PY) => { const d0 = Math.hypot(PX, PY) || 1, dx = PX/d0, dy = PY/d0, nx = dy, ny = -dx;
    const P = (a, b) => ({ x: dx*a + nx*b, y: dy*a + ny*b }); return [P(0, 0), P(d0*1.12, .95), P(d0*.5, -1.55), P(0, 0)]; };
  const wheelAt = (u, PX, PY) => { const W = wheelLegs(PX, PY), Ls = [0]; for (let k=1;k<W.length;k++) Ls.push(Ls[k - 1] + Math.hypot(W[k].x - W[k - 1].x, W[k].y - W[k - 1].y));
    const s = cl((u - .22)/.6), L = Ls[3]*(s*s*(3 - 2*s)*.3 + s*.7); let k = 1; while (k < 3 && L > Ls[k]) k++;
    const f = (L - Ls[k - 1])/(Ls[k] - Ls[k - 1] || 1), A = W[k - 1], B = W[k], hit = Math.max(0, 1 - Math.min(Math.abs(L - Ls[1]), Math.abs(L - Ls[2]))/.4);
    return { x: A.x + (B.x - A.x)*f, y: A.y + (B.y - A.y)*f, leg: k - 1, dir: Math.atan2(B.y - A.y, B.x - A.x), hit: s > 0 && s < 1 ? hit*hit : 0, legs: W, L, Ls }; };
  const wheelRate = (u) => sm(.14, .24, u)*(1 - sm(.8, .88, u));
  const wheelSpun = (u) => { let a = 0; const N = 48; for (let k=0;k<N;k++) a += wheelRate((k + .5)/N*u)*u/N; return a; };
  const WHEEL = Math.round(110*wheelSpun(1)/TAU)*TAU/wheelSpun(1);
  // FEATHER RECALL: where each shed feather stakes itself. Spread round the player's side of the boss, kept on the arena tile,
  // and feather 4 lands just behind the player so its way home runs straight through them
  const recallPlants = (PX, PY) => { const phi = Math.atan2(PY, PX), d0 = Math.hypot(PX, PY) || 1, N = 10, out = [];
    for (let i=0;i<N;i++){ if (i === 4){ out.push({ x: PX/d0*(d0 + .7), y: PY/d0*(d0 + .7) }); continue; }
      const a = phi + (i/(N - 1)*2 - 1)*1.9 + .14*(hh(i, 71) - .5); let r = 1.5 + 1.6*hh(i, 72);
      for (let n=0;n<8;n++){ const x = Math.cos(a)*r, y = Math.sin(a)*r; if (Math.abs(x) < 2.8 && y < 3.6 && y > -1.9) break; r *= .85; }
      out.push({ x: Math.cos(a)*r, y: Math.sin(a)*r }); }
    return out; };
  const rec0 = () => ({ rot: [0, 0, 0], sc: [1, 1, 1], pin: 0, spin: 0, spinRate: 0, yaw: 0, ox: 0, px: 0, py: 0, merge: 0, dy: 0, dx: 0, sx: 1, sy: 1, bk: 1, gape: 0, eo: 1, fl: 0, tx: null, ty: null, hot: 0, lop: 1, glint: 0, ga: 0, lamp: true,
    windup: 0, squash: 0, strike: 0, recovery: 0, flash: 0, fire: 0 });
  function stage(atk, u, t, PX, PY, Q){
    Q.tx = PX; Q.ty = PY; Q.lamp = false;
    if (atk === 'blast'){
      // WINDUP: every wing folds up into one tight bud, the body rises, the halo shrinks. STRIKE: the bud bursts, the body snaps
      // long at the player. RECOVERY (held): the wings hang sagged far below rest and the great seal gapes
      const g = sm(0, .2, u), sq = sm(.28, .4, u), sqv = sq*(1 - sm(.45, .52, u)), k = cl((u - .45)/.11), bo = u < .45 ? 0 : backOut(k), sp = u < .45 ? 0 : 1 - sm(.6, .74, u), rec = sm(.62, .74, u)*(1 - sm(.95, 1, u));
      const fold = u < .45 ? g : 1 - bo, FOLD = [-.4, -1.1, -1.55], FLING = [.35, .45, .35], tw = .02*Math.sin(t*23)*sm(.15, .2, u)*(1 - sm(.4, .45, u));
      Q.rot = FOLD.map((v, i) => v*fold + FLING[i]*sp*Math.min(1, bo) + SAG[i]*rec + tw);
      const sc = u < .45 ? 1 - .3*g - .25*sq : .45 + .67*bo - .12*sm(.56, .7, u) - .18*rec; Q.sc = [sc, sc, sc];
      const pl = Math.sin(Math.PI*cl((u - .45)/.22)), rc = Math.sin(Math.PI*cl((u - .6)/.2)); Q.sx = (1 + .22*sqv)*(1 - .18*pl)*(1 + .1*rc); Q.sy = (1 - .34*sqv)*(1 + .42*pl)*(1 - .14*rc);
      Q.dy = u < .45 ? -.14*g + .05*sq : -.09*(1 - bo) + .36*pl - .16*rc + .12*rec;
      Q.bk = u < .45 ? 1 - .45*g - .2*sq : .35 + .8*bo - .15*sm(.56, .7, u) - .25*rec; Q.gape = rec;
      Q.eo = u < .45 ? 1 - .6*g - .38*sq : 1 - .98*(1 - bo); Q.fl = pl;
      Q.windup = g; Q.squash = sqv; Q.strike = pl; Q.recovery = rec; Q.flash = pl;
    } else if (atk === 'tornado'){
      // A spinning top (owner: "beyblade ... spin on its VERTICAL axis"): the boss turns about the screen's up-down axis like
      // a top seen from the side, so its width is cos(yaw) and one wing side swings to the front while the other goes behind.
      // WINDUP: a small turn back, then it rips up to full spin, the up and down pairs spreading out flat like blades.
      // STRIKE: at peak spin the vortex is flung off. RECOVERY: the spin dies, the top wobbles wider, dizzy, eyes rolling
      const dz = sm(.84, .9, u)*(1 - sm(.95, 1, u)), coil = sm(0, .3, u)*(1 - sm(.3, .36, u)), fast = spinRate(u);
      const pl = Math.sin(Math.PI*cl((u - .43)/.2)), wob = .05*fast + .16*sm(.84, 1, u)*(1 - sm(.97, 1, u));
      Q.yaw = topOf(u); Q.sx = Math.cos(Q.yaw); Q.sc = [1, 1, 1].map(() => (1 - .12*coil)*(1 + .06*fast + .08*pl) - .16*dz);
      Q.ox = wob*Math.cos(t*9); Q.dy = .6*wob*Math.sin(t*9) - .05*coil - .05*fast + .1*dz; Q.gape = dz; Q.bk = 1 + .12*fast - .25*dz;
      Q.rot = SAG.map((v, i) => .6*v*dz - .15*coil + [.55, 0, -.45][i]*fast);
      Q.eo = 1 - .35*fast*(1 - pl); Q.fl = pl;
      if (dz > 0){ Q.tx = PX*(1 - dz) + 2*Math.cos(t*6)*dz; Q.ty = PY*(1 - dz) + 2*Math.sin(t*6)*dz; }
      Q.windup = sm(0, .3, u)*(1 - sm(.42, .46, u)); Q.squash = coil; Q.strike = pl; Q.recovery = dz; Q.flash = pl; Q.spinRate = fast;
    } else if (atk === 'laser'){
      // WINDUP: the four laser eyes swivel to the player and run hot. STRIKE: the wings whip down as each eye fires.
      // RECOVERY: the eyes droop half shut
      const sw = sm(0, .2, u), br = sm(0, .3, u)*(1 - sm(.85, 1, u)), kick = Math.sin(Math.PI*cl((u - .43)/.2));
      Q.tx = (.5*Math.sin(t*.23))*(1 - sw) + PX*sw; Q.ty = 2.4*(1 - sw) + PY*sw;
      const rec = sm(.89, .93, u)*(1 - sm(.97, 1, u)), sq = sm(.28, .4, u)*(1 - sm(.42, .46, u)), fi = sm(.43, .48, u)*(1 - sm(.84, .89, u)), pu = .5 + .5*Math.sin(t*16);
      const wh = sm(.43, .49, u) - .8*sm(.5, .66, u);   // the whip: every wing snaps down as the beams fire, then springs back up
      Q.rot = [-.12*br + SAG[0]*rec - .3*sq + .55*wh, .14*br + .25*kick + SAG[1]*rec - .4*sq + .6*wh, -.06*br + SAG[2]*rec - .3*sq + .45*wh];
      Q.glint = 1.25*cl((u - .47)/.14); Q.ga = Math.sin(Math.PI*cl((u - .47)/.14));
      Q.dy = .03*br + .08*sq - .3*kick + .12*rec; Q.sx = (1 + .16*sq)*(1 + .2*kick)*(1 + .04*pu*fi); Q.sy = (1 - .26*sq)*(1 - .2*kick)*(1 - .03*pu*fi); Q.sc = [1, 1, 1].map(() => 1 - .22*sq - .18*rec); Q.gape = rec; Q.bk = 1 - .25*rec;
      Q.eo = 1 - .45*sw*(1 - fi); Q.fl = .5*fi + .5*kick;
      Q.hot = sm(0, .14, u)*(1 - .65*sm(.88, .95, u)); Q.lop = 1 + .15*Q.hot - .55*sm(.89, .93, u)*(1 - sm(.97, 1, u));
      Q.windup = sw; Q.squash = sq; Q.strike = kick; Q.recovery = rec; Q.flash = Q.fl; Q.fire = fi;
    } else if (atk === 'wheel'){
      // WINDUP: every wing folds in round the body into one disc of feathers, and it rocks back away from the player (the tell).
      // ROLL (u .22-.82): it spins flat like a saw blade and runs the three legs, squashing at each ricochet. RECOVERY: home, dizzy
      const d0 = Math.hypot(PX, PY) || 1, f = sm(0, .16, u)*(1 - sm(.84, .92, u)), rk = Math.sin(Math.PI*cl((u - .1)/.14)), dz = sm(.84, .9, u)*(1 - sm(.95, 1, u)), W = wheelAt(u, PX, PY);
      Q.px = W.x - PX/d0*.3*rk; Q.py = W.y - PY/d0*.3*rk; Q.spin = WHEEL*wheelSpun(u); Q.spinRate = wheelRate(u);
      Q.rot = [-.5, -1.25, -1.6].map((v, i) => v*f + .7*SAG[i]*dz); Q.sc = [1, 1, 1].map(() => 1 - .28*f - .12*dz + .06*W.hit);
      Q.sx = 1 + .16*W.hit; Q.sy = 1 - .16*W.hit; Q.dy = .1*dz; Q.eo = 1 - .85*f; Q.gape = dz; Q.bk = 1 - .3*f; Q.fl = W.hit;
      if (dz > 0){ Q.tx = PX*(1 - dz) + 2*Math.cos(t*6)*dz; Q.ty = PY*(1 - dz) + 2*Math.sin(t*6)*dz; }
      Q.windup = sm(0, .16, u)*(1 - sm(.2, .24, u)); Q.squash = rk; Q.strike = sm(.22, .26, u)*(1 - sm(.8, .84, u)); Q.recovery = dz; Q.flash = W.hit;
    } else if (atk === 'recall'){
      // WINDUP: the wings flare wide and bristle. SHED (u .19-.31): a feather flies off and stakes itself in the floor. HOLD: the
      // boss waits plucked thin while the staked feathers quiver harder. RETURN (u .62-.76): they rip free and fly straight home;
      // the boss flinches as they slot back in. RECOVERY: ruffled, hanging open
      const fl = sm(0, .18, u)*(1 - sm(.24, .34, u)), shed = Math.sin(Math.PI*cl((u - .19)/.12)), pl = sm(.26, .34, u)*(1 - sm(.7, .78, u)), ct = Math.sin(Math.PI*cl((u - .7)/.1)), rec = sm(.8, .86, u)*(1 - sm(.96, 1, u));
      Q.rot = [.35, .05, -.3].map((v, i) => v*(fl - .5*shed) + .08*ct*(i - 1) + SAG[i]*rec); Q.sc = [1, 1, 1].map(() => 1 + .12*fl - .13*pl + .08*ct - .15*rec);
      Q.sx = 1 + .08*shed - .1*ct; Q.sy = 1 - .06*shed + .12*ct; Q.dy = -.06*fl + .06*ct + .1*rec; Q.eo = 1 - .3*pl; Q.gape = rec; Q.bk = 1 + .1*fl - .2*rec; Q.fl = ct;
      Q.windup = fl; Q.squash = shed; Q.strike = ct; Q.recovery = rec; Q.flash = ct;
    } else if (atk === 'sword'){
      // FORM (u 0-.26): every wing sweeps in over the body and the feathers fuse into one long blade (the wings fold small: they ARE
      // the blade). RAISE (.26-.4): it rears up behind the boss (the tell). SLAM (.4-.47): over and down along the line to the
      // player, the body lunging after it. RECOVERY: the blade stays buried, breaks back into feathers, the wings hang open
      const d0 = Math.hypot(PX, PY) || 1, fm = sm(.02, .26, u)*(1 - sm(.84, .95, u)), rs = sm(.26, .4, u)*(1 - sm(.4, .47, u)), im = Math.sin(Math.PI*cl((u - .46)/.14)), rec = sm(.62, .72, u)*(1 - sm(.95, 1, u));
      // the UP pair sweeps to vertical and stretches: it becomes the blade (wing.merge); the others fold small out of the way
      Q.rot = [-.45, -1.1, -1.55].map((v, i) => (i ? .9 : 1)*v*fm + SAG[i]*rec*(1 - .5*fm)); Q.sc = [1, 1, 1].map((_, i) => (i ? 1 - .35*fm : 1 + .25*fm) - .1*rec);
      Q.merge = fm*(1 - sm(.42, .47, u));
      const ln = -.15*rs + .3*im; Q.px = PX/d0*ln; Q.py = PY/d0*ln; Q.sx = 1 + .2*im; Q.sy = 1 - .15*im + .06*rs; Q.dy = -.08*rs + .1*rec;
      Q.eo = 1 - .3*fm + .3*im; Q.gape = rec; Q.bk = 1 - .2*fm; Q.fl = im;
      Q.windup = fm*(1 - sm(.4, .47, u)); Q.squash = rs; Q.strike = im; Q.recovery = rec; Q.flash = im;
    }
  }
  function pose(t, ph = 3, atk = null, u = 0, gx = 0, gy = 2.4){
    ph = Math.min(ph, 3);   // ph 4 (the pencil sketch) is the ph 3 body
    const Q = rec0();
    if (atk){ const Qa = rec0(), Qb = rec0();
      stage(atk, Math.max(0, u - .05), t, gx, gy, Qa); stage(atk, Math.max(0, u - .1), t, gx, gy, Qb); stage(atk, u, t, gx, gy, Q);
      Q.rot = Qa.rot.map((v, i) => v + .8*(v - Qb.rot[i])); Q.sc = Qa.sc.map((v, i) => v + .5*(v - Qb.sc[i])); }
    const unf = ease(cl(ph - 1)*Math.PI), open = ease(cl(ph - 2)*Math.PI), opAt = (from) => ease(cl(ph - from + 1)*Math.PI);
    const vis = (i) => i < 2 ? 1 : Math.min(1, unf*2.5);
    const lay = (sx) => mul(T(Q.ox + Q.px, Q.py), mul(mul(mul(T(0, -.1), S(sx, Q.sy)), Ro(Q.spin)), T(0, .1)));
    const floor = lay(Q.sx), ground = lay(atk === 'tornado' ? 1 : Q.sx), Mb = mul(floor, T(Q.dx, Q.dy));
    const gaze = [Q.tx ?? .5*Math.sin(t*.23), Q.ty ?? 2.4];
    const wings = [], eyes = [], talons = [], tips = [], out = []; let n = 0;
    const face = Math.cos(Q.yaw), seen = cl(3*face);   // eyes shut by the time the body is edge-on (face 0) and stay hidden from behind
    for (let i=2;i>=0;i--){ if (vis(i) <= .01) continue; const Wg = WINGS[i], [rx, ry] = Wg.root, v = t*.7 + Wg.flex;
      for (const side of [-1, 1]){
        const breathe = .055*Math.sin(v), rot = breathe - (i === 2 ? (1 - unf)*1.1 : 0) + Q.rot[i] + Q.pin*side;
        const scale = WS[i]*(1 + .025*Math.sin(v + .8))*(i === 2 ? .35 + .65*unf : 1)*Q.sc[i];
        const M = mul(mul(mul(mul(mul(Mb, T(side*rx, ry)), S(side, 1)), Ro(rot)), S(scale, scale)), T(-rx, -ry));
        const root = ap(M, rx, ry), tip = ap(M, Wg.arm[2], Wg.arm[3]), len = Math.hypot(tip[0] - root[0], tip[1] - root[1]);
        const w = { pair: Wg.pair, i, side, vis: vis(i), rot, scale, flap: rot - breathe, curl: Wg.cv, root, tip, angle: Math.atan2(tip[1] - root[1], tip[0] - root[0]), len, width: Wg.w*Math.hypot(M[0], M[1]), m: M, eyes: [], depth: -side*Math.sin(Q.yaw), merge: i === 0 ? Q.merge : 0 };
        for (const e of Wg.eyes){ n++; const las = i === 1, p = ap(M, e.x, e.y);
          const E = { i, side, x: p[0], y: p[1], lx: e.x, ly: e.y, rot: e.rot, r: .11*(1 + (las ? .4*Q.hot : 0)), open: opAt(e.from)*(las ? Q.lop : 1)*blink(t*.5 + n*1.37)*seen, heat: las ? Math.max(.6, Q.hot) : .6, las };
          w.eyes.push(E); eyes.push(E); if (las) out.push(p); }
        if (vis(i) > .9) Wg.tips.forEach(([x, y], j) => { if (!(j%2)) tips.push(ap(M, x, y)); });
        for (const q of Wg.feathers) if (q.tal){ const a = ap(M, q.base[0], q.base[1]), b = ap(M, q.sp[10][0], q.sp[10][1]); talons.push({ side, root: a, tip: b, angle: Math.atan2(b[1] - a[1], b[0] - a[0]), len: Math.hypot(b[0] - a[0], b[1] - a[1]) }); }
        wings.push(w); } }
    const ge = ap(Mb, EYE.x, EYE.y), gp = Q.gape, hc = ap(floor, HALO.x, HALO.y);
    const burst = ph >= 3 ? 0 : Math.sin(Math.PI*cl((ph - 2.25)/.75));
    return {
      body: { pivot: [0, -.1], sx: Q.sx, sy: Q.sy, rot: Q.spin, ox: Q.ox + Q.px, oy: Q.py, dx: Q.dx, dy: Q.dy, m: Mb, floor, ground, yaw: Q.yaw, face },
      wings, eyes, talons, tips, out, gaze,
      eye: { x: ge[0], y: ge[1], r: EYE.r, open: open*Q.eo*(1 - .55*gp)*(1 + .25*Q.fl)*seen, lid: 1 - open, heat: Math.max(0, 1 - .9*gp + Q.fl), gape: gp, seam: (1 - open)*(.55 + .45*ease(t*.8) + .6*gp) },
      halo: { x: hc[0], y: hc[1], r: HALO.r, scale: Q.bk },
      beats: { windup: Q.windup, squash: Q.squash, strike: Q.strike, recovery: Q.recovery, flash: Q.flash, fire: Q.fire, glint: Q.ga, spin: Q.spinRate, burst, unfold: unf, open },
      raw: Q,
    };
  }

  // ---- the attacks' danger geometry, R units round the boss centre
  function attackUnit(atk, u, ph = 3, PX = 0, PY = 2.4, t = 0, P = null){
    const phi = Math.atan2(PY, PX);
    if (atk === 'blast'){
      const suck = [];
      for (let i=0;i<12;i++){ const q = cl((u - .02 - .28*hh(i, 2))/.16); if (q <= 0 || q >= 1) continue;   // beads sucked into the bud
        const a = hh(i, 1)*TAU, r = 1.75 - 1.4*q*q; suck.push({ x: Math.cos(a)*r, y: -.1 + Math.sin(a)*r*.9, r: .035 + .025*hh(i, 3), al: Math.sin(Math.PI*q) }); }
      const sh = sm(.45, .62, u), shock = sh > 0 && sh < 1 ? { x: 0, y: -.1, r: .75 + 1.5*sh, w: .12, al: (1 - sh)*sm(.44, .47, u) } : null;
      const kw = cl((u - .5)/.36); let sheet = null;
      if (kw > 0 && kw < 1){ const s = 1 - (1 - kw)*(1 - kw), hw = .5 + .15*s, fade = Math.pow(1 - kw, .7)*sm(.5, .53, u), front = .9 + 3.3*s, crests = [], flows = [], drops = [];
        for (let i=0;i<7;i++){ const aa = phi + hw*.85*(hh(i, 3)*2 - 1), r1 = front - .1 - hh(i, 5)*.3, r0 = r1 - .5 - hh(i, 4)*.5; if (r0 >= .7) flows.push({ a: aa, r0, r1 }); }
        for (let j=0;j<3;j++){ const r = front - j*.42; if (r >= .7) crests.push({ r, a0: phi - hw*(1 - j*.12), a1: phi + hw*(1 - j*.12), f: fade*(1 - j*.3), j }); }
        for (let j=0;j<16;j++){ const aa = phi + hw*1.05*(hh(j, 31)*2 - 1), r = front + .06 + .45*hh(j, 32)*s;
          drops.push({ x: Math.cos(aa)*r, y: Math.sin(aa)*r, z: (.03 + .035*hh(j, 33))*(1 - .4*kw), a: aa, tl: .08 + .3*(1 - kw) }); }
        sheet = { apex: { x: 0, y: 0 }, dir: phi, half: hw, front, band: .42, fade, s, kw, crests, flows, drops }; }
      return { dir: phi, suck, shock, sheet };
    }
    if (atk === 'tornado'){
      // the road (u = .42 .. .88): from just off the boss to the locked aim, wandering side to side and settling onto it
      const road = (v) => { const f = .4 + .6*sm(.44, .88, v), w = .5*Math.sin(toReal(v)*9 + .5)*sm(.42, .55, v)*(1 - sm(.74, .88, v)); return { x: PX*f - Math.sin(phi)*w, y: .2 + (PY - .2)*f + Math.cos(phi)*w }; };
      const path = [], pathR = []; for (let k=0;k<10;k++){ path.push(road(.46 + .42*k/9)); pathR.push(.16 + .015*k); }
      const e = road(.88), sc = .45 + .55*sm(.43, .58, u), d = sm(.84, .91, u), v0 = Math.max(.42, u - .3), trail = [];
      for (let k=0;k<=10;k++) trail.push(road(v0 + (u - v0)*k/10));
      const wind = u < .3 ? sm(0, .3, u) : u < .9 ? 1 - .55*sm(.3, .9, u) : .45*(1 - sm(.9, 1, u));
      return { path, pathR, end: { x: e.x, y: e.y, r: .42 }, tele: 0,   // owner: the path telegraph (a coil of rings along the road) read as an ugly stretched tornado; off
        pos: road(u),
        alive: sm(.43, .52, u)*(1 - sm(.93, .98, u)), collapse: d, pool: sm(.85, .92, u)*(1 - sm(.97, 1, u)), scale: sc, height: 1.4*sc, radius: .94*sc*(1 + .7*d), foot: .16*sc*(1 + .7*d),
        spin: spinOf(u), wind, trail, dizzy: sm(.84, .9, u)*(1 - sm(.95, 1, u)), road };
    }
    if (atk === 'laser'){
      const E = (P || pose(t, ph, atk, u, PX, PY)).out;
      const fire = sm(.43, .47, u)*(1 - sm(.84, .89, u)), s = cl((u - .45)/.42), rt = sm(.05, .42, u)*(1 - sm(.43, .48, u));
      const cx = 0, cy = -.1, d0 = Math.hypot(PX - cx, PY - cy) || 1, dx = (PX - cx)/d0, dy = (PY - cy)/d0, nx = dy, ny = -dx;
      const S0 = { x: cx + dx*.75, y: cy + dy*.75 }, L = d0 - .75 + LAS.past, run = L*(s*s*(3 - 2*s)*.35 + s*.65);   // eases in, then walks at a steady pace
      const hit = { x: S0.x + dx*run, y: S0.y + dy*run };
      const beams = E.map(([ex, ey], i) => { const off = LAS.lanes[i], sg = off < 0 ? -1 : 1, gx = hit.x + nx*off, gy = hit.y + ny*off, base = Math.atan2(PY - ey, PX - ex);
        const a = Math.atan2(gy - ey, gx - ex), len = Math.hypot(gx - ex, gy - ey), a0 = Math.atan2(S0.y + ny*off - ey, S0.x + nx*off - ex);
        return { x: ex, y: ey, sg, amp: Math.abs(a - a0), base, a0, a, dist: Math.hypot(PX - ex, PY - ey), len, w: .065*fire, off, end: { x: gx, y: gy }, start: { x: S0.x + nx*off, y: S0.y + ny*off } }; });
      return { aim: sm(.08, .25, u)*(1 - sm(.43, .46, u)), fire, sweep: s, scorch: 1 - sm(.9, 1, u), reticle: { x: PX, y: PY, r: .9 - .55*sm(.05, .42, u), al: rt },
        pool: sm(.87, .93, u)*(1 - sm(.97, 1, u)), smoke: sm(.87, .91, u)*(1 - sm(.97, 1, u)), target: { x: PX, y: PY },
        hit, track: { start: { x: S0.x, y: S0.y }, now: { x: hit.x, y: hit.y }, end: { x: S0.x + dx*L, y: S0.y + dy*L }, len: L, dx, dy, nx, ny, lanes: LAS.lanes }, beams };
    }
    if (atk === 'wheel'){
      const d0 = Math.hypot(PX, PY) || 1, rk = Math.sin(Math.PI*cl((u - .1)/.14)), at = (v) => { const W = wheelAt(v, PX, PY), r = Math.sin(Math.PI*cl((v - .1)/.14)); return { x: W.x - PX/d0*.3*r, y: W.y - PY/d0*.3*r }; };
      const W = wheelAt(u, PX, PY), roll = sm(.22, .26, u)*(1 - sm(.8, .84, u)), trail = [];
      for (let k=10;k>=0;k--) trail.push(at(Math.max(.22, u - k*.012)));
      const hits = [1, 2].map((j) => { const p = W.legs[j], q = (W.L - W.Ls[j])/1.4; return { x: p.x, y: p.y, al: u > .22 && q > 0 && q < 1 ? 1 - q : 0 }; });
      return { pos: at(u), r: .8, roll, spin: WHEEL*wheelSpun(u), rate: wheelRate(u), dir: W.dir, legs: W.legs, leg: W.leg, hit: W.hit, hits, trail, rock: rk,
        dizzy: sm(.84, .9, u)*(1 - sm(.95, 1, u)) };
    }
    if (atk === 'recall'){
      const F = recallPlants(PX, PY).map((p, i) => {
        const a = Math.atan2(p.y + .1, p.x), from = { x: Math.cos(a)*.8, y: -.1 + Math.sin(a)*.75 }, home = { x: Math.cos(a)*.5, y: -.1 + Math.sin(a)*.45 };
        const t0 = .19 + .06*hh(i, 73), t1 = t0 + .07, dr = .03 + .025*Math.hypot(p.x, p.y + .1), r0 = .73 - dr - .02*hh(i, 74), r1 = r0 + dr;
        let st = 0, k = 0, x = from.x, y = from.y, h = a, z = 0;
        if (u >= t0 && u < t1){ st = 1; k = (u - t0)/(t1 - t0); x = from.x + (p.x - from.x)*k; y = from.y + (p.y - from.y)*k; z = .5*Math.sin(Math.PI*k); }
        else if (u >= t1 && u < r0){ st = 2; k = (u - t1)/(r0 - t1); x = p.x; y = p.y; }
        else if (u >= r0 && u < r1){ st = 3; k = (u - r0)/dr; const e = k*k; x = p.x + (home.x - p.x)*e; y = p.y + (home.y - p.y)*e; z = .12*Math.sin(Math.PI*k); h = a + Math.PI; }
        else if (u >= r1) st = 4;
        return { x, y, a: h, len: .5, w: .06, z, state: st, k, vis: st >= 1 && st <= 3 ? 1 : 0, from, plant: p, home,
          quiver: st === 2 ? sm(.46, r0, u) : 0, dust: u >= t1 ? Math.max(0, 1 - (u - t1)/.08) : 0, tear: u >= r0 ? Math.max(0, 1 - (u - r0)/.06) : 0 }; });
      return { feathers: F, ret: sm(.6, .64, u)*(1 - sm(.74, .78, u)) };
    }
    if (atk === 'sword'){
      const d0 = Math.hypot(PX, PY) || 1, dx = PX/d0, dy = PY/d0, nx = dy, ny = -dx, LB = SWORD_REACH, phi = Math.atan2(dy, dx);
      const rs = sm(.26, .4, u)*(1 - sm(.4, .47, u)), im = Math.sin(Math.PI*cl((u - .46)/.14)), ln = -.15*rs + .3*im, k = cl((u - .4)/.07);
      const th = u < .4 ? Math.PI/2 + (1.7 - Math.PI/2)*sm(.26, .4, u) : 1.7*(1 - k*k), L = LB*sm(.02, .26, u);
      const kb = sm(.41, .46, u), base = { x: dx*(ln + .2)*kb, y: -.9*(1 - kb) + dy*(ln + .2)*kb }, ground = { x: base.x + dx*L*Math.cos(th), y: base.y + dy*L*Math.cos(th) }, tip = { x: ground.x, y: ground.y - .6*L*Math.sin(th) };
      // the fire runs along the blade from its base (.5, the body edge) through the slam (S0) and on by v9's tail, x4
      const q = cl((u - .47)/.14), S0 = { x: dx*(.5 + LB), y: dy*(.5 + LB) }, F0 = { x: dx*.5, y: dy*.5 }, len = LB + Math.max(.8*(.5 + LB)/2.3, d0 + .9 - .5 - LB), f = cl((u - .47)/.13), flames = [];
      // v9 burst 16 flames along ~2.6 R: the line keeps that spacing as it grows, to 48 (each flame is a painter draw)
      const NF = Math.max(16, Math.min(48, Math.round(16*len/2.6)));
      for (let i=0;i<NF;i++){ const di = len*(i + .5)/NF, ti = .47 + .13*(i + .5)/NF, life = u - ti, h = sm(0, .04, life)*(1 - sm(.16, .3, life)), j = .08*(hh(i, 81) - .5);
        flames.push({ x: F0.x + dx*di + nx*j, y: F0.y + dy*di + ny*j, h, al: h, s: hh(i, 82), sz: .28*(.8 + .4*hh(i, 83)) }); }
      return { dir: phi,
        blade: { base, tip, ground, len: Math.hypot(tip.x - base.x, tip.y - base.y), reach: L, w: .17*sm(.02, .26, u), form: sm(.02, .26, u)*(1 - sm(.84, .95, u)), lift: Math.sin(th), theta: th,
          heading: Math.atan2(tip.y - base.y, tip.x - base.x), buried: sm(.46, .48, u)*(1 - sm(.84, .95, u)), dissolve: sm(.84, .95, u), under: 1 - sm(.42, .45, u) },
        impact: u > .465 && q < 1 ? { x: S0.x, y: S0.y, r: .3 + 1.3*q, al: 1 - q } : null,
        fire: { start: F0, end: { x: F0.x + dx*len, y: F0.y + dy*len }, dx, dy, nx, ny, len, front: len*f, w: .3, flames, on: sm(.47, .5, u)*(1 - sm(.8, .9, u)), scorch: sm(.47, .52, u)*(1 - sm(.9, 1, u)) } };
    }
    return {};
  }
  // the same in world coords: every {x,y} moves to bx + x*R, by + y*R; every length scales by R; angles stay
  const LEN = new Set(['r', 'w', 'front', 'band', 'dist', 'len', 'height', 'radius', 'foot', 'z', 'tl', 'r0', 'r1', 'reach', 'sz']);
  function toWorld(o, bx, by, R){
    if (Array.isArray(o)) return o.map((v) => typeof v === 'number' ? v*R : toWorld(v, bx, by, R));
    if (!o || typeof o !== 'object') return o;
    const q = {}; for (const k in o){ const v = o[k];
      if (k === 'x' && typeof v === 'number') q.x = bx + v*R; else if (k === 'y' && typeof v === 'number') q.y = by + v*R;
      else if (k === 'pathR') q.pathR = v.map((r) => r*R); else if (typeof v === 'number') q[k] = LEN.has(k) ? v*R : v;
      else if (typeof v === 'function') q[k] = (s) => toWorld(v(s), bx, by, R); else q[k] = toWorld(v, bx, by, R); }
    return q;
  }
  // THE HAND (a style change), in boss radii round the boss centre, y down. u 0..1 over HAND_DUR s. The painter's hand comes in
  // high from the upper right (its shadow first), lowers its tool onto the boss, paints it in one zig-zag (three rows, two
  // diagonals) and lifts away. { tip (the tool's point), grip (where the hand holds it), palm, ang (the tool's axis, tip ->
  // grip, radians), z (height over the floor 0..1: 1 far above, ~.12 painting), scale (1 + .6 z: higher is bigger), shadow
  // {x, y, scale, al} (the hand's shadow on the floor), stroke {pts (the path painted so far), w (its width)}, paint (0..1
  // along the zig-zag), touch (0..1: the tool on the boss) }. Under stroke.pts the boss is already in the new style.
  // the stroke the hand paints, one of HAND_PATHS (window.HAND_PATH picks, for the playground): dense points [x, y, dt, down]
  // in boss radii, dt the time to reach the point (so a path sets its own speed), down 0 while the pen is lifted to move
  const bez = (P, a, c, b, n, down) => { for (let k = 1; k <= n; k++){ const f = k/n, g = 1 - f, x = g*g*a[0] + 2*g*f*c[0] + f*f*b[0], y = g*g*a[1] + 2*g*f*c[1] + f*f*b[1], p = P[P.length - 1];
    const e = Math.sin(Math.PI*(k - .5)/n), v = down ? .12 + .88*e : .12 + 1.6*e; P.push([x, y, Math.hypot(x - p[0], y - p[1])/v, down]); } };   // a stroke eases in and out; a lifted move is quick
  const HAND_PATHS = {
    // three bowed sweeps joined by round turns, at an even speed
    sweep: (() => { const P = [], ys = [-1.05, 0, 1.05], r = .525, bow = (x) => .1*Math.sin(Math.PI*(x + 1.8)/3.6);
      ys.forEach((y, i) => { const dir = i%2 ? -1 : 1;
        for (let k = 0; k <= 24; k++){ const x = dir*(-1.8 + 3.6*k/24); P.push([x, y - bow(x)]); }
        if (i < ys.length - 1) for (let k = 1; k < 12; k++){ const a = -Math.PI/2 + Math.PI*k/12; P.push([dir*(1.8 + r*Math.cos(a)), y + r + r*Math.sin(a)]); } });
      return P.map((p, k) => [p[0], p[1], k ? Math.hypot(p[0] - P[k - 1][0], p[1] - P[k - 1][1]) : 0, 1]); })(),
    // five curved strokes of their own lengths and slants, the pen lifting between them, a last short accent across the middle
    strokes: (() => { const P = [[-1.6, -1.05, 0, 1]], S = [
        [[-1.6, -1.05], [0, -1.55], [1.55, -1.15]], [[1.75, -.35], [.2, -.8], [-1.5, -.2]], [[-1.75, .45], [-.1, .05], [1.6, .55]],
        [[1.3, 1.15], [0, 1.6], [-1.4, 1.2]], [[-.6, -.4], [0, .2], [.7, .15]]];
      S.forEach((st, i) => { if (i){ const p = P[P.length - 1]; bez(P, [p[0], p[1]], [(p[0] + st[0][0])/2 + .25, (p[1] + st[0][1])/2 - .2], st[0], 8, 0); } bez(P, st[0], st[1], st[2], 28, 1); });
      return P; })(),
    // an irregular back-and-forth shading scribble working down the boss, slowing at each turn
    scribble: (() => { const P = []; for (let k = 0; k <= 240; k++){ const s = k/240;
        P.push([1.72*Math.sin(TAU*2.6*s + .5)*(.86 + .14*Math.sin(TAU*4.3*s)), -1.2 + 2.4*s + .22*Math.sin(TAU*6.7*s + 1), k ? 1 : 0, 1]); } return P; })(),
    // out from the eye in a loose widening spiral
    spiral: (() => { const P = []; for (let k = 0; k <= 220; k++){ const s = k/220, r = .1 + 1.6*Math.sqrt(s), a = TAU*2.4*s - .6 + .3*Math.sin(TAU*3.1*s);
        P.push([1.12*r*Math.cos(a), .84*r*Math.sin(a), k ? 1 : 0, 1]); } return P; })(),
  }, PATH_T = {};
  // THE PAINTER: the default path, new for every seed. It paints the creature, not the floor: each of the six wings in a random
  // order, as a petal (out along the feathers and back) or one or two flicks outward, with its own reach, slant, bow and
  // pace, a pause before each stroke, the pen lifting to travel between them; and last a touch on the
  // eye. Wings are aimed and sized from the rig's own feather tips
  const rng = (a) => () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  let W6 = null;
  const wings6 = () => W6 || (W6 = WINGS.flatMap((Wg) => [1, -1].map((side) => { const T = Wg.feathers.map((q) => [side*q.sp[10][0]*Wg.scale, q.sp[10][1]*Wg.scale]);
    const cx = T.reduce((t, q) => t + q[0], 0)/T.length, cy = T.reduce((t, q) => t + q[1], 0)/T.length, a = Math.atan2(cy + .1, cx);
    const d = T.map(([x, y]) => { const e = Math.atan2(y + .1, x) - a; return Math.atan2(Math.sin(e), Math.cos(e)); });
    return { a, L: Math.hypot(cx, cy + .1)*1.06, b: Math.max(.35, .8*(Math.max(...d) - Math.min(...d))) }; })));
  function painter(seed){
    const r = rng(seed*7919 + 101), P = [], W = wings6().slice(), at = (x, y, v, dn) => { const p = P[P.length - 1]; P.push([x, y, p ? Math.hypot(x - p[0], y - p[1])/v : 0, dn]); };
    W.sort((p, q) => p.a - q.a); const s0 = Math.floor(r()*6), dir = r() < .5 ? 1 : -1, O = W.map((_, i) => W[((s0 + dir*i)%6 + 6)%6]);   // round the wings from a random one, either way
    if (r() < .6){ const i = 1 + Math.floor(r()*4); [O[i], O[i + 1]] = [O[i + 1], O[i]]; }   // now and then two taken out of turn
    W.splice(0, 6, ...O);
    const pol = (rr, f) => [rr*Math.cos(f), -.1 + rr*Math.sin(f)];
    const stroke = (pts, cont) => {   // lift to its start (a quick arc, the pen raised) or, cont, glide on to it still painting; pause; paint it easing in and out
      const s0 = pts[0], p = P[P.length - 1];
      if (!p) P.push([s0[0], s0[1], 0, 1]);
      else if (cont){ const n = 6; for (let k = 1; k <= n; k++){ const f = k/n; at(p[0] + (s0[0] - p[0])*f, p[1] + (s0[1] - p[1])*f, .25 + .3*Math.sin(Math.PI*f), 1); } }
      else { const mx = (p[0] + s0[0])/2 + (r() - .5)*.5, my = (p[1] + s0[1])/2 - .2 - .25*r(), n = 7;
        for (let k = 1; k <= n; k++){ const f = k/n, g = 1 - f, e = Math.sin(Math.PI*(k - .5)/n); at(g*g*p[0] + 2*g*f*mx + f*f*s0[0], g*g*p[1] + 2*g*f*my + f*f*s0[1], .12 + 1.6*e, k < n ? 0 : 1); } }
      P[P.length - 1][2] += cont ? .03*r() : .1 + .25*r();   // the pause before the stroke
      const n = pts.length - 1, pace = .8 + .5*r(); for (let k = 1; k <= n; k++){ const e = Math.sin(Math.PI*(k - .5)/n); at(pts[k][0], pts[k][1], pace*(.12 + .88*e), 1); } };
    W.forEach((w, wi) => { const L = w.L*(1.04 + .14*r()), lean = (r() - .5)*.3, r0 = .12 + .2*r(), cont = wi > 0 && r() > .35;
      if (r() < .65){ const b = w.b*(.65 + .4*r()), n = 22, pts = []; for (let k = 0; k <= n; k++){ const s = k/n; pts.push(pol(r0 + (L - r0)*Math.pow(Math.sin(Math.PI*s), .8), w.a + lean + b*(s - .5))); } stroke(pts, cont); }   // a petal
      else (r() < .6 ? [0] : [-.22, .22]).forEach((off, oi) => { const bow = (r() - .5)*.5, n = 14, pts = []; for (let k = 0; k <= n; k++){ const s = k/n; pts.push(pol(r0 + (L - r0)*s, w.a + lean + off*w.b + bow*Math.sin(Math.PI*s))); } stroke(pts, cont && !oi); }); });   // one or two flicks
    { const a = r()*TAU, pts = []; for (let k = 0; k <= 10; k++){ const f = a + 1.6*TAU*k/10, rr = .14*(1 - .6*k/10); pts.push([rr*Math.cos(f), -.1 + rr*Math.sin(f)]); } stroke(pts); }   // the last touch, on the eye
    return P;
  }
  const pathOf = () => { const w = typeof window !== 'undefined' ? window : {}, id = HAND_PATHS[w.HAND_PATH] ? w.HAND_PATH : 'painter', key = id === 'painter' ? 'painter' + (w.HAND_SEED | 0) : id;
    if (!PATH_T[key]){ const P = id === 'painter' ? painter(w.HAND_SEED | 0) : HAND_PATHS[id], T = [0]; for (let k = 1; k < P.length; k++) T.push(T[k - 1] + P[k][2]);
      // resampled evenly in time, then gaussian-smoothed: no speed steps between segments, corners taken round like a wrist would
      const N = 720, Tn = T[T.length - 1], U = []; let k = 1;
      for (let i = 0; i <= N; i++){ const d = Tn*i/N; while (k < T.length - 1 && d > T[k]) k++; const f = (d - T[k - 1])/((T[k] - T[k - 1]) || 1), A = P[k - 1], B = P[k];
        U.push([A[0] + (B[0] - A[0])*f, A[1] + (B[1] - A[1])*f, A[3] + (B[3] - A[3])*f]); }
      const sg = .02*N, R = Math.ceil(3*sg), S = U.map((_, i) => { let x = 0, y = 0, ws = 0;
        for (let j = -R; j <= R; j++){ const q = U[Math.min(N, Math.max(0, i + j))], wt = Math.exp(-j*j/(2*sg*sg)); x += wt*q[0]; y += wt*q[1]; ws += wt; }
        return [x/ws, y/ws, U[i][2]]; });   // the pen's lifts stay sharp: only the motion is smoothed
      PATH_T[key] = S; }
    return PATH_T[key]; };
  const HAND_DUR = 3.2, HAND_TOOL = 1.6, HAND_OFF = [3.4,-3.6];
  const handZZ = (s) => { const S = pathOf(), N = S.length - 1, d = cl(s)*N, k = Math.min(N - 1, Math.floor(d)), f = d - k, A = S[k], B = S[k + 1];
    return { x: A[0] + (B[0] - A[0])*f, y: A[1] + (B[1] - A[1])*f, down: A[2] + (B[2] - A[2])*f }; };
  const HAND_WIN = { in: [.06, .28], paint: [.28, .84], out: [.84, .97] };   // u: the arrival, the painting (1.8 s of the 3.2), the lift
  function hand(u){
    const W = HAND_WIN, ein = sm(W.in[0], W.in[1], u), paint = cl((u - W.paint[0])/(W.paint[1] - W.paint[0])), ps = paint, lift = sm(W.out[0], W.out[1], u);
    const p0 = handZZ(0), pp = handZZ(ps), off = { x: HAND_OFF[0], y: HAND_OFF[1] };
    const tip = u < W.paint[0] ? { x: off.x + (p0.x - off.x)*ein, y: off.y + (p0.y - off.y)*ein } : { x: pp.x + (off.x - pp.x)*lift, y: pp.y + (off.y - pp.y)*lift };
    const dn = u < W.paint[0] ? 1 : pp.down, z = (u < W.paint[0] ? 1 - .88*ein : .12 + .88*lift) + .1*(1 - dn), touch = (u < W.paint[0] ? 0 : sm(W.paint[0], W.paint[0] + .03, u)*(1 - sm(W.paint[1] - .03, W.paint[1], u)))*dn;   // dn: the pen lifted between strokes
    const ang = -.8 + .07*Math.sin(paint*Math.PI*1.5), sc = 1 + .6*z, d = { x: Math.cos(ang), y: Math.sin(ang) };
    const grip = { x: tip.x + d.x*HAND_TOOL*sc, y: tip.y + d.y*HAND_TOOL*sc }, palm = { x: grip.x + d.x*.55*sc, y: grip.y + d.y*.55*sc };
    const pts = []; if (u >= W.paint[0]) for (let k=0;k<=200;k++){ const q = handZZ(ps*k/200); pts.push(q); }   // q.down: a lifted move paints nothing
    const shadow = { x: palm.x - (.6 + 3*z), y: palm.y + .6 + 3.2*z, scale: 1 + .3*z, al: sm(0, .14, u)*(1 - sm(.9, 1, u))*(.6 - .3*z) };
    return { tip, grip, palm, ang, z, scale: sc, shadow, stroke: { pts, w: 1.15 }, paint, touch, u };
  }
  function attack(atk, u, ph, bx, by, R, px, py, t = 0, P = null){ return toWorld(attackUnit(atk, u, ph, (px - bx)/R, (py - by)/R, t, P), bx, by, R); }
  return { WINGS, CORE, EYE, HALO, feather, pose, attackUnit, attack, hand, HAND_DUR, HAND_WIN, ROAM, SWORD_REACH, uRate, mul, apply: ap, ease, sm, cl };
})();
export default RIG
