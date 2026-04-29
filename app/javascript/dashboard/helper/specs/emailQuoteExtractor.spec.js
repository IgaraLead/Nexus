import { describe, it, expect } from 'vitest';
import { EmailQuoteExtractor } from '../emailQuoteExtractor.js';

const SAMPLE_EMAIL_HTML = `
<p>method</p>
<blockquote>
<p>On Mon, Sep 29, 2025 at 5:18 PM John <a href="mailto:shivam@chatwoot.com">shivam@chatwoot.com</a> wrote:</p>
<p>Hi</p>
<blockquote>
<p>On Mon, Sep 29, 2025 at 5:17 PM Shivam Mishra <a href="mailto:shivam@chatwoot.com">shivam@chatwoot.com</a> wrote:</p>
<p>Yes, it is.</p>
<p>On Mon, Sep 29, 2025 at 5:16 PM John from Shaneforwoot &lt; shaneforwoot@gmail.com&gt; wrote:</p>
<blockquote>
<p>Hey</p>
<p>On Mon, Sep 29, 2025 at 4:59 PM John shivam@chatwoot.com wrote:</p>
<p>This is another quoted quoted text reply</p>
<p>This is nice</p>
<p>On Mon, Sep 29, 2025 at 4:21 PM John from Shaneforwoot &lt; &gt; shaneforwoot@gmail.com&gt; wrote:</p>
<p>Hey there, this is a reply from Chatwoot, notice the quoted text</p>
<p>Hey there</p>
<p>This is an email text, enjoy reading this</p>
<p>-- Shivam Mishra, Chatwoot</p>
</blockquote>
</blockquote>
</blockquote>
`;

const EMAIL_WITH_SIGNATURE = `
<p>Latest reply here.</p>
<p>Thanks,</p>
<p>Jane Doe</p>
<blockquote>
  <p>On Mon, Sep 22, Someone wrote:</p>
  <p>Previous reply content</p>
</blockquote>
`;

const EMAIL_WITH_FOLLOW_UP_CONTENT = `
<blockquote>
  <p>Inline quote that should stay</p>
</blockquote>
<p>Internal note follows</p>
<p>Regards,</p>
`;

// Real-world mixed body: an HTML reply, then RFC-style `>`-prefixed plain-text
// quote lines, and finally the original email wrapped in a Gmail blockquote.
// The current branchy implementation picks ONE strategy and misses the other.
const MIXED_PLAINTEXT_AND_HTML_QUOTE = `<p>My HTML reply</p>
<p>Thanks,</p>
<p>Sivin</p>
<br>
&gt; On Mon, Apr 6, 2026, Shruthi wrote:<br>
&gt; Inline plain-text quote line<br>
&gt; that I made<br>
<div class="gmail_quote">
  <p>The original HTML quoted email</p>
</div>`;

// Real-world body: Gmail web reply (matches the structure the Chatwoot
// fixture in components-next/message/fixtures/emailConversation.js produces).
const GMAIL_REAL_WORLD_REPLY = `<div dir="ltr"><p>Dear Sam,</p><p>Thank you for the quotation. Could you share images?</p><p>Best,<br>Alex</p></div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Wed, 4 Dec 2024 at 17:15, Sam from CottonMart &lt;<a href="mailto:sam@cottonmart.test">sam@cottonmart.test</a>&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"><p>Dear Alex,</p><p>Thank you for your inquiry.</p><p>Best regards,<br>Sam</p></blockquote></div>`;

// Outlook web/desktop: header div carries id="divRplyFwdMsg" (no quote class)
// and the original is wrapped in a bare `<blockquote>` after it.
const OUTLOOK_REAL_WORLD_REPLY = `<p>Hi team,</p><p>See attached the latest proposal.</p><p>Regards,<br>Pat</p><div id="divRplyFwdMsg" dir="ltr"><font face="Calibri,sans-serif" color="#000000"><b>From:</b> Sam &lt;sam@example.test&gt;<br><b>Sent:</b> Wednesday, December 4, 2024 5:15 PM<br><b>To:</b> Pat &lt;pat@example.test&gt;<br><b>Subject:</b> Quotation</font></div><blockquote style="border-left:1px solid #cccccc;padding-left:6px"><p>Hi Pat,</p><p>Quotation attached.</p><p>Sam</p></blockquote>`;

