#!/usr/bin/env python3
"""Download book covers into assets/covers/<id>.jpg.

For every file in data/books/ whose cover is missing, the script tries:
  1. bibliotheek.nl: the book's title page (from `links`, label "Bibliotheek")
     shows a cover hosted on leibniz.zbkb.nl. Those image URLs are signed and
     expire, so the page is fetched fresh and the image is downloaded at once.
  2. Open Library Covers API by ISBN.
Books for which no source works are listed at the end; add those by hand.

Standard library only. Run from the repo root:
    python tools/fetch_covers.py              # missing covers only
    python tools/fetch_covers.py --force      # download all again
    python tools/fetch_covers.py matilda      # only the given book id(s)

Exit code 1 if any cover is still missing.
"""

import argparse
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS_DIR = ROOT / "data" / "books"
COVERS_DIR = ROOT / "assets" / "covers"

USER_AGENT = "Mozilla/5.0 (compatible; Bookflix cover fetcher)"
TIMEOUT = 30
COVER_WIDTH = 600
MIN_IMAGE_BYTES = 2000  # anything smaller is a placeholder or an error page

LEIBNIZ_RE = re.compile(r'https://leibniz\.zbkb\.nl/assets/id/[^"\'\s]+')


def http_get(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return response.read(), response.headers.get("Content-Type", "")


def as_image(data, content_type):
    """Return data if it looks like a real image, otherwise None."""
    if not content_type.startswith("image/") or len(data) < MIN_IMAGE_BYTES:
        return None
    return data


def library_url(book):
    for link in book.get("links", []):
        if "bibliotheek.nl" in link.get("url", ""):
            return link["url"]
    return None


def from_bibliotheek(book):
    page_url = library_url(book)
    if not page_url:
        return None
    page, _ = http_get(page_url)
    match = LEIBNIZ_RE.search(page.decode("utf-8", errors="replace"))
    if not match:
        return None
    image_url = html.unescape(match.group(0))
    image_url = re.sub(r"width=\d+", f"width={COVER_WIDTH}", image_url)
    return as_image(*http_get(image_url))


def from_open_library(book):
    isbn = book.get("isbn")
    if not isbn:
        return None
    url = f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false"
    try:
        return as_image(*http_get(url))
    except urllib.error.HTTPError as error:
        if error.code == 404:  # no cover for this ISBN
            return None
        raise


SOURCES = [("bibliotheek.nl", from_bibliotheek), ("Open Library", from_open_library)]


def cover_path(book):
    cover = book.get("cover") or f"assets/covers/{book['id']}.jpg"
    return ROOT / cover


def fetch(book):
    """Try each source in turn. Return the source name, or None."""
    for name, source in SOURCES:
        try:
            data = source(book)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            print(f"  {name}: failed ({error})")
            continue
        if data:
            target = cover_path(book)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            return name
        print(f"  {name}: no cover")
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("ids", nargs="*", help="only these book ids")
    parser.add_argument("--force", action="store_true", help="download even if the cover exists")
    args = parser.parse_args()

    books = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(BOOKS_DIR.glob("*.json"))]
    if args.ids:
        unknown = set(args.ids) - {b["id"] for b in books}
        if unknown:
            sys.exit(f"Unknown book id(s): {', '.join(sorted(unknown))}")
        books = [b for b in books if b["id"] in args.ids]

    missing = []
    for book in books:
        target = cover_path(book)
        if target.exists() and not args.force:
            continue
        print(f"{book['id']}:")
        source = fetch(book)
        if source:
            print(f"  saved from {source} -> {target.relative_to(ROOT)}")
        else:
            missing.append(book["id"])
        time.sleep(1)  # be polite to the servers

    if missing:
        print("\nStill missing, add by hand:")
        for book_id in missing:
            print(f"  - {book_id}")
        return 1
    print("\nAll covers present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
