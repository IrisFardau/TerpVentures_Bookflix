// Carousel of book cards for the home page. See phase 2R in docs/DEVELOPMENT_PLAN.md.
//
// Scrolling is native (overflow-x), so touch and trackpad swiping work without
// extra code. The arrow buttons scroll one "page". Each row is a single Tab stop
// (roving tabindex): Tab enters the row on the last focused card and the next
// Tab leaves the row; within a row, the arrow keys, Home and End move the focus
// from card to card. When the row is scrolled while the focus is elsewhere (for
// example with the arrow buttons), the Tab stop moves to the first fully visible
// card, so tabbing back in does not scroll the row back.

import { createCover, detailUrl, el } from './dom.js';

const CHEVRON_PATHS = {
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
};
const KEYBOARD_HINT = 'Gebruik de pijltjestoetsen, Home en End om tussen de boeken te bewegen.';
const HINT_ID = 'carousel-hint';

let carouselCount = 0;

/**
 * Id of the keyboard hint, shared by every row. The element is hidden, so it is
 * not read in browse mode; aria-describedby still uses its text.
 */
function keyboardHintId() {
  if (!document.getElementById(HINT_ID)) {
    const hint = el('p', '', KEYBOARD_HINT);
    hint.id = HINT_ID;
    hint.hidden = true;
    document.body.append(hint);
  }
  return HINT_ID;
}

function chevron(direction) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', CHEVRON_PATHS[direction]);
  svg.append(path);
  return svg;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** "film" → "Film". The adaptation type is the Dutch word, so the label is derived from it. */
function adaptationLabel(type) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function createCard(book) {
  const item = el('li', 'carousel__item');
  const link = el('a', 'book-card');
  link.href = detailUrl(book.id);
  link.tabIndex = -1;

  const adaptation = `${adaptationLabel(book.adaptation.type)}: ${book.adaptation.title}`;
  link.append(
    createCover(book, { className: 'book-card__cover' }),
    el('span', 'book-card__title', book.title),
    el('span', 'book-card__meta', adaptation),
  );
  item.append(link);
  return item;
}

function createButton(direction, rowTitle, trackId) {
  const button = el('button', `carousel__button carousel__button--${direction}`);
  button.type = 'button';
  button.setAttribute('aria-controls', trackId);
  button.setAttribute(
    'aria-label',
    direction === 'prev' ? `Vorige boeken in ${rowTitle}` : `Volgende boeken in ${rowTitle}`,
  );
  button.append(chevron(direction));
  return button;
}

/**
 * Builds one carousel row.
 * @param {string} title row heading
 * @param {object[]} books books to show, in order
 * @returns {{element: HTMLElement, destroy: () => void}} the <section>, and a
 *   function that removes its observers and listeners (call it before
 *   discarding a row that was built more than once per page load)
 */
