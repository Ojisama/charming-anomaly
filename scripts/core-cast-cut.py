# The Core's chapter-card thumbnails, cut out of real frames (scripts/scenes/core-cast.js shoots them).
#
#   python3 scripts/core-cast-cut.py <fx-probe --out prefix> [--dry]
#
# Each creature comes as a pair: frame 2i with it, 2i+1 the same frozen instant without it. Alpha is
# how far a pixel moved from the empty floor; holes inside the body (chrome as dark as the floor) are
# filled; the colour is un-mixed from the floor (C = aF + (1 - a)B). The drop shadow is dropped: a
# pixel only darker than the floor, not differently coloured, is shadow. Plain PIL, no numpy.
import json, sys
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

pre = sys.argv[1]
J = json.load(open(pre + '.json'))
LIM = {'needleUrchin': 2.4, 'lodestoneGolem': 1.35, 'dipoleEel': 9}   # crop radius / hitbox radius
out = Path(__file__).resolve().parent.parent / 'src' / 'cast'

def flood(n, w, h, seeds, ok):
    seen = bytearray(n)
    q = deque()
    for i in seeds:
        if ok(i) and not seen[i]: seen[i] = 1; q.append(i)
    while q:
        i = q.popleft(); x, y = i % w, i // w
        for j, good in ((i - 1, x > 0), (i + 1, x < w - 1), (i - w, y > 0), (i + w, y < h - 1)):
            if good and not seen[j] and ok(j): seen[j] = 1; q.append(j)
    return seen

for k, (cid, r) in enumerate(zip(J['ids'], J['radii'])):
    Ci = Image.open('%s-%02d.png' % (pre, 2 * k)).convert('RGB')
    s = Ci.width / 600
    cx, cy = int((J['frames'][2 * k][0] + 200) * s), int(J['frames'][2 * k][1] * s)
    h = int(70 * s)   # the golem's spikes and the eel's two ends fit in 140 world px
    box = (cx - h, cy - h, cx + h, cy + h)
    C = list(Ci.crop(box).get_flattened_data())
    B = list(Image.open('%s-%02d.png' % (pre, 2 * k + 1)).convert('RGB').crop(box).get_flattened_data())
    w = hh = 2 * h; n = w * hh
    mag = [0] * n
    for i in range(n):
        d = (C[i][0] - B[i][0], C[i][1] - B[i][1], C[i][2] - B[i][2])
        if max(d) < 0 and max(d) - min(d) < 10 and max(C[i]) > 28: continue   # shadow (the golem eye ring is near-black, not shadow)
        mag[i] = max(abs(d[0]), abs(d[1]), abs(d[2]))
    # the creature: the blob connected to the frame's centre, holes filled (everything the outside can't reach)
    # closed first (dilate, flood, erode): the golem's dark eye ring would cut its body off the centre
    mask = Image.new('L', (w, hh)); mask.putdata([255 if m > 14 else 0 for m in mag])
    hard = [v > 0 for v in mask.filter(ImageFilter.MaxFilter(11)).get_flattened_data()]
    c0 = (hh // 2) * w + w // 2
    lim2 = (LIM.get(cid, 1.6) * r * s) ** 2   # the body only
    top = -(r + 6.67) * s if cid == 'lodestoneGolem' else -1e9   # its health bar's bottom edge (liquid.js marks)
    core = flood(n, w, hh, [c0 + dx + dy * w for dx in range(-8, 9) for dy in range(-8, 9)], lambda i: hard[i] and (i % w - w // 2) ** 2 + (i // w - hh // 2) ** 2 < lim2 and i // w - hh // 2 > top)
    cm = Image.new('L', (w, hh)); cm.putdata([255 if v else 0 for v in core])
    core = [v > 0 for v in cm.filter(ImageFilter.MinFilter(11)).get_flattened_data()]
    border = [i for i in range(w)] + [n - 1 - i for i in range(w)] + [i * w for i in range(hh)] + [i * w + w - 1 for i in range(hh)]
    outside = flood(n, w, hh, border, lambda i: not core[i])
    # a ring of soft edge around the solid body
    near = flood(n, w, hh, [i for i in range(n) if not outside[i]], lambda i: mag[i] > 6 and (i % w - w // 2) ** 2 + (i // w - hh // 2) ** 2 < lim2 and i // w - hh // 2 > top)
    px = []
    for i in range(n):
        if not outside[i]: a = 1.0
        elif near[i]: a = min(1.0, max(0.0, (mag[i] - 6) / 34))
        else: a = 0.0
        if a <= 0: px.append((0, 0, 0, 0)); continue
        f = tuple(int(min(255, max(0, (C[i][c] - (1 - a) * B[i][c]) / a))) for c in range(3))
        px.append(f + (int(a * 255),))
    im = Image.new('RGBA', (w, hh)); im.putdata(px)
    im = im.crop(im.getbbox())
    if '--dry' in sys.argv: im.save('%s-cut-%s.png' % (pre, cid))
    else: im.save(out / (cid + '.png'), optimize=True)
    print(cid, im.size)
