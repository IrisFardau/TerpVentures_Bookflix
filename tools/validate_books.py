#!/usr/bin/env python3
"""Checks the book data against the data contract and the content guide.

Rules come from docs/DEVELOPMENT_PLAN.md (section 4, data contract) and
docs/CONTENT_GUIDE.md. There are three levels:

  contract  always checked. Structure, required fields, types, allowed
            values, ISBN check digit, id and filename, catalogue references.
            The same rules js/data.js applies in the browser, plus a few more.
  strict    with --strict. Content rules: page limit, length and reading time
            match the page count, teaser word counts, cover file present,
            library link first, genre rules, catalogue rows per book.
  warning   always reported, never fail the run. Style and balance hints that
            need a human to decide (empty praise, unknown genre, unused cover).

Standard library only. Run from the repo root:
    python tools/validate_books.py            # contract rules
    python tools/validate_books.py --strict   # contract and content rules

Exit code 1 if there are errors, 0 otherwise (warnings do not count).
"""

import argparse
import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# --- Contract values (section 4 of the development plan) -------------------

ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
ISBN_PATTERN = re.compile(r"^97[89]\d{10}$")
AGE_PATTERN = re.compile(r"^(\d{1,2})\+$")

FORMATS = {"roman", "graphic novel"}
LENGTHS = {"kort", "middel"}
LANGUAGES = {"Nederlands", "Engels"}
ADAPTATION_TYPES = {"film", "serie"}

# field: (required, type check, description for the message)
STRING = (lambda v: isinstance(v, str), "a string")
WHOLE = (lambda v: isinstance(v, int) and not isinstance(v, bool), "a whole number")
LIST = (lambda v: isinstance(v, list), "a list")
OBJECT = (lambda v: isinstance(v, dict), "an object")

BOOK_FIELDS = {
    "id": (True, STRING),
    "title": (True, STRING),
    "subtitle": (False, STRING),
    "originalTitle": (False, STRING),
    "series": (False, STRING),
    "author": (True, STRING),
    "isbn": (True, STRING),
    "publisher": (True, STRING),
    "year": (True, WHOLE),
    "language": (True, STRING),
    "cover": (True, STRING),
    "format": (True, STRING),
    "genres": (True, LIST),
    "pages": (True, WHOLE),
    "length": (True, STRING),
    "readingTimeMinutes": (True, WHOLE),
    "age": (True, STRING),
    "contentWarnings": (True, LIST),
    "adaptation": (True, OBJECT),
    "teaser": (True, STRING),
    "extraTeaser": (True, STRING),
    "links": (True, LIST),
}
ADAPTATION_FIELDS = {
    "type": (True, STRING),
    "title": (True, STRING),
    "year": (True, WHOLE),
    "platform": (True, STRING),
    "note": (False, STRING),
}
LINK_FIELDS = {"label": (True, STRING), "url": (True, STRING)}

EARLIEST_BOOK_YEAR = 1450       # printing press; catches typos like 202
EARLIEST_ADAPTATION_YEAR = 1900

# --- Content rules (plan section 5 and the content guide) ------------------

MAX_PAGES = 350
SHORT_BELOW = 200               # kort: < 200 pages, middel: 200 to 350
TEASER_WORDS = (30, 60)
GENRE_COUNT = (2, 3)
AGE_RANGE = (6, 18)
MINUTES_PER_PAGE = {"roman": 1.0, "graphic novel": 0.5}
MIN_COVER_BYTES = 2000
PLATFORM = "Netflix"
LIBRARY_LABEL = "Bibliotheek"
LIBRARY_URL = re.compile(r"^https://www\.bibliotheek\.nl/catalogus/titel\.\d+\.html$")
GRAPHIC_NOVEL_GENRE = "Graphic novel"

# Catalogue rows from the content guide, step 5. Matched by title prefix so a
# row can be renamed slightly ("Kort & krachtig (tot 200 pagina's)").
ROW_ALL = "Bekend van Netflix"
ROW_BY_LENGTH = {"kort": "Kort", "middel": "Lekker doorlezen"}
ROW_GRAPHIC_NOVELS = "Graphic novels"

