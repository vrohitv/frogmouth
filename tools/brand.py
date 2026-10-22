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
REST, SQUINT, CLOSED, WIDE = 0.2, 0.45, 1.06, 0.0   # lid amounts, same scale as the app

# ── font outlines ───────────────────────────────────────────────────
font = instancer.instantiateVariableFont(TTFont(ROOT / "src" / "fonts" / "jetbrains-mono-latin-wght-normal.woff2"), {"wght": 800})
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()


def outline(ch):
    pen = SVGPathPen(glyphs)
    glyphs[cmap[ord(ch)]].draw(pen)
    return pen.getCommands()


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


_ids = [0]


def uid(p):
    _ids[0] += 1
    return f"{p}{_ids[0]}"


# ── the calm lid ────────────────────────────────────────────────────
def lid_path(r, amt):
    """Level, gently drooping lid edge at openness `amt` (0 wide … 1.06 shut)."""
    shift = (amt - REST) * 2.42 * r
    side, ctrl, w = -0.42 * r + shift, 0.08 * r + shift, r * 1.4
    return f"M{f(-w)} {f(-r * 3)}H{f(w)}V{f(side)}Q0 {f(ctrl)} {f(-w)} {f(side)}Z", f"M{f(-w)} {f(side)}Q0 {f(ctrl)} {f(w)} {f(side)}"


def eye(cx, cy, r, ring_w, lash_w, amt=REST, glint=True):
    cid = uid("e")
    lid, edge = lid_path(r, amt)
    g = (f'<circle cx="{f(-r * 0.17)}" cy="{f(-r * 0.05)}" r="{f(r * 0.15)}" fill="{C["glint"]}"/>' if glint else "")
    return (
        f'<g transform="translate({f(cx)} {f(cy)})">'
        f'<clipPath id="{cid}"><circle r="{f(r - 0.5)}"/></clipPath>'
        f'<circle r="{f(r)}" fill="{C["iris"]}"/><circle r="{f(r * 0.78)}" fill="{C["irisIn"]}" opacity=".7"/>'
        f'<g clip-path="url(#{cid})"><circle cy="{f(r * 0.15)}" r="{f(r * 0.47)}" fill="{C["pupil"]}"/>{g}'
        f'<g class="lid"><path fill="{C["lid"]}" d="{lid}"/>'
        f'<path fill="none" stroke="{C["lash"]}" stroke-width="{f(lash_w)}" stroke-linecap="round" d="{edge}"/></g></g>'
        f'<circle r="{f(r)}" fill="none" stroke="{C["ring"]}" stroke-width="{f(ring_w)}"/></g>'
    )


# ── the symbol ──────────────────────────────────────────────────────
def layer(l, k=1.0):
    if "stroke" in l:
        return f'<path fill="none" stroke="{C[l["stroke"]]}" stroke-width="{f(l["width"] * k)}" stroke-linecap="round" d="{l["d"]}"/>'
    op = f' opacity="{l["opacity"]}"' if "opacity" in l else ""
    return f'<path fill="{C[l["fill"]]}"{op} d="{l["d"]}"/>'


def mark(x=0, y=0, size=128, amt=REST, gape=False, small=False):
    """small: the redrawn icon for 32 px and below (no fine detail, bigger eyes, heavier mouth line)."""
    keep = (lambda l: not l.get("detail")) if small else (lambda l: True)
    er, sw = (1.16, 1.5) if small else (1.0, 1.0)
    body = "".join(layer(l) for l in MARK["back"] if keep(l))
    body += "".join(eye(e["cx"], e["cy"], e["r"] * er, 2.4 if small else 2, 2.2 if small else 1.6, amt, glint=not small) for e in MARK["eyes"])
    front = MARK["front"]
    body += "".join(layer(l) for l in front if l.get("mouth") and gape)
    jaw = "".join(layer(l, sw) for l in front if l.get("jaw") and keep(l))
    body += f'<g transform="translate(0 16)">{jaw}</g>' if gape else jaw
    body += "".join(layer(l, sw) for l in front if not l.get("mouth") and not l.get("jaw") and keep(l))
    return f'<g transform="translate({f(x)} {f(y)}) scale({f(size / 128)})">{body}</g>'


