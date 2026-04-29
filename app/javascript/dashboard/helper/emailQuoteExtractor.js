import DOMPurify from 'dompurify';

// Wrapper classes mainstream mail clients emit around the quoted reply.
// Removed depth-agnostically (Gmail, Outlook, Yahoo, Thunderbird, Apple…).
// Purely additive over develop — nothing here can match a non-quoted body.
const QUOTE_INDICATORS = [
  '.gmail_quote_container',
  '.gmail_quote',
  '.OutlookQuote',
  '.email-quote',
  '.quoted-text',
  '.quote',
  '[class*="quote"]',
  '[class*="Quote"]',
  '.moz-cite-prefix', // Thunderbird attribution
  '.yahoo_quoted', // Yahoo Mail wrapper
  '#divRplyFwdMsg', // Outlook web/desktop reply/forward header
];

// Inline header / attribution patterns. A text node containing one of these
// causes its block-ancestor to be removed (matches develop behaviour exactly).
const HEADER_PATTERNS = [
  /On .* wrote:/i,
  /-----Original Message-----/i,
  /Sent: /i,
  /From: /i,
];

// "Hard" markers: the marker line plus every following sibling of its
// block-ancestor are removed, so the quoted body itself (not just the
// attribution line) gets stripped on forwarded / reply-with-original messages.
const HARD_HEADER_PATTERNS = [
  /-----Original Message-----/i,
  /-{2,}\s*Forwarded message\s*-{2,}/i,
  /Begin forwarded message:/i,
];

const BLOCK_TAGS = new Set(['DIV', 'P', 'BLOCKQUOTE', 'SECTION']);

export class EmailQuoteExtractor {
  // ---------- public API ----------

  /** Strip the quoted-reply tail from `html` and return the cleaned HTML. */
  static extractQuotes(html) {
    const root = this.parse(html);
    this.removeIndicatorElements(root);
    this.removeHardHeaderTails(root);
    this.removeTrailingBlockquote(root);
    this.removeHeaderBlocks(root);
    this.removePlainTextTail(root);
    return root.innerHTML;
  }

  /** True iff any quote-detection strategy finds material to strip. */
  static hasQuotes(html) {
    const root = this.parse(html);
    return (
      this.hasIndicatorElement(root) ||
      this.hasTrailingBlockquote(root) ||
      this.findHardHeaderBlocks(root).length > 0 ||
      this.findHeaderBlocks(root).length > 0 ||
      this.findPlainTextTailStart(root) !== -1
    );
  }

  // ---------- shared parser ----------

  static parse(html) {
    const root = document.createElement('div');
    root.innerHTML = DOMPurify.sanitize(html);
    return root;
  }

  // ---------- 1. Indicator classes (depth-agnostic) ----------

  static removeIndicatorElements(root) {
    QUOTE_INDICATORS.forEach(selector => {
      root.querySelectorAll(selector).forEach(el => el.remove());
    });
  }

  static hasIndicatorElement(root) {
    return QUOTE_INDICATORS.some(selector => root.querySelector(selector));
  }

  // ---------- 2. Hard header tails ----------
  // For every block containing a hard-header text, remove the block AND every
  // following sibling within its parent. This strips the quoted body, not just
  // the attribution line.

  static removeHardHeaderTails(root) {
    this.findHardHeaderBlocks(root).forEach(block => {
      let cursor = block;
      while (cursor) {
        const next = cursor.nextSibling;
        cursor.remove();
        cursor = next;
      }
    });
  }

  static findHardHeaderBlocks(root) {
    return this.findBlocksContainingText(root, HARD_HEADER_PATTERNS);
  }

  // ---------- 3. Trailing <blockquote> ----------

  static removeTrailingBlockquote(root) {
    const last = root.lastElementChild;
    if (last?.matches?.('blockquote')) last.remove();
  }

  static hasTrailingBlockquote(root) {
    return root.lastElementChild?.matches?.('blockquote') ?? false;
  }

  // ---------- 4. Header blocks (deep, develop-compatible) ----------
  // For every text node matching a header pattern, remove its block-ancestor.
  // This is the develop-branch behaviour preserved verbatim.

  static removeHeaderBlocks(root) {
    this.findHeaderBlocks(root).forEach(el => el.remove());
  }

  static findHeaderBlocks(root) {
    return this.findBlocksContainingText(root, HEADER_PATTERNS);
  }

  // ---------- 5. Top-level quote tail ----------
  // For replies that arrive as text + <br> with no block wrapper (text/plain
  // bodies after sanitizeTextForRender). Find the earliest top-level text
  // node that begins a quote tail — either every visible line starts with `>`
  // (RFC quote prefix) or the text contains a header marker — and strip from
  // there, collapsing leading <br>/whitespace separators into the tail.

  static removePlainTextTail(root) {
    const start = this.findPlainTextTailStart(root);
    if (start === -1) return;
    const nodes = Array.from(root.childNodes);
    for (let i = start; i < nodes.length; i += 1) nodes[i].remove();
  }

  static findPlainTextTailStart(root) {
    const children = Array.from(root.childNodes);
    const tailIdx = children.findIndex(node =>
      this.isQuoteTailStartTextNode(node)
    );
    if (tailIdx === -1) return -1;
    let start = tailIdx;
    while (start > 0 && this.isNeutralNode(children[start - 1])) {
      start -= 1;
    }
    return start;
  }

  static isQuoteTailStartTextNode(node) {
    if (node.nodeType !== Node.TEXT_NODE) return false;
    const text = node.textContent;
    if (!text.trim()) return false;
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length > 0 && lines.every(l => l.trim().startsWith('>'))) {
      return true;
    }
    return (
      HEADER_PATTERNS.some(p => p.test(text)) ||
      HARD_HEADER_PATTERNS.some(p => p.test(text))
    );
  }

  static isNeutralNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.trim() === '';
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      return node.tagName === 'BR';
    }
    return false;
  }

  // ---------- shared text-walker primitive ----------

  static findBlocksContainingText(root, patterns) {
    const matchingBlocks = this.collectTextNodes(root)
      .filter(node => patterns.some(p => p.test(node.textContent)))
      .map(node => this.findBlockAncestor(node))
      .filter(block => block && block !== root);
    return Array.from(new Set(matchingBlocks));
  }

  static collectTextNodes(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    const nodes = [];
    for (
      let node = walker.nextNode();
      node !== null;
      node = walker.nextNode()
    ) {
      nodes.push(node);
    }
    return nodes;
  }

  static findBlockAncestor(node) {
    let current = node.parentElement;
    while (current) {
      if (BLOCK_TAGS.has(current.tagName)) return current;
      current = current.parentElement;
    }
    return null;
  }
}