# Warnings only: lists from the content guide that may grow over time.
KNOWN_GENRES = {
    "Avontuur", "Detective", "Drama", "Fantasy", "Filosofisch", "Graphic novel",
    "Historisch", "Horror", "Humor", "Klassieker", "LHBTIQ+", "Misdaad",
    "Mysterie", "Realistisch", "Romantiek", "Sciencefiction", "Superhelden",
}
EMPTY_PRAISE = [
    "meeslepend", "must-read", "must read", "prachtig", "adembenemend",
    "niet meer loslaat", "niet wegleggen", "pageturner", "aanrader",
    "onvergetelijk", "hartverscheurend",
]
SPOILER_HINTS = [
    "aan het eind", "uiteindelijk", "het einde is",
    "de ontknoping", "blijkt dat", "blijkt te zijn", "loopt af", "overlijdt",
    "sterft", "gaat dood",
]
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, where, message):
        self.errors.append(f"{where}: {message}")

    def warn(self, where, message):
        self.warnings.append(f"{where}: {message}")


def rel(path):
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def load_json(path, report):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except UnicodeDecodeError:
        report.error(rel(path), "is not UTF-8")
    except json.JSONDecodeError as error:
        report.error(rel(path), f"is not valid JSON (line {error.lineno}, column {error.colno}: {error.msg})")
    return None


def isbn13_ok(isbn):
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(isbn))
    return total % 10 == 0


def words(text):
    return len(text.split())


def expected_reading_time(pages, book_format):
    minutes = pages * MINUTES_PER_PAGE[book_format]
    return max(15, round(minutes / 15) * 15)


def check_fields(obj, spec, where, report, prefix=""):
    """Required fields, types, unknown fields and string hygiene."""
    for key in obj:
        if key not in spec:
            report.error(where, f'unknown field "{prefix}{key}" (typo? see the data contract)')
    for key, (required, (is_type, type_name)) in spec.items():
        name = prefix + key
        if key not in obj:
            if required:
                report.error(where, f'missing field "{name}"')
            continue
        value = obj[key]
        if not is_type(value):
            report.error(where, f'"{name}" must be {type_name}, got {json.dumps(value, ensure_ascii=False)}')
            continue
        if isinstance(value, str):
            if not value.strip():
                report.error(where, f'"{name}" is empty')
            elif value != value.strip():
                report.error(where, f'"{name}" has spaces at the start or end')
            elif "\n" in value or "\t" in value:
                report.error(where, f'"{name}" contains a line break or tab')
            elif "  " in value:
                report.error(where, f'"{name}" contains a double space')


def check_string_list(values, name, where, report):
    if not all(isinstance(v, str) and v.strip() and v == v.strip() for v in values):
        report.error(where, f'"{name}" must only contain non-empty strings without surrounding spaces')
        return False
    duplicates = sorted({v for v in values if values.count(v) > 1})
    if duplicates:
        report.error(where, f'"{name}" lists {", ".join(duplicates)} more than once')
    return True


# --- Contract checks --------------------------------------------------------

