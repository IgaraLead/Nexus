import DOMPurify from 'dompurify';

// Wrapper classes mail clients use around the quoted reply.
// Removing them depth-agnostically covers Gmail, Outlook, Yahoo, Thunderbird,
// ProtonMail, Apple Mail signatures, etc.
const QUOTE_INDICATORS = [
  '.gmail_quote_container',
  '.gmail_quote',
  '.OutlookQuote',
  '.email-quote',
  '.quoted-text',
  '.quote',
  '[class*="quote"]',
  '[class*="Quote"]',
  '.moz-cite-prefix',
  '.yahoo_quoted',
  '#divRplyFwdMsg',
];

// Full-line forwarded markers — anchored so prose can't false-trigger.
const HARD_HEADERS = [
  /^\s*-+\s*Original Message\s*-+\s*$/im,
  /^\s*-+\s*Forwarded message\s*-+\s*$/im,
  /^\s*Begin forwarded message:\s*$/im,
];
const ATTRIBUTION = /^On .* wrote:/im;
// One Outlook header field. Block needs >= 2 such lines to count, so prose
// like "From: now on, please …" can't false-trigger.
const HEADER_LINE = /^(?:From|Sent|To|Cc|Bcc|Date|Subject):\s/im;

const BLOCK_SELECTOR = 'div, p, blockquote, section';
const TEXT = 3; // Node.TEXT_NODE
const ELEM = 1; // Node.ELEMENT_NODE

// `<br>` and whitespace-only text — sit inside a tail, never start one.
const isNeutral = n =>
  (n.nodeType === TEXT && !n.textContent.trim()) ||
  (n.nodeType === ELEM && n.tagName === 'BR');

// Element text with `<br>` rendered as `\n`, so line-anchored regexes match
// shapes like `<p>From: Sam<br>Sent: Wed</p>`.
const blockText = el => {
  const tmp = document.createElement('div');
  tmp.innerHTML = el.innerHTML.replaceAll(/<br\s*\/?>/gi, '\n');
  return tmp.textContent;
};

const nodeText = n => {
  if (n.nodeType === TEXT) return n.textContent;
  if (n.nodeType === ELEM) return blockText(n);
  return '';
};

// Walk back over leading neutrals so the cut sits at the boundary.
const walkBack = (kids, idx) => {
  let i = idx;
  while (i > 0 && isNeutral(kids[i - 1])) i -= 1;
  return i;
};

const countHeaderLines = t =>
  t.split('\n').filter(l => HEADER_LINE.test(l)).length;
const isSoftHeader = t => ATTRIBUTION.test(t) || countHeaderLines(t) >= 2;
const isHardHeader = t => HARD_HEADERS.some(re => re.test(t));

// Find blocks matching `predicate`, then keep only the innermost — outer
// wrappers that match via inner header text would otherwise take the user's
// reply with them.
const findBlocks = (root, predicate) => {
  const all = [...root.querySelectorAll(BLOCK_SELECTOR)].filter(el =>
    predicate(blockText(el))
  );
  return all.filter(el => !all.some(o => o !== el && el.contains(o)));
};

// Strip from the first child whose text matches `marker` (skipping leading
// neutrals), then remove every sibling after `block` — that's where the
// original-message body lives on forwarded layouts. Drop block if empty.
const cutBlockAtMarker = (block, marker) => {
  const kids = [...block.childNodes];
  const idx = kids.findIndex(c => marker(nodeText(c)));
  const from = idx === -1 ? 0 : walkBack(kids, idx);
  kids.slice(from).forEach(c => c.remove());
  while (block.nextSibling) block.nextSibling.remove();
  if (!block.childNodes.length) block.remove();
};

// Nearest enclosing `<blockquote>` (including `block` itself), or null.
const findEnclosingBlockquote = (block, root) => {
  let cur = block;
  while (cur && cur !== root) {
    if (cur.tagName === 'BLOCKQUOTE') return cur;
    cur = cur.parentElement;
  }
  return null;
};