export function createCarousel(title, books) {
  carouselCount += 1;
  const headingId = `carousel-${carouselCount}-titel`;
  const trackId = `carousel-${carouselCount}-boeken`;
  const hintId = keyboardHintId();

  const section = el('section', 'carousel');
  section.setAttribute('aria-labelledby', headingId);

  const header = el('div', 'carousel__header');
  const heading = el('h2', 'section-title carousel__title', title);
  heading.id = headingId;
  const controls = el('div', 'carousel__controls');
  const prev = createButton('prev', title, trackId);
  const next = createButton('next', title, trackId);
  controls.append(prev, next);
  header.append(heading, controls);

  const track = el('ul', 'carousel__track');
  track.id = trackId;
  // Safari drops list semantics when list-style is none; the role keeps them.
  track.setAttribute('role', 'list');
  track.append(...books.map((book) => createCard(book)));

  section.append(header, track);

  // Roving tabindex: only the active card is in the Tab order. While the focus
  // is outside the row, the active card also carries the keyboard hint, so it
  // is announced once when the focus enters the row and not on every arrow key.
  const cards = [...track.querySelectorAll('.book-card')];
  let activeCard = cards[0];
  if (activeCard) {
    activeCard.tabIndex = 0;
    activeCard.setAttribute('aria-describedby', hintId);
  }

  function setActive(card) {
    if (card === activeCard) return;
    const hasHint = activeCard?.hasAttribute('aria-describedby');
    if (activeCard) {
      activeCard.tabIndex = -1;
      activeCard.removeAttribute('aria-describedby');
    }
    card.tabIndex = 0;
    if (hasHint) card.setAttribute('aria-describedby', hintId);
    activeCard = card;
  }

  /** After a scroll with the focus elsewhere: make the first fully visible card the Tab stop. */
  function syncActiveToScroll() {
    if (track.contains(document.activeElement)) return;
    const left = track.getBoundingClientRect().left;
    const firstVisible = cards.find((card) => card.getBoundingClientRect().left >= left - 1);
    if (firstVisible) setActive(firstVisible);
  }

  // Buttons use aria-disabled rather than disabled, so a keyboard user who
  // reaches the end of a row keeps focus on the button. Attributes are only
  // written when they change, because update() runs during scrolling.
  function setDisabled(button, disabled) {
    const value = String(disabled);
    if (button.getAttribute('aria-disabled') !== value) button.setAttribute('aria-disabled', value);
  }

  function update() {
    const max = track.scrollWidth - track.clientWidth;
    const fits = max <= 1;
    if (fits !== controls.hidden) {
      // Hiding a focused button would drop focus to <body>; move it to the active card instead.
      if (fits && controls.contains(document.activeElement)) {
        activeCard?.focus({ preventScroll: true });
      }
      controls.hidden = fits;
    }
    if (fits) return;
    setDisabled(prev, track.scrollLeft <= 1);
    setDisabled(next, track.scrollLeft >= max - 1);
  }

  // Scroll events fire at frame rate; run update() at most once per frame.
  let frame = 0;
  function scheduleUpdate() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
      syncActiveToScroll();
    });
  }

  function scrollPage(direction) {
    const amount = Math.max(track.clientWidth * 0.85, 1);
    track.scrollBy({
      left: direction * amount,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  const abort = new AbortController();
  const { signal } = abort;

  prev.addEventListener(
    'click',
    () => {
      if (prev.getAttribute('aria-disabled') !== 'true') scrollPage(-1);
    },
    { signal },
  );
  next.addEventListener(
    'click',
    () => {
      if (next.getAttribute('aria-disabled') !== 'true') scrollPage(1);
    },
    { signal },
  );

  track.addEventListener(
    'focusin',
    (event) => {
      const card = event.target.closest('.book-card');
      if (card) setActive(card);
    },
    { signal },
  );

  // Focus leaving the row: put the hint back on the Tab stop for the next entry.
  track.addEventListener(
    'focusout',
    (event) => {
      if (!track.contains(event.relatedTarget)) activeCard?.setAttribute('aria-describedby', hintId);
    },
    { signal },
  );

  track.addEventListener(
    'keydown',
    (event) => {
      // Leave browser and system shortcuts (Alt+Left for back, Ctrl+Home, ...) alone.
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const card = event.target.closest('.book-card');
      if (!card) return;
      const index = cards.indexOf(card);
      const targets = {
        ArrowLeft: index - 1,
        ArrowRight: index + 1,
        Home: 0,
        End: cards.length - 1,
      };
      const target = cards[targets[event.key]];
      if (target === undefined) return;
      event.preventDefault();
      // Moving within the row: the hint was already announced on entry.
      activeCard.removeAttribute('aria-describedby');
      setActive(target);
      target.focus();
    },
    { signal },
  );

  track.addEventListener('scroll', scheduleUpdate, { passive: true, signal });

  // No synchronous update() here: the section is not in the DOM yet, so every
  // size would read 0. A ResizeObserver delivers its first notification after
  // the track is laid out and before it is painted, so the buttons are right on
  // the first frame.
  const observer = new ResizeObserver(update);
  observer.observe(track);

  function destroy() {
    abort.abort();
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  return { element: section, destroy };
}