def check_book_contract(book, file_id, where, report):
    this_year = datetime.date.today().year
    check_fields(book, BOOK_FIELDS, where, report)

    if not ID_PATTERN.match(file_id):
        report.error(where, "filename must be lowercase letters and digits with single hyphens")
    if isinstance(book.get("id"), str) and book["id"] != file_id:
        report.error(where, f'"id" is "{book["id"]}" but the filename says "{file_id}"')

    isbn = book.get("isbn")
    if isinstance(isbn, str):
        if not ISBN_PATTERN.match(isbn):
            report.error(where, f'"isbn" must be 13 digits starting with 978 or 979, no hyphens, got "{isbn}"')
        elif not isbn13_ok(isbn):
            report.error(where, f'"isbn" {isbn} has a wrong check digit (typo?)')

    for key in ("pages", "readingTimeMinutes"):
        value = book.get(key)
        if isinstance(value, int) and not isinstance(value, bool) and value <= 0:
            report.error(where, f'"{key}" must be greater than 0')
    year = book.get("year")
    if isinstance(year, int) and not EARLIEST_BOOK_YEAR <= year <= this_year:
        report.error(where, f'"year" {year} must be between {EARLIEST_BOOK_YEAR} and {this_year}')

    for key, allowed in (("language", LANGUAGES), ("format", FORMATS), ("length", LENGTHS)):
        value = book.get(key)
        if isinstance(value, str) and value not in allowed:
            report.error(where, f'"{key}" must be one of {", ".join(sorted(allowed))}, got "{value}"')

    age = book.get("age")
    if isinstance(age, str) and not AGE_PATTERN.match(age):
        report.error(where, f'"age" must look like "12+", got "{age}"')

    genres = book.get("genres")
    if isinstance(genres, list):
        if not genres:
            report.error(where, '"genres" must have at least one genre')
        check_string_list(genres, "genres", where, report)
    warnings = book.get("contentWarnings")
    if isinstance(warnings, list):
        check_string_list(warnings, "contentWarnings", where, report)

    adaptation = book.get("adaptation")
    if isinstance(adaptation, dict):
        check_fields(adaptation, ADAPTATION_FIELDS, where, report, prefix="adaptation.")
        a_type = adaptation.get("type")
        if isinstance(a_type, str) and a_type not in ADAPTATION_TYPES:
            report.error(where, f'"adaptation.type" must be "film" or "serie", got "{a_type}"')
        a_year = adaptation.get("year")
        if isinstance(a_year, int) and not EARLIEST_ADAPTATION_YEAR <= a_year <= this_year + 1:
            report.error(where, f'"adaptation.year" {a_year} must be between {EARLIEST_ADAPTATION_YEAR} and {this_year + 1}')

    links = book.get("links")
    if isinstance(links, list):
        if not links:
            report.error(where, '"links" must have at least one link')
        for index, link in enumerate(links):
            link_where = f"{where} links[{index}]"
            if not isinstance(link, dict):
                report.error(link_where, 'must be an object { "label", "url" }')
                continue
            check_fields(link, LINK_FIELDS, link_where, report)
            url = link.get("url")
            if isinstance(url, str) and not url.startswith("https://"):
                report.error(link_where, f'"url" must start with https://, got "{url}"')
        urls = [l.get("url") for l in links if isinstance(l, dict)]
        if len(urls) != len(set(urls)):
            report.error(where, '"links" contains the same url twice')

    cover = book.get("cover")
    if isinstance(cover, str) and (cover.startswith("http") or cover.startswith("/")):
        report.error(where, f'"cover" must be a relative path in assets/covers/, got "{cover}"')


def check_catalog_contract(catalog, book_ids, where, report):
    """Returns the rows that could be read, for the strict checks."""
    if not isinstance(catalog, dict):
        report.error(where, "must be a JSON object")
        return []
    for key in catalog:
        if key not in ("featured", "rows"):
            report.error(where, f'unknown field "{key}"')

    featured = catalog.get("featured")
    if not isinstance(featured, str) or not ID_PATTERN.match(featured):
        report.error(where, f'"featured" must be a book id, got {json.dumps(featured)}')
    elif featured not in book_ids:
        report.error(where, f'"featured" book "{featured}" has no file in data/books/')

    rows = catalog.get("rows")
    if not isinstance(rows, list) or not rows:
        report.error(where, '"rows" must be a non-empty list')
        return []

    good_rows = []
    titles = []
    for index, row in enumerate(rows):
        row_where = f"{where} rows[{index}]"
        if not isinstance(row, dict):
            report.error(row_where, 'must be an object { "title", "books" }')
            continue
        for key in row:
            if key not in ("title", "books"):
                report.error(row_where, f'unknown field "{key}"')
        title = row.get("title")
        if not isinstance(title, str) or not title.strip():
            report.error(row_where, '"title" must be a non-empty string')
            continue
        row_where = f'{where} row "{title}"'
        if title in titles:
            report.error(row_where, "a row with this title already exists")
        titles.append(title)
        books = row.get("books")
        if not isinstance(books, list) or not books:
            report.error(row_where, '"books" must be a non-empty list of book ids')
            continue
        for book_id in books:
            if not isinstance(book_id, str) or not ID_PATTERN.match(book_id):
                report.error(row_where, f"{json.dumps(book_id)} is not a valid book id")
            elif book_id not in book_ids:
                report.error(row_where, f'book "{book_id}" has no file in data/books/')
        duplicates = sorted({b for b in books if isinstance(b, str) and books.count(b) > 1})
        if duplicates:
            report.error(row_where, f'lists {", ".join(duplicates)} more than once')
        good_rows.append(row)
    return good_rows


