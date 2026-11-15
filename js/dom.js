// Small DOM helpers shared by the home page and the detail page.

const PLACEHOLDER_COVER = 'assets/placeholder-cover.svg';

/** Creates an element with an optional class and text. */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** URL of the detail page for a book, relative to the site root. */
export function detailUrl(id) {
  return `boek.html?id=${encodeURIComponent(id)}`;
}

/**
 * A cover image in a 2:3 frame. When the image fails to load, it is replaced by
 * the placeholder cover with the book title on top.
 * @param {object} book
 * @param {{className?: string, loading?: 'lazy'|'eager'}} [options]
 */
export function createCover(book, { className = '', loading = 'lazy' } = {}) {
  const frame = el('div', `cover ${className}`.trim());
  const img = el('img', 'cover__image');
  // The title is always shown as text next to the cover, so the image itself is decorative.
  img.alt = '';
  img.loading = loading;
  img.decoding = 'async';
  img.addEventListener(
    'error',
    () => {
      img.src = PLACEHOLDER_COVER;
      const title = el('span', 'cover__title', book.title);
      title.setAttribute('aria-hidden', 'true');
      frame.append(title);
    },
    { once: true },
  );
  img.src = book.cover;
  frame.append(img);
  return frame;
}
