// Loads the catalogue and book files. See section 4 of docs/DEVELOPMENT_PLAN.md.

const CATALOG_URL = 'data/catalog.json';
const BOOKS_DIR = 'data/books/';
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ADAPTATION_TYPES = ['film', 'serie'];

const bookCache = new Map();
let catalogPromise = null;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Returns a list of problems with the required (non-strict) fields. Empty means valid.
function checkBook(book, id) {
  if (book === null || typeof book !== 'object' || Array.isArray(book)) {
    return ['not a JSON object'];
  }
  const problems = [];
  if (book.id !== id) problems.push(`id "${book.id}" does not match filename`);
  for (const field of ['title', 'author', 'isbn']) {
    if (!isNonEmptyString(book[field])) problems.push(`missing ${field}`);
  }
  const adaptation = book.adaptation;
  if (adaptation === null || typeof adaptation !== 'object') {
    problems.push('missing adaptation');
  } else {
    if (!ADAPTATION_TYPES.includes(adaptation.type)) problems.push('adaptation.type must be "film" or "serie"');
    if (!isNonEmptyString(adaptation.title)) problems.push('missing adaptation.title');
    if (!Number.isInteger(adaptation.year)) problems.push('adaptation.year must be a number');
  }
  if (!Array.isArray(book.genres) || book.genres.length === 0 || !book.genres.every(isNonEmptyString)) {
    problems.push('genres must be a non-empty list of strings');
  }
  return problems;
}

/**
 * Loads data/catalog.json. Rejects when the catalogue cannot be loaded,
 * because no page can be built without it.
 * @returns {Promise<{featured: string, rows: {title: string, books: string[]}[]}>}
 */
export function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetchJson(CATALOG_URL).then((catalog) => {
      if (!catalog || !Array.isArray(catalog.rows)) {
        throw new Error('catalog.json has no "rows" list');
      }
      return catalog;
    });
    catalogPromise.catch(() => {
      catalogPromise = null; // allow a retry
    });
  }
  return catalogPromise;
}

/**
 * Loads one book. Resolves to null (with a console warning) when the id is
 * invalid or the file is missing or invalid, so pages keep working.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export function loadBook(id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    console.warn(`[data] Invalid book id: ${JSON.stringify(id)}`);
    return Promise.resolve(null);
  }
  if (!bookCache.has(id)) {
    const promise = fetchJson(`${BOOKS_DIR}${id}.json`)
      .then((book) => {
        const problems = checkBook(book, id);
        if (problems.length > 0) {
          console.warn(`[data] Skipping book "${id}": ${problems.join('; ')}`);
          return null;
        }
        return book;
      })
      .catch((error) => {
        console.warn(`[data] Skipping book "${id}": could not load ${BOOKS_DIR}${id}.json (${error.message})`);
        return null;
      });
    bookCache.set(id, promise);
  }
  return bookCache.get(id);
}

/**
 * Loads every book referenced by the catalogue (featured book and all rows).
 * @returns {Promise<Map<string, object>>} loaded books by id, in catalogue order
 */
export async function loadAllBooks() {
  const catalog = await loadCatalog();
  const ids = new Set();
  if (catalog.featured) ids.add(catalog.featured);
  for (const row of catalog.rows) {
    for (const id of row.books ?? []) ids.add(id);
  }

  const results = await Promise.all([...ids].map(async (id) => [id, await loadBook(id)]));
  const books = new Map(results.filter(([, book]) => book !== null));
  console.info(`[data] Loaded ${books.size} of ${ids.size} books: ${[...books.keys()].join(', ')}`);
  return books;
}