def check_across_books(books, report):
    by_isbn = {}
    by_title = {}
    for book_id, book in books.items():
        if isinstance(book.get("isbn"), str):
            by_isbn.setdefault(book["isbn"], []).append(book_id)
        key = (str(book.get("title", "")).lower(), str(book.get("author", "")).lower())
        by_title.setdefault(key, []).append(book_id)
    for isbn, ids in by_isbn.items():
        if len(ids) > 1:
            report.error("data/books", f'ISBN {isbn} is used by {", ".join(sorted(ids))}')
    for (title, _), ids in by_title.items():
        if len(ids) > 1:
            report.warn("data/books", f'"{title}" by the same author appears in {", ".join(sorted(ids))}')


# --- Strict checks ----------------------------------------------------------

def check_book_strict(book, book_id, where, report):
    pages = book.get("pages")
    book_format = book.get("format")
    has_pages = isinstance(pages, int) and not isinstance(pages, bool) and pages > 0

    if has_pages:
        if pages > MAX_PAGES:
            report.error(where, f"{pages} pages is more than the limit of {MAX_PAGES}")
        expected_length = "kort" if pages < SHORT_BELOW else "middel"
        if book.get("length") in LENGTHS and book["length"] != expected_length:
            report.error(where, f'"length" is "{book["length"]}" but {pages} pages makes it "{expected_length}"')
        if book_format in MINUTES_PER_PAGE and isinstance(book.get("readingTimeMinutes"), int):
            expected = expected_reading_time(pages, book_format)
            if book["readingTimeMinutes"] != expected:
                report.error(where, f'"readingTimeMinutes" is {book["readingTimeMinutes"]}, '
                                    f"the formula gives {expected} for {pages} pages ({book_format})")

    for key in ("teaser", "extraTeaser"):
        text = book.get(key)
        if not isinstance(text, str) or not text.strip():
            continue
        count = words(text)
        low, high = TEASER_WORDS
        if not low <= count <= high:
            report.error(where, f'"{key}" has {count} words, must be {low} to {high}')
        if text.rstrip()[-1] not in ".?!…":
            report.error(where, f'"{key}" must end with a full stop, question mark or exclamation mark')
        lower = text.lower()
        for phrase in EMPTY_PRAISE:
            if phrase in lower:
                report.warn(where, f'"{key}" uses "{phrase}": say what makes it good instead (content guide 5.1)')
        for phrase in SPOILER_HINTS:
            if phrase in lower:
                report.warn(where, f'"{key}" contains "{phrase}": check it is not a spoiler (content guide 5.3)')
        if EMOJI.search(text) or "!!" in text or "#" in text:
            report.warn(where, f'"{key}" contains emoji, "!!" or a hashtag (content guide 6)')
    teaser, extra = book.get("teaser"), book.get("extraTeaser")
    if isinstance(teaser, str) and teaser and teaser == extra:
        report.error(where, '"teaser" and "extraTeaser" are the same text')

    expected_cover = f"assets/covers/{book_id}.jpg"
    cover = book.get("cover")
    if isinstance(cover, str):
        if cover != expected_cover:
            report.error(where, f'"cover" must be "{expected_cover}", got "{cover}"')
        cover_path = ROOT / cover
        if not cover_path.is_file():
            report.error(where, f"cover file {cover} does not exist (run python tools/fetch_covers.py {book_id})")
        else:
            data = cover_path.read_bytes()
            if not data.startswith(b"\xff\xd8\xff"):
                report.error(where, f"cover file {cover} is not a JPEG image")
            elif len(data) < MIN_COVER_BYTES:
                report.error(where, f"cover file {cover} is only {len(data)} bytes, probably a placeholder")

    links = book.get("links")
    if isinstance(links, list) and links and isinstance(links[0], dict):
        first = links[0]
        if first.get("label") != LIBRARY_LABEL:
            report.error(where, f'the first link must have label "{LIBRARY_LABEL}", got {json.dumps(first.get("label"), ensure_ascii=False)}')
        if isinstance(first.get("url"), str) and not LIBRARY_URL.match(first["url"]):
            report.error(where, "the first link must be a bibliotheek.nl title page like "
                                f'https://www.bibliotheek.nl/catalogus/titel.<number>.html, got "{first["url"]}"')
        for index, link in enumerate(links):
            label = link.get("label") if isinstance(link, dict) else None
            if isinstance(label, str) and len(label.split()) > 3:
                report.warn(f"{where} links[{index}]", f'label "{label}" is long for a button (content guide 4)')

    adaptation = book.get("adaptation")
    if isinstance(adaptation, dict):
        if isinstance(adaptation.get("platform"), str) and adaptation["platform"] != PLATFORM:
            report.error(where, f'"adaptation.platform" must be "{PLATFORM}" for this catalogue, got "{adaptation["platform"]}"')
        note = adaptation.get("note")
        if isinstance(note, str) and note.strip() and note.rstrip()[-1] not in ".?!":
            report.error(where, '"adaptation.note" must be a full sentence ending with a full stop')

    genres = book.get("genres")
    if isinstance(genres, list) and all(isinstance(g, str) for g in genres):
        low, high = GENRE_COUNT
        if not low <= len(genres) <= high:
            report.error(where, f'"genres" has {len(genres)} genres, must be {low} to {high}')
        if book_format == "graphic novel" and (not genres or genres[0] != GRAPHIC_NOVEL_GENRE):
            report.error(where, f'a graphic novel must have "{GRAPHIC_NOVEL_GENRE}" as its first genre')
        if book_format == "roman" and GRAPHIC_NOVEL_GENRE in genres:
            report.error(where, f'a roman must not have the genre "{GRAPHIC_NOVEL_GENRE}" (set "format" instead)')
        for genre in genres:
            if genre not in KNOWN_GENRES:
                report.warn(where, f'genre "{genre}" is new: reuse an existing one if it fits (content guide 4)')

    warnings = book.get("contentWarnings")
    if isinstance(warnings, list):
        for warning in warnings:
            if isinstance(warning, str) and warning != warning.lower():
                report.error(where, f'content warning "{warning}" must be lowercase')

    age = book.get("age")
    match = AGE_PATTERN.match(age) if isinstance(age, str) else None
    if match:
        low, high = AGE_RANGE
        if not low <= int(match.group(1)) <= high:
            report.error(where, f'"age" {age} is outside {low}+ to {high}+')

    original = book.get("originalTitle")
    if isinstance(original, str) and original == book.get("title"):
        report.error(where, '"originalTitle" is the same as "title": leave it out')


