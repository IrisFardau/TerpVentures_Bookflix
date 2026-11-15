# Bookflix

A Dutch-language website with a streaming-service look that shows books which were made into a film or TV series, to get young people (12 to 18) reading through what they already watch.

This is a prototype: plain HTML, CSS and JavaScript ES modules, with no framework, build step or Node.js. Book data lives in JSON files under `data/`. The plan, data contract and phase status are in [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

## Run locally

You need Python 3 (standard library only). From the repo root:

```
python -m http.server 8000
```

Then open http://localhost:8000.

Opening the HTML files straight from disk does not work: browsers block `fetch` on `file://`, so the data files cannot load.

## Pages

- `index.html`: the home page.
- `boek.html?id=<book-id>`: the detail page for one book, for example http://localhost:8000/boek.html?id=duin.

## Test locally

1. Start the server as above.
2. Open http://localhost:8000 and http://localhost:8000/boek.html?id=duin. Both pages should show the header and footer.
3. Open the browser console (F12). The data loader logs which books loaded and prints a warning for every book file that is missing or invalid. Missing books are skipped, so the site keeps working while content is being added.
4. Check the data files:

   ```
   python tools/validate_books.py
   ```

   From the end of phase 2, also run it with `--strict`.

## Project layout

| Path | Contents |
|---|---|
| `index.html`, `boek.html` | Pages |
| `css/` | `tokens.css` (theme variables), `base.css` (shared layout and components), page styles |
| `js/data.js` | Loads `data/catalog.json` and `data/books/<id>.json` |
| `data/catalog.json` | Featured book and carousel rows |
| `data/books/` | One JSON file per book; the fields are described in section 4 of the development plan |
| `assets/` | Covers and the placeholder cover |
| `tools/` | Python helper scripts |
| `docs/` | Development plan and content guide |