// Yahoo Mail: wraps the previous email in <div class="yahoo_quoted">.
const YAHOO_MAIL_REPLY = `<div>My reply text here.</div><div>Thanks,<br>Pat</div><div class="yahoo_quoted" id="yahoo_quoted_12345"><div>On Wednesday, December 4, 2024, 5:15 PM, Sam &lt;sam@example.test&gt; wrote:</div><div>Original Yahoo-quoted message body.</div></div>`;

// Thunderbird: the attribution paragraph carries class="moz-cite-prefix" and
// the original lives in <blockquote type="cite">.
const THUNDERBIRD_REPLY = `<p>My reply.</p><p>Thanks,<br>Pat</p><p class="moz-cite-prefix">On 4/12/24 17:15, Sam wrote:</p><blockquote type="cite"><p>Original Thunderbird-quoted message body.</p></blockquote>`;

// Gmail forwarded message — the body reads "---------- Forwarded message ---------"
// in plain text, with a header block beneath listing From/Date/Subject/To.
const GMAIL_FORWARDED_MESSAGE = `<div dir="ltr">FYI — see the original below.<br><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>From: <strong>Sam</strong> &lt;sam@example.test&gt;<br>Date: Wed, 4 Dec 2024 at 17:15<br>Subject: Quotation<br>To: Pat &lt;pat@example.test&gt;<br></div><br><div>Original forwarded body content.</div></div></div>`;

// Outlook plain text "----- Original Message -----" header.
const OUTLOOK_ORIGINAL_MESSAGE = `<p>Quick reply.</p><p>Thanks</p><p>-----Original Message-----<br>From: Sam &lt;sam@example.test&gt;<br>Sent: Wednesday, December 4, 2024 5:15 PM<br>To: Pat &lt;pat@example.test&gt;<br>Subject: Quotation</p><p>Original Outlook plain-style reply.</p>`;

// Inline reply: bare <blockquote> (no client class) sits in the middle, with
// content following it. Trailing-only rule should preserve the blockquote.
const INLINE_REPLY = `<p>See my responses inline below.</p><blockquote><p>Question 1: pricing?</p><p>Answer: usd 100.</p><p>Question 2: timeline?</p><p>Answer: 2 weeks.</p></blockquote><p>Let me know if any of that needs clarification.</p><p>Pat</p>`;

// Plain conversational body with no quote markers — must not be mistakenly
// stripped and must not show the toggle.
const NO_QUOTE_BODY = `<p>Just checking in — any update on this?</p><p>Thanks,<br>Pat</p>`;

// iPhone Mail / `text/plain` reply, after sanitizeTextForRender() has converted
// `\n` → `<br>` and escaped lone `< > &`.
const IPHONE_MAIL_PLAINTEXT = [
  'Test payments email<br><br>',
  'Thanks,<br>Shruthi<br><br>',
  'Sent from my iPhone<br><br>',
  '&gt; On Apr 6, 2026, at 11:26 PM, Shruthi M ',
  '&lt;shruthi.rohini.7@gmail.com&gt; wrote:<br>',
  '&gt; <br>&gt; Hi email<br>&gt; To Eli<br>',
  '&gt; Thanks,<br>&gt; Shruthi<br>',
  '&gt; <br>&gt; Sent from my iPhone',
].join('');