def check_catalog_strict(rows, books, file_ids, report):
    def find_row(prefix):
        return next((r for r in rows if r["title"].startswith(prefix)), None)

    in_any_row = set()
    for row in rows:
        in_any_row.update(b for b in row["books"] if isinstance(b, str))
    for book_id in books:
        if book_id not in in_any_row:
            report.error("data/catalog.json", f'book "{book_id}" is not in any row, so the site never shows it')

    row_all = find_row(ROW_ALL)
    if row_all is None:
        report.error("data/catalog.json", f'there is no row "{ROW_ALL}"')
    else:
        for book_id in books:
            if book_id not in row_all["books"]:
                report.error("data/catalog.json", f'book "{book_id}" is missing from row "{row_all["title"]}"')

    length_rows = {length: find_row(prefix) for length, prefix in ROW_BY_LENGTH.items()}
    for book_id, book in books.items():
        length = book.get("length")
        for row_length, row in length_rows.items():
            if row is None:
                continue
            listed = book_id in row["books"]
            if length == row_length and not listed:
                report.error("data/catalog.json", f'book "{book_id}" is {length} but missing from row "{row["title"]}"')
            if length != row_length and listed:
                report.error("data/catalog.json", f'book "{book_id}" is {length} but listed in row "{row["title"]}"')

    gn_row = find_row(ROW_GRAPHIC_NOVELS)
    if gn_row is not None:
        for book_id, book in books.items():
            is_gn = book.get("format") == "graphic novel"
            listed = book_id in gn_row["books"]
            if is_gn and not listed:
                report.error("data/catalog.json", f'graphic novel "{book_id}" is missing from row "{gn_row["title"]}"')
            if listed and not is_gn:
                report.error("data/catalog.json", f'"{book_id}" is not a graphic novel but listed in row "{gn_row["title"]}"')

    lengths = [b.get("length") for b in books.values()]
    short, medium = lengths.count("kort"), lengths.count("middel")
    if abs(short - medium) > 2:
        report.warn("data/books", f"{short} short and {medium} medium books: the plan aims for about half and half")

    covers_dir = ROOT / "assets" / "covers"
    if covers_dir.is_dir():
        used = {f"{book_id}.jpg" for book_id in file_ids}
        for path in sorted(covers_dir.iterdir()):
            if path.is_file() and path.name not in used:
                report.warn(rel(path), "no book uses this cover")


