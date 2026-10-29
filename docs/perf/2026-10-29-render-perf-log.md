# Render performance log — started 2026-10-29

Owner brief: "continue investigating and optimizing. Before culling too much (less than 75 objects,
like echo rings) try to investigate if a better geometry or other optimisation is possible. Always
keep a list of optimisations done and before/after numbers."

## How the numbers are taken

- Headless chrome-headless-shell = **SwiftShader** (WebGL in software on the CPU). Absolute ms are
  NOT phone ms. Compare before/after on the same rig, same seed, same invocation shape.
- `scripts/scenes/render-lag.js ?maxed=1&mins=10` — every chapter weapon at max with every mod,
  minute 10 of endless, 60 timed frames. "draw" = `app.renderer.render(stage)` mean ms.
- `scripts/scenes/layer-cost.js` — same build, sim frozen, cost of each named layer = full frame
  minus the frame with that layer hidden (median of 8 renders, with gl.finish).
- `scripts/scenes/crystal-rings.js` — N echo + chime rings laid around the player.

## ⚠ These headless numbers do not predict the phone

Owner, same night: "the core runs quite smoothly on my phone 60+fps" — while this rig read the
Core at 2336 ms/frame. SwiftShader runs the GPU's work on the CPU, so anything GPU-bound (fill,
full-screen shaders, the bufferSubData sync wait) is wildly overstated and its RANKING is not the
phone's. What does transfer: pure-JS time (sync(), Graphics tessellation) and work removed outright
(fewer points, fewer objects). Next step proposed: an on-phone frame-time readout in the dev menu,
and optimise against that.

## Baseline sweep (v9.14.0, render-lag maxed, minute 10)

| chapter | draw ms | enemies | note |
|---|---|---|---|
| core | **2336** | 703 | liquid WebGL renderer |
| undergrowth | 389 | 994 | |
| wreck | 319 | 899 | |
| shelf | 254 | 473 | |
| skies | 231 | 1000 | |
| surf | 224 | 547 | |
| geode | 198 | 620 | |
| body | 160 | 450 | |
| beyond | 155 | 511 | |
| topsoil | 143 | 411 | |
| magma | 121 | 125 | |
| deep | 116 | 550 | |
| garden | 109 | 748 | |
| pond | 88 | 600 | |
| city | 57 | 993 | |
| trawl | 31 | 707 | |
| mine | 10 | 70 | |
| mantle | — | | probe run broken by a page reload; re-measure |

A note on attribution: inside render(), most of the time is billed to `gl.bufferSubData`. In
SwiftShader that call waits for queued draws on the buffer, so it is where software raster gets
paid — it does NOT mean uploads are slow. Use layer-cost.js to attribute.

## Optimisations

### 1. Geode echo/chime rings (v9.14.0, shipped)

Owner report: a maxed crystal build lagged the phone. Up to ~200 echo + chime rings alive, each
6-21 Pixi circle strokes (368 points per circle at r 200), redrawn every frame, no draw cap.

| step | 50 rings | 100 rings | 200 alive |
|---|---|---|---|
| before | 203 ms (53) | — | 405 ms |
| 64-gon instead of circle(), cap 16/look | 4 ms | — | 3.6 ms |
| 32-gon, cap 50 total | 3.8 ms | — | 4.4 ms |
| 24-gon, cap 100, 40 rings per Graphics (shipped) | 5.1 ms | 7.8 ms | 6.9 ms |

Cap is 100, above the owner's 75 floor.
