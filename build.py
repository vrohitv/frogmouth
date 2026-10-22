#!/usr/bin/env python3
"""Inline src/ into a single self-contained frogmouth.html (no dependencies).

    python3 build.py           -> frogmouth.html
    python3 build.py --test    -> test/frogmouth.test.html (with test/*.js, see test/run.sh)
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).parent
TEST = "--test" in sys.argv
SRC = ROOT / "src"

def main() -> int:
    css = "\n".join(p.read_text() for p in sorted((SRC / "css").glob("*.css")))
    parts = []
    files = sorted((SRC / "js").glob("*.js"))
    if TEST:
        files += sorted((ROOT / "test").glob("*.js"))
    for p in files:
        parts.append(f"/* ── {p.name} ── */\n{p.read_text()}")
    js = "(() => {\n" + "\n".join(parts) + "\n})();"
    if re.search(r"</script", js, re.I) or re.search(r"</style", css, re.I):
        print("error: closing tag inside inlined source", file=sys.stderr)
        return 1
    html = (SRC / "index.html").read_text()
    html = html.replace("/*@CSS@*/", css).replace("/*@JS@*/", js)
    out = ROOT / ("test/frogmouth.test.html" if TEST else "frogmouth.html")
    out.write_text(html)
    print(f"wrote {out.name}: {len(html.encode()) / 1024:.1f} KB")
    return 0

if __name__ == "__main__":
    sys.exit(main())