# --- Main -------------------------------------------------------------------

def validate(strict):
    report = Report()
    books_dir = ROOT / "data" / "books"
    if not books_dir.is_dir():
        report.error("data/books", "directory does not exist")
        return report, 0

    books = {}
    file_ids = set()  # every book file, also the ones that failed to load
    for path in sorted(books_dir.iterdir()):
        if path.is_dir() or path.name.startswith("."):
            continue
        if path.suffix != ".json":
            report.warn(rel(path), "is not a .json file and is ignored")
            continue
        where = rel(path)
        file_ids.add(path.stem)
        book = load_json(path, report)
        if book is None:
            continue
        if not isinstance(book, dict):
            report.error(where, "must be a JSON object")
            continue
        check_book_contract(book, path.stem, where, report)
        if strict:
            check_book_strict(book, path.stem, where, report)
        books[path.stem] = book

    if not books:
        report.error("data/books", "contains no book files")
    check_across_books(books, report)

    catalog_path = ROOT / "data" / "catalog.json"
    if not catalog_path.is_file():
        report.error("data/catalog.json", "does not exist")
    else:
        catalog = load_json(catalog_path, report)
        if catalog is not None:
            rows = check_catalog_contract(catalog, file_ids, "data/catalog.json", report)
            if strict:
                check_catalog_strict(rows, books, file_ids, report)
    return report, len(books)


def main():
    global ROOT
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--strict", action="store_true", help="also check the content rules")
    parser.add_argument("--root", type=Path, help=argparse.SUPPRESS)  # for testing on a copy
    args = parser.parse_args()
    if args.root:
        ROOT = args.root.resolve()

    report, count = validate(args.strict)
    for line in report.errors:
        print(f"ERROR    {line}")
    for line in report.warnings:
        print(f"WARNING  {line}")

    mode = "contract and content rules" if args.strict else "contract rules"
    summary = f"{count} book(s) checked against the {mode}: {len(report.errors)} error(s), {len(report.warnings)} warning(s)."
    if report.errors or report.warnings:
        print()
    print(summary)
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
