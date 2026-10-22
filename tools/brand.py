#!/usr/bin/env python3
"""Generate the frogmouth brand files in docs/brand/ and the favicon.

The symbol comes from src/brand/mark.json (the same file the app draws its
live bird from). The wordmark is JetBrains Mono ExtraBold, outlined from the
font in src/fonts so the files look the same on machines without the font.

    pip install fonttools brotli
    python3 tools/brand.py
"""
import json
import pathlib

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "brand"
MARK = json.loads((ROOT / "src" / "brand" / "mark.json").read_text())
C = MARK["colors"]

INK_ON_DARK, INK_ON_LIGHT = "#DCE6E3", "#17232A"
BG_DARK, BG_LIGHT = "#121A1D", "#EDF2F0"
ADVANCE, TRACK, XH = 600, -20, 550          # font units (1000 per em)
EYE_R = 290                                 # an o-sized eye, in font units

# ── font outlines ───────────────────────────────────────────────────
font = instancer.instantiateVariableFont(TTFont(ROOT / "src" / "fonts" / "jetbrains-mono-latin-wght-normal.woff2"), {"wght": 800})
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()


def outline(ch):
    pen = SVGPathPen(glyphs)
    glyphs[cmap[ord(ch)]].draw(pen)
    return pen.getCommands()


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


# ── pieces ──────────────────────────────────────────────────────────
_ids = [0]


def eye(cx, cy, r, slant, ring_w, lash_w):
    """An eye at rest: centred pupil, heavy lid angled toward the beak."""
    _ids[0] += 1
    cid = f"e{_ids[0]}"
    w, out, inn = r * 1.4, -0.55 * r, 0.1 * r
    yl, yr = (out, inn) if slant < 0 else (inn, out)
    mid = (yl + yr) / 2 + r * 0.1
    return (
        f'<g transform="translate({f(cx)} {f(cy)})">'
        f'<clipPath id="{cid}"><circle r="{f(r - 0.5)}"/></clipPath>'
        f'<circle r="{f(r)}" fill="{C["iris"]}"/><circle r="{f(r * 0.78)}" fill="{C["irisIn"]}" opacity=".7"/>'
        f'<g clip-path="url(#{cid})">'
        f'<circle r="{f(r * 0.47)}" fill="{C["pupil"]}"/><circle cx="{f(-r * 0.17)}" cy="{f(-r * 0.2)}" r="{f(r * 0.15)}" fill="{C["glint"]}"/>'
        f'<g class="lid"><path fill="{C["lid"]}" d="M{f(-w)} {f(-r * 3)}H{f(w)}V{f(yr)}Q0 {f(mid)} {f(-w)} {f(yl)}Z"/>'
        f'<path fill="none" stroke="{C["lash"]}" stroke-width="{f(lash_w)}" stroke-linecap="round" d="M{f(-w)} {f(yl)}Q0 {f(mid)} {f(w)} {f(yr)}"/></g></g>'
        f'<circle r="{f(r)}" fill="none" stroke="{C["ring"]}" stroke-width="{f(ring_w)}"/></g>'
    )


def mark(x=0, y=0, size=128):
    k = size / 128

    def layer(l):
        if "stroke" in l:
            return f'<path fill="none" stroke="{C[l["stroke"]]}" stroke-width="{l["width"]}" stroke-linecap="round" d="{l["d"]}"/>'
        op = f' opacity="{l["opacity"]}"' if "opacity" in l else ""
        return f'<path fill="{C[l["fill"]]}"{op} d="{l["d"]}"/>'

    body = "".join(layer(l) for l in MARK["back"])
    body += "".join(eye(e["cx"], e["cy"], e["r"], e["slant"], 2, 1.6) for e in MARK["eyes"])
    body += "".join(layer(l) for l in MARK["front"])
    return f'<g transform="translate({f(x)} {f(y)}) scale({f(k)})">{body}</g>'


def wordmark(x, baseline, size, ink):
    """'frogmouth' at font size `size`; returns (svg, width)."""
    k = size / 1000
    parts, eyes = [], []
    for i, ch in enumerate("frogmouth"):
        gx = i * (ADVANCE + TRACK)
        if ch == "o":
            eyes.append((gx + ADVANCE / 2, -XH / 2, -1 if not eyes else 1))
        else:
            parts.append(f'<path transform="translate({gx} 0) scale(1 -1)" d="{outline(ch)}"/>')
    eye_svg = "".join(eye(cx, cy, EYE_R, sl, 34, 30) for cx, cy, sl in eyes)
    width = (9 * (ADVANCE + TRACK) - TRACK) * k
    return f'<g transform="translate({f(x)} {f(baseline)}) scale({f(k)})"><g fill="{ink}">{"".join(parts)}</g>{eye_svg}</g>', width


BLINK = ('<style>.lid{transform-box:fill-box;animation:blink 7s infinite}'
         '@keyframes blink{0%,93%,100%{transform:none}95%{transform:translateY(38%)}}'
         '@media (prefers-reduced-motion:reduce){.lid{animation:none}}</style>')


def svg(w, h, body, title="frogmouth", bg=None, radius=0, blink=False):
    rect = f'<rect width="{f(w)}" height="{f(h)}" rx="{f(radius)}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w)} {f(h)}" width="{f(w)}" height="{f(h)}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{BLINK if blink else ""}{rect}{body}</svg>\n')


# ── files ───────────────────────────────────────────────────────────
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}
    files["frogmouth-mark.svg"] = svg(128, 128, mark())
    files["frogmouth-app-icon.svg"] = svg(512, 512, mark(56, 50, 400), bg=BG_DARK, radius=112)

    for name, ink in (("on-dark", INK_ON_DARK), ("on-light", INK_ON_LIGHT)):
        # wordmark alone
        size = 120
        g, w = wordmark(16, 16 + EYE_R / 1000 * size + XH / 2000 * size, size, ink)
        files[f"frogmouth-wordmark-{name}.svg"] = svg(w + 32, 16 + (EYE_R + XH / 2) / 1000 * size + 0.24 * size + 8, g)
        # horizontal lockup: the wordmark's eyes level with the symbol's eyes
        size, gap = 96, 30
        eye_y = MARK["eyes"][0]["cy"]
        g, w = wordmark(128 + gap, eye_y + XH / 2000 * size, size, ink)
        files[f"frogmouth-lockup-{name}.svg"] = svg(128 + gap + w + 8, 128, mark() + g, blink=True)
        # stacked lockup
        size = 84
        g, w = wordmark(0, 0, size, ink)
        W = max(w, 168) + 32
        top = 140 + EYE_R / 1000 * size + XH / 2000 * size
        files[f"frogmouth-stacked-{name}.svg"] = svg(W, top + 0.24 * size + 12, mark((W - 136) / 2, 0, 136) + g.replace("translate(0 0)", f"translate({f((W - w) / 2)} {f(top)})", 1), blink=True)

    for name, text in files.items():
        (OUT / name).write_text(text)
    # the favicon is the symbol itself; Vite inlines it into frogmouth.html
    (ROOT / "src" / "brand" / "favicon.svg").write_text(files["frogmouth-mark.svg"])
    print("\n".join(f"wrote docs/brand/{n}" for n in files) + "\nwrote src/brand/favicon.svg")


if __name__ == "__main__":
    main()
