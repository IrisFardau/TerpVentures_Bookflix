// Loads the catalogue and book files. See section 4 of docs/DEVELOPMENT_PLAN.md.

// Resolved against this module, so the paths work whatever URL the page is served from.
const CATALOG_URL = new URL('../data/catalog.json', import.meta.url);
const BOOKS_URL = new URL('../data/books/', import.meta.url);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISBN_PATTERN = /^\d{13}$/;
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

// ISBN-13: 13 digits with a valid check digit (weights 1,3,1,3,...).
function isValidIsbn13(value) {
  if (typeof value !== 'string' || !ISBN_PATTERN.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i += 1) {
    sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}

// Returns a list of problems with the required (non-strict) fields and the
// types of optional fields that are present. Empty means valid.
function checkBook(book, id) {
  if (!isPlainObject(book)) {
    return ['not a JSON object'];
  }
  const problems = [];
  if (book.id !== id) problems.push(`id "${book.id}" does not match filename`);
  for (const field of ['title', 'author']) {
    if (!isNonEmptyString(book[field])) problems.push(`missing ${field}`);
  }
  if (!isNonEmptyString(book.isbn)) {
    problems.push('missing isbn');
  } else if (!isValidIsbn13(book.isbn)) {
    problems.push(`isbn "${book.isbn}" must be an ISBN-13 (13 digits, no hyphens, valid check digit)`);
  }
  const adaptation = book.adaptation;
  if (!isPlainObject(adaptation)) {
    problems.push('missing adaptation');
  } else {
    if (!ADAPTATION_TYPES.includes(adaptation.type)) problems.push('adaptation.type must be "film" or "serie"');
    if (!isNonEmptyString(adaptation.title)) problems.push('missing adaptation.title');
    if (!Number.isInteger(adaptation.year)) problems.push('adaptation.year must be a number');
    if (adaptation.platform !== undefined && !isNonEmptyString(adaptation.platform)) {
      problems.push('adaptation.platform must be a string');
    }
  }
  if (!Array.isArray(book.genres) || book.genres.length === 0 || !book.genres.every(isNonEmptyString)) {
    problems.push('genres must be a non-empty list of strings');
  }
  if (book.age !== undefined && !isNonEmptyString(book.age)) {
    problems.push('age must be a string such as "12+"');
  }
  return problems;
}

// Keeps the valid rows of the catalogue and warns about the rest.
function checkRows(rows) {
  return rows.filter((row, index) => {
    if (!isPlainObject(row)) {
      console.warn(`[data] Skipping catalogue row ${index}: not a JSON object`);
      return false;
    }
    if (!isNonEmptyString(row.title)) {
      console.warn(`[data] Skipping catalogue row ${index}: missing title`);
      return false;
    }
    if (!Array.isArray(row.books)) {
      console.warn(`[data] Skipping catalogue row "${row.title}": "books" must be a list of book ids`);
      return false;
    }
    return true;
  });
}

/**
 * Loads data/catalog.json. Rejects when the catalogue cannot be loaded or has
 * no valid featured id or rows list, because no page can be built without it.
 * Malformed rows are skipped with a console warning.
 * @returns {Promise<{featured: string, rows: {title: string, books: string[]}[]}>}
 */
export function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetchJson(CATALOG_URL).then((catalog) => {
      if (!isPlainObject(catalog) || !Array.isArray(catalog.rows)) {
        throw new Error('catalog.json has no "rows" list');
      }
      if (!isValidId(catalog.featured)) {
        throw new Error(`catalog.json "featured" must be a book id, got ${JSON.stringify(catalog.featured)}`);
      }
      return { ...catalog, rows: checkRows(catalog.rows) };
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
  if (!isValidId(id)) {
    console.warn(`[data] Invalid book id: ${JSON.stringify(id)}`);
    return Promise.resolve(null);
  }
  if (!bookCache.has(id)) {
    const url = new URL(`${id}.json`, BOOKS_URL);
    const promise = fetchJson(url).then(
      (book) => {
        // An invalid file stays cached as null: reloading it gives the same result.
        const problems = checkBook(book, id);
        if (problems.length > 0) {
          console.warn(`[data] Skipping book "${id}": ${problems.join('; ')}`);
          return null;
        }
        return book;
      },
      (error) => {
        // A failed request is not cached, so a later call can retry it.
        bookCache.delete(id);
        console.warn(`[data] Skipping book "${id}": could not load ${url.pathname} (${error.message})`);
        return null;
      },
    );
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
  const ids = new Set([catalog.featured]);
  for (const row of catalog.rows) {
    for (const id of row.books) ids.add(id);
  }

  const results = await Promise.all([...ids].map(async (id) => [id, await loadBook(id)]));
  const books = new Map(results.filter(([, book]) => book !== null));
  if (!books.has(catalog.featured)) {
    console.warn(`[data] Featured book "${catalog.featured}" could not be loaded; the hero cannot be shown`);
  }
  console.info(`[data] Loaded ${books.size} of ${ids.size} books: ${[...books.keys()].join(', ')}`);
  return books;
}
