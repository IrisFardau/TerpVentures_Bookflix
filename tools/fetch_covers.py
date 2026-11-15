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
import http.client
import json
import re
import sys
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS_DIR = ROOT / "data" / "books"
COVERS_DIR = ROOT / "assets" / "covers"

USER_AGENT = "Mozilla/5.0 (compatible; Bookflix cover fetcher)"
TIMEOUT = 30
COVER_WIDTH = 600
MIN_IMAGE_BYTES = 2000  # anything smaller is a placeholder or an error page
JPEG_MAGIC = b"\xff\xd8\xff"

LEIBNIZ_PREFIX = "https://leibniz.zbkb.nl/assets/id/"
LEIBNIZ_RE = re.compile(r'https://leibniz\.zbkb\.nl/assets/id/[^"\'\s<>]+')
WIDTH_PARAM_RE = re.compile(r"([?&])width=\d+")


def http_get(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return response.read(), response.headers.get("Content-Type", "")


def as_image(data, content_type):
    """Return data if it is a real JPEG image, otherwise None.

    Covers are stored as .jpg, so other formats (WebP, PNG) are rejected and
    the next source is tried instead of saving them under the wrong extension.
    """
    if not content_type.startswith("image/") or len(data) < MIN_IMAGE_BYTES:
        return None
    if not data.startswith(JPEG_MAGIC):
        print(f"  skipped {content_type} image: covers must be JPEG")
        return None
    return data


def library_url(book):
    for link in book.get("links", []):
        if "bibliotheek.nl" in link.get("url", ""):
            return link["url"]
    return None


class _ImageFinder(HTMLParser):
    """Collects the og:image meta value and the leibniz <img> tags of a page."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.og_image = None
        self.images = []  # (src, alt)

    def handle_starttag(self, tag, attrs):
        attrs = {name: value or "" for name, value in attrs}
        if tag == "meta" and attrs.get("property") == "og:image":
            self.og_image = attrs.get("content", "")
        elif tag == "img":
            src = attrs.get("src") or attrs.get("data-src") or ""
            if src.startswith(LEIBNIZ_PREFIX):
                self.images.append((src, attrs.get("alt", "")))


def find_cover_url(page, book):
    """Pick this book's cover from a bibliotheek.nl title page, or None.

    The page can also show other leibniz images (related titles, series), so
    the first match is not trusted. In order of preference:
      1. the og:image meta tag, which describes the page's own title;
      2. an <img> whose alt text contains the book title;
      3. the only distinct leibniz image on the page.
    When the choice is ambiguous, None is returned and the next source is tried.
    """
    finder = _ImageFinder()
    finder.feed(page)
    if finder.og_image and finder.og_image.startswith(LEIBNIZ_PREFIX):
        return finder.og_image

    title = book.get("title", "").strip().lower()
    if title:
        for src, alt in finder.images:
            if title in alt.lower():
                return src

    # Compare without the query string: the same image can appear in
    # several sizes or with different signatures.
    distinct = {}
    for match in LEIBNIZ_RE.findall(page):
        url = html.unescape(match)
        distinct.setdefault(url.split("?", 1)[0], url)
    if len(distinct) == 1:
        return next(iter(distinct.values()))
    if distinct:
        print(f"  bibliotheek.nl: {len(distinct)} different images on the page, cannot tell which is the cover")
    return None


def from_bibliotheek(book):
    page_url = library_url(book)
    if not page_url:
        return None
    page, _ = http_get(page_url)
    image_url = find_cover_url(page.decode("utf-8", errors="replace"), book)
    if not image_url:
        return None
    image_url = WIDTH_PARAM_RE.sub(rf"\g<1>width={COVER_WIDTH}", image_url)
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
    """Return the cover file for a book. Raises ValueError when the `cover`
    field points outside assets/covers/ or is not a .jpg file."""
    cover = book.get("cover") or f"assets/covers/{book['id']}.jpg"
    target = (ROOT / cover).resolve()
    if target.parent != COVERS_DIR.resolve() or target.suffix.lower() != ".jpg":
        raise ValueError(f'cover "{cover}" must be a .jpg file directly in assets/covers/')
    return target


def fetch(book, target):
    """Try each source in turn and save to target. Return the source name, or None."""
    for name, source in SOURCES:
        try:
            data = source(book)
        except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError) as error:
            print(f"  {name}: failed ({error!r})")
            continue
        if data:
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
        try:
            target = cover_path(book)
        except ValueError as error:
            print(f"{book['id']}:\n  {error}")
            missing.append(book["id"])
            continue
        if target.exists() and not args.force:
            continue
        print(f"{book['id']}:")
        source = fetch(book, target)
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