// Walk up while `block` is the first substantive child of its parent.
// Promotes the cut to the wrapper, so a divider `<div>` plus body siblings
// AFTER it strip together.
const expandToWrapper = (block, root) => {
  let cur = block;
  while (cur.parentElement && cur.parentElement !== root) {
    const kids = [...cur.parentElement.childNodes];
    const before = kids.slice(0, kids.indexOf(cur));
    if (before.some(c => !isNeutral(c) && c.textContent.trim())) break;
    cur = cur.parentElement;
  }
  return cur;
};

// Every visible line of the text node begins with `>`.
const isRfcQuoted = n =>
  n.nodeType === TEXT &&
  !!n.textContent.trim() &&
  n.textContent
    .split('\n')
    .filter(l => l.trim())
    .every(l => l.trim().startsWith('>'));

// Top-level (text + <br>, no block wrapper) tail-start index. RFC `>` only
// fires when every following node is `>`-quoted or neutral. A header-line
// text node needs the joined tail to carry >= 2 header lines.
const findTopLevelTailStart = root => {
  const kids = [...root.childNodes];
  const tailText = i =>
    kids
      .slice(i)
      .map(n => {
        if (n.nodeType === TEXT) return n.textContent;
        if (n.nodeType !== ELEM) return '';
        return n.tagName === 'BR' ? '\n' : blockText(n);
      })
      .join('');
  const idx = kids.findIndex((n, i) => {
    if (isRfcQuoted(n))
      return kids.slice(i).every(c => isRfcQuoted(c) || isNeutral(c));
    if (n.nodeType !== TEXT || !n.textContent.trim()) return false;
    const t = n.textContent;
    if (HARD_HEADERS.some(re => re.test(t)) || ATTRIBUTION.test(t)) return true;
    return HEADER_LINE.test(t) && countHeaderLines(tailText(i)) >= 2;
  });
  return idx === -1 ? -1 : walkBack(kids, idx);
};

// Five additive strategies, each independent. Run in order.
const apply = root => {
  // 1. Strip every known quote-wrapper class.
  root.querySelectorAll(QUOTE_INDICATORS.join(',')).forEach(el => el.remove());
  // 2. Hard markers — cut block + every following sibling.
  findBlocks(root, isHardHeader).forEach(b =>
    cutBlockAtMarker(b, isHardHeader)
  );
  // 3. Trailing <blockquote> as the last top-level child.
  if (root.lastElementChild?.matches?.('blockquote'))
    root.lastElementChild.remove();
  // 4. Soft headers. Match inside a <blockquote> → remove that blockquote
  // (Apple Mail wraps attribution + body together). Match inside an outer
  // wrapper (WordSection1 shape) → hard-cut at the wrapper. Flat layout at
  // root → just block.remove(); body and bottom-posted reply look identical
  // so leave following siblings alone.
  findBlocks(root, isSoftHeader).forEach(block => {
    const bq = findEnclosingBlockquote(block, root);
    if (bq) return bq.remove();
    const cutPoint = expandToWrapper(block, root);
    if (cutPoint !== block && cutPoint.parentElement !== root) {
      return cutBlockAtMarker(
        cutPoint,
        t => HEADER_LINE.test(t) || ATTRIBUTION.test(t)
      );
    }
    return cutPoint.remove();
  });
  // 5. Top-level RFC `>` / header tail.
  const start = findTopLevelTailStart(root);
  if (start !== -1) [...root.childNodes].slice(start).forEach(n => n.remove());
};

const parse = html => {
  const root = document.createElement('div');
  root.innerHTML = DOMPurify.sanitize(html);
  return root;
};

export class EmailQuoteExtractor {
  /** Strip the quoted-reply tail and return cleaned HTML. */
  static extractQuotes(html) {
    const root = parse(html);
    apply(root);
    return root.innerHTML;
  }

  /** True when any strategy would strip something. */
  static hasQuotes(html) {
    const root = parse(html);
    const before = root.innerHTML;
    apply(root);
    return root.innerHTML !== before;
  }
}