def mark_mono(color, x=0, y=0, size=128):
    """One colour: head and beak as one solid shape; brows, eye openings and the gape cut out."""
    mid = uid("m")
    cut = [f'<path fill="#000" d="{l["d"]}"/>' for l in MARK["back"] if l.get("brow")]
    pupils = []
    for e in MARK["eyes"]:
        c = uid("c")
        lid, _ = lid_path(e["r"], REST)
        cut.append(f'<g transform="translate({e["cx"]} {e["cy"]})"><clipPath id="{c}"><circle r="{e["r"]}"/></clipPath>'
                   f'<circle r="{e["r"]}" fill="#000"/><path clip-path="url(#{c})" fill="#fff" d="{lid}"/></g>')
        pupils.append(f'<circle cx="{e["cx"]}" cy="{f(e["cy"] + e["r"] * 0.15)}" r="{f(e["r"] * 0.47)}" fill="{color}"/>')
    for l in MARK["front"]:
        if l.get("beak"):  # a thin gap so the beak reads as its own shape
            cut.append(f'<path fill="none" stroke="#000" stroke-width="3.2" stroke-linejoin="round" d="{l["d"]}"/>')
        if "stroke" in l and not l.get("detail"):
            cut.append(f'<path fill="none" stroke="#000" stroke-width="{f(l["width"] * 1.25)}" stroke-linecap="round" d="{l["d"]}"/>')
    solid = "".join(f'<path fill="#fff" d="{l["d"]}"/>' for l in MARK["back"] + MARK["front"] if l.get("silhouette") or l.get("beak"))
    return (f'<g transform="translate({f(x)} {f(y)}) scale({f(size / 128)})">'
            f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="128" height="128">{solid}{"".join(cut)}</mask>'
            f'<rect width="128" height="128" fill="{color}" mask="url(#{mid})"/>{"".join(pupils)}</g>')


# ── the wordmark ────────────────────────────────────────────────────
def wordmark(x, baseline, size, ink):
    """'frogmouth' at font size `size`; returns (svg, width)."""
    k = size / 1000
    parts, eyes = [], []
    for i, ch in enumerate("frogmouth"):
        gx = i * (ADVANCE + TRACK)
        if ch == "o":
            eyes.append((gx + ADVANCE / 2, -XH / 2))
        else:
            parts.append(f'<path transform="translate({gx} 0) scale(1 -1)" d="{outline(ch)}"/>')
    eye_svg = "".join(eye(cx, cy, EYE_R, 34, 30) for cx, cy in eyes)
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
    # icon level
    files["frogmouth-mark.svg"] = svg(128, 128, mark())
    files["frogmouth-mark-small.svg"] = svg(128, 128, mark(small=True), title="frogmouth (small)")
    files["frogmouth-mark-mono-ink.svg"] = svg(128, 128, mark_mono(INK_ON_LIGHT), title="frogmouth (one colour)")
    files["frogmouth-mark-mono-white.svg"] = svg(128, 128, mark_mono("#FFFFFF"), title="frogmouth (one colour, reversed)")
    files["frogmouth-app-icon.svg"] = svg(512, 512, mark(56, 50, 400), bg=BG_DARK, radius=112)

    for name, ink in (("on-dark", INK_ON_DARK), ("on-light", INK_ON_LIGHT)):
        # compact: the wordmark alone
        size = 120
        g, w = wordmark(16, 16 + (EYE_R + XH / 2) / 1000 * size, size, ink)
        files[f"frogmouth-wordmark-{name}.svg"] = svg(w + 32, 16 + (EYE_R + XH / 2) / 1000 * size + 0.24 * size + 8, g)
        # primary: horizontal lockup, the wordmark's eyes level with the symbol's
        size, gap = 96, 30
        eye_y = MARK["eyes"][0]["cy"]
        g, w = wordmark(128 + gap, eye_y + XH / 2000 * size, size, ink)
        files[f"frogmouth-lockup-{name}.svg"] = svg(128 + gap + w + 8, 128, mark() + g, blink=True)
        # full: stacked lockup
        size = 84
        g, w = wordmark(0, 0, size, ink)
        W = max(w, 168) + 32
        top = 140 + EYE_R / 1000 * size + XH / 2000 * size
        files[f"frogmouth-stacked-{name}.svg"] = svg(W, top + 0.24 * size + 12, mark((W - 136) / 2, 0, 136) + g.replace("translate(0 0)", f"translate({f((W - w) / 2)} {f(top)})", 1), blink=True)

    # the expression set: rest, squint (idle), eyes shut (typing a secret), wide, gape (startled)
    faces = [mark(24 + i * 152, 24, 128, amt, gape) for i, (amt, gape) in enumerate(((REST, False), (SQUINT, False), (CLOSED, False), (WIDE, False), (WIDE, True)))]
    files["frogmouth-expressions.svg"] = svg(24 + 5 * 152, 176, "".join(faces), title="frogmouth expressions", bg=BG_DARK, radius=20)

    for name, text in files.items():
        (OUT / name).write_text(text)
    # the favicon is the small icon; Vite inlines it into frogmouth.html
    (ROOT / "src" / "brand" / "favicon.svg").write_text(files["frogmouth-mark-small.svg"])
    print("\n".join(f"wrote docs/brand/{n}" for n in files) + "\nwrote src/brand/favicon.svg")


if __name__ == "__main__":
    main()
