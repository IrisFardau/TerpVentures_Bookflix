"""Checks that every page has the same header and footer markup.

The header and footer are duplicated as static HTML in each page (no build
step, works without JavaScript). This script catches copies that drift apart.
The only allowed difference is aria-current="page" on the current nav link.

Usage: python tools/check_shell.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOCKS = {
    "header": re.compile(r'<header class="site-header">.*?</header>', re.S),
    "footer": re.compile(r'<footer class="site-footer">.*?</footer>', re.S),
}
ARIA_CURRENT = re.compile(r'\s+aria-current="page"')


def extract(path: Path, name: str) -> str | None:
    match = BLOCKS[name].search(path.read_text(encoding="utf-8"))
    if not match:
        return None
    return ARIA_CURRENT.sub("", match.group(0))


def main() -> int:
    pages = sorted(ROOT.glob("*.html"))
    if not pages:
        print("No HTML pages found.")
        return 1

    ok = True
    reference = pages[0]
    for name in BLOCKS:
        expected = extract(reference, name)
        if expected is None:
            print(f"{reference.name}: no {name} found")
            ok = False
            continue
        for page in pages[1:]:
            actual = extract(page, name)
            if actual is None:
                print(f"{page.name}: no {name} found")
                ok = False
            elif actual != expected:
                print(f"{page.name}: {name} differs from {reference.name}")
                ok = False

    if ok:
        print(f"Header and footer match in {len(pages)} pages.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