describe('EmailQuoteExtractor', () => {
  describe('real-world client shapes', () => {
    it('Gmail web reply — strips .gmail_quote_container with attribution + blockquote', () => {
      const cleaned = EmailQuoteExtractor.extractQuotes(GMAIL_REAL_WORLD_REPLY);
      const c = document.createElement('div');
      c.innerHTML = cleaned;
      expect(c.textContent).toContain('Dear Sam');
      expect(c.textContent).toContain('Best,');
      expect(c.textContent).not.toContain('Thank you for your inquiry');
      expect(c.textContent).not.toContain('On Wed, 4 Dec 2024');
      expect(c.querySelector('.gmail_quote')).toBeNull();
      expect(EmailQuoteExtractor.hasQuotes(GMAIL_REAL_WORLD_REPLY)).toBe(true);
    });

    it('Outlook reply — strips #divRplyFwdMsg header AND the trailing bare blockquote', () => {
      const cleaned = EmailQuoteExtractor.extractQuotes(
        OUTLOOK_REAL_WORLD_REPLY
      );
      const c = document.createElement('div');
      c.innerHTML = cleaned;
      expect(c.textContent).toContain('Hi team');
      expect(c.textContent).toContain('Regards,');
      expect(c.textContent).not.toContain('From: Sam');
      expect(c.textContent).not.toContain('Quotation attached');
      expect(c.querySelector('blockquote')).toBeNull();
      expect(c.querySelector('#divRplyFwdMsg')).toBeNull();
      expect(EmailQuoteExtractor.hasQuotes(OUTLOOK_REAL_WORLD_REPLY)).toBe(
        true
      );
    });

    it('Yahoo Mail reply — strips .yahoo_quoted wrapper', () => {
      const cleaned = EmailQuoteExtractor.extractQuotes(YAHOO_MAIL_REPLY);
      const c = document.createElement('div');
      c.innerHTML = cleaned;
      expect(c.textContent).toContain('My reply text here');
      expect(c.textContent).not.toContain('Original Yahoo-quoted message');
      expect(c.querySelector('.yahoo_quoted')).toBeNull();
      expect(EmailQuoteExtractor.hasQuotes(YAHOO_MAIL_REPLY)).toBe(true);
    });

    it('Thunderbird reply — strips .moz-cite-prefix attribution AND <blockquote type="cite">', () => {
      const cleaned = EmailQuoteExtractor.extractQuotes(THUNDERBIRD_REPLY);
      const c = document.createElement('div');
      c.innerHTML = cleaned;
      expect(c.textContent).toContain('My reply');
      expect(c.textContent).toContain('Thanks,');
      expect(c.textContent).not.toContain('On 4/12/24 17:15');
      expect(c.textContent).not.toContain(
        'Original Thunderbird-quoted message'
      );
      expect(c.querySelector('blockquote')).toBeNull();
      expect(c.querySelector('.moz-cite-prefix')).toBeNull();
      expect(EmailQuoteExtractor.hasQuotes(THUNDERBIRD_REPLY)).toBe(true);
    });

    it('Gmail forwarded message — strips "---------- Forwarded message ----------" block', () => {
      const cleaned = EmailQuoteExtractor.extractQuotes(
        GMAIL_FORWARDED_MESSAGE
      );
      const c = document.createElement('div');
      c.innerHTML = cleaned;
      expect(c.textContent).toContain('FYI — see the original below');
      expect(c.textContent).not.toContain('Forwarded message');
      expect(c.textContent).not.toContain('Original forwarded body content');
      expect(EmailQuoteExtractor.hasQuotes(GMAIL_FORWARDED_MESSAGE)).toBe(true);
    });

    it('Outlook plain-style "-----Original Message-----" header is stripped', () => {
      const cleaned = EmailQuoteExtractor.extractQuotes(
        OUTLOOK_ORIGINAL_MESSAGE
      );
      const c = document.createElement('div');
      c.innerHTML = cleaned;
      expect(c.textContent).toContain('Quick reply');
      expect(c.textContent).not.toContain('Original Message');
      expect(c.textContent).not.toContain('Original Outlook plain-style reply');
      expect(EmailQuoteExtractor.hasQuotes(OUTLOOK_ORIGINAL_MESSAGE)).toBe(
        true
      );
    });

    it('inline reply — when content follows the quoted block, the body is left intact', () => {
      const cleaned = EmailQuoteExtractor.extractQuotes(INLINE_REPLY);
      const c = document.createElement('div');
      c.innerHTML = cleaned;
      expect(c.textContent).toContain('See my responses inline below');
      expect(c.textContent).toContain('Question 1: pricing?');
      expect(c.textContent).toContain(
        'Let me know if any of that needs clarification'
      );
      expect(c.querySelector('blockquote')).not.toBeNull();
      expect(EmailQuoteExtractor.hasQuotes(INLINE_REPLY)).toBe(false);
    });

    it('plain body with no quotes — body unchanged, no toggle', () => {
      const cleaned = EmailQuoteExtractor.extractQuotes(NO_QUOTE_BODY);
      const c = document.createElement('div');
      c.innerHTML = cleaned;
      expect(c.textContent).toContain('Just checking in');
      expect(c.textContent).toContain('Thanks,');
      expect(EmailQuoteExtractor.hasQuotes(NO_QUOTE_BODY)).toBe(false);
    });

    it('empty body — no error, no toggle', () => {
      expect(() => EmailQuoteExtractor.extractQuotes('')).not.toThrow();
      expect(EmailQuoteExtractor.hasQuotes('')).toBe(false);
    });
  });

  // Regression tests — develop-baseline behaviours that earlier rewrites broke.
  describe('develop-baseline regression coverage', () => {
    it('detects header quote inside a single outer wrapper <div>', () => {
      const html =
        '<div><p>My reply.</p><p>-----Original Message-----<br>From: Sam<br>Sent: ...</p><p>Old body line 1</p></div>';
      expect(EmailQuoteExtractor.hasQuotes(html)).toBe(true);
      const cleaned = EmailQuoteExtractor.extractQuotes(html);
      expect(cleaned).toContain('My reply');
      expect(cleaned).not.toContain('Original Message');
    });

    it('detects "On … wrote:" header even when followed by un-prefixed old lines', () => {
      const html =
        '<p>On Wed, Sam wrote:</p><p>Old line 1</p><p>Old line 2</p>';
      expect(EmailQuoteExtractor.hasQuotes(html)).toBe(true);
      const cleaned = EmailQuoteExtractor.extractQuotes(html);
      expect(cleaned).not.toContain('On Wed, Sam wrote');
    });

    it('detects "From:/Sent:" header even when followed by un-prefixed old lines', () => {
      const html =
        '<p>Reply text.</p><p>From: Sam<br>Sent: Wednesday</p><p>Old line 1</p>';
      expect(EmailQuoteExtractor.hasQuotes(html)).toBe(true);
      const cleaned = EmailQuoteExtractor.extractQuotes(html);
      expect(cleaned).toContain('Reply text');
      expect(cleaned).not.toContain('From: Sam');
    });
  });

  it('strips RFC-style `>` quoted lines from a plain-text only body (iPhone Mail)', () => {
    const cleanedHtml = EmailQuoteExtractor.extractQuotes(
      IPHONE_MAIL_PLAINTEXT
    );
    const container = document.createElement('div');
    container.innerHTML = cleanedHtml;
    const text = container.textContent;

    expect(text).toContain('Test payments email');
    expect(text).toContain('Sent from my iPhone'); // signature stays
    expect(text).not.toContain('On Apr 6, 2026');
    expect(text).not.toContain('Hi email');
    expect(text).not.toContain('To Eli');
    expect(EmailQuoteExtractor.hasQuotes(IPHONE_MAIL_PLAINTEXT)).toBe(true);
  });

  it('strips both plain-text `>` lines and HTML quote blocks in the same body', () => {
    const cleanedHtml = EmailQuoteExtractor.extractQuotes(
      MIXED_PLAINTEXT_AND_HTML_QUOTE
    );
    const container = document.createElement('div');
    container.innerHTML = cleanedHtml;
    const text = container.textContent;

    // Reply portion stays
    expect(text).toContain('My HTML reply');
    expect(text).toContain('Sivin');

    // Plain-text `>` quote lines are gone
    expect(text).not.toContain('Inline plain-text quote line');
    expect(text).not.toContain('On Mon, Apr 6, 2026, Shruthi wrote');

    // HTML quote block is gone
    expect(text).not.toContain('The original HTML quoted email');
    expect(container.querySelectorAll('.gmail_quote').length).toBe(0);
  });

  it('removes blockquote-based quotes from the email body', () => {
    const cleanedHtml = EmailQuoteExtractor.extractQuotes(SAMPLE_EMAIL_HTML);

    const container = document.createElement('div');
    container.innerHTML = cleanedHtml;

    expect(container.querySelectorAll('blockquote').length).toBe(0);
    expect(container.textContent?.trim()).toBe('method');
    expect(container.textContent).not.toContain(
      'On Mon, Sep 29, 2025 at 5:18 PM'
    );
  });

  it('keeps blockquote fallback when it is not the last top-level element', () => {
    const cleanedHtml = EmailQuoteExtractor.extractQuotes(
      EMAIL_WITH_FOLLOW_UP_CONTENT
    );

    const container = document.createElement('div');
    container.innerHTML = cleanedHtml;

    expect(container.querySelector('blockquote')).not.toBeNull();
    expect(container.lastElementChild?.tagName).toBe('P');
  });

  it('detects quote indicators in nested blockquotes', () => {
    const result = EmailQuoteExtractor.hasQuotes(SAMPLE_EMAIL_HTML);
    expect(result).toBe(true);
  });

  it('does not flag blockquotes that are followed by other elements', () => {
    expect(EmailQuoteExtractor.hasQuotes(EMAIL_WITH_FOLLOW_UP_CONTENT)).toBe(
      false
    );
  });

  it('returns false when no quote indicators are present', () => {
    const html = '<p>Plain content</p>';
    expect(EmailQuoteExtractor.hasQuotes(html)).toBe(false);
  });

  it('removes trailing blockquotes while preserving trailing signatures', () => {
    const cleanedHtml = EmailQuoteExtractor.extractQuotes(EMAIL_WITH_SIGNATURE);

    expect(cleanedHtml).toContain('<p>Thanks,</p>');
    expect(cleanedHtml).toContain('<p>Jane Doe</p>');
    expect(cleanedHtml).not.toContain('<blockquote');
  });

  it('detects quotes for trailing blockquotes even when signatures follow text', () => {
    expect(EmailQuoteExtractor.hasQuotes(EMAIL_WITH_SIGNATURE)).toBe(true);
  });

  describe('HTML sanitization', () => {
    it('removes onerror handlers from img tags in extractQuotes', () => {
      const maliciousHtml = '<p>Hello</p><img src="x" onerror="alert(1)">';
      const cleanedHtml = EmailQuoteExtractor.extractQuotes(maliciousHtml);

      expect(cleanedHtml).not.toContain('onerror');
      expect(cleanedHtml).toContain('<p>Hello</p>');
    });

    it('removes onerror handlers from img tags in hasQuotes', () => {
      const maliciousHtml = '<p>Hello</p><img src="x" onerror="alert(1)">';
      // Should not throw and should safely check for quotes
      const result = EmailQuoteExtractor.hasQuotes(maliciousHtml);
      expect(result).toBe(false);
    });

    it('removes script tags in extractQuotes', () => {
      const maliciousHtml =
        '<p>Content</p><script>alert("xss")</script><p>More</p>';
      const cleanedHtml = EmailQuoteExtractor.extractQuotes(maliciousHtml);

      expect(cleanedHtml).not.toContain('<script');
      expect(cleanedHtml).not.toContain('alert');
      expect(cleanedHtml).toContain('<p>Content</p>');
      expect(cleanedHtml).toContain('<p>More</p>');
    });

    it('removes onclick handlers in extractQuotes', () => {
      const maliciousHtml = '<p onclick="alert(1)">Click me</p>';
      const cleanedHtml = EmailQuoteExtractor.extractQuotes(maliciousHtml);

      expect(cleanedHtml).not.toContain('onclick');
      expect(cleanedHtml).toContain('Click me');
    });

    it('removes javascript: URLs in extractQuotes', () => {
      const maliciousHtml = '<a href="javascript:alert(1)">Link</a>';
      const cleanedHtml = EmailQuoteExtractor.extractQuotes(maliciousHtml);

      // eslint-disable-next-line no-script-url
      expect(cleanedHtml).not.toContain('javascript:');
      expect(cleanedHtml).toContain('Link');
    });

    it('removes encoded payloads with event handlers in extractQuotes', () => {
      const maliciousHtml =
        '<img src="x" id="PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" onerror="eval(atob(this.id))">';
      const cleanedHtml = EmailQuoteExtractor.extractQuotes(maliciousHtml);

      expect(cleanedHtml).not.toContain('onerror');
      expect(cleanedHtml).not.toContain('eval');
    });
  });
});
