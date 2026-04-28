(function () {
  const ns = (window.__hlx = window.__hlx || {});

  const FINGERPRINT_LEN = 32;

  function isElementStable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id && /^[A-Za-z][\w\-:.]*$/.test(el.id)) return true;
    return false;
  }

  function buildSelector(node) {
    if (!node) return null;
    let el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      if (isElementStable(cur)) {
        parts.unshift('#' + CSS.escape(cur.id));
        return parts.join(' > ');
      }
      const tag = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const sibs = [...parent.children].filter(c => c.tagName === cur.tagName);
      if (sibs.length === 1) {
        parts.unshift(tag);
      } else {
        const idx = sibs.indexOf(cur) + 1;
        parts.unshift(`${tag}:nth-of-type(${idx})`);
      }
      cur = parent;
    }
    return parts.join(' > ');
  }

  function textOffsetWithin(root, node, nodeOffset) {
    let count = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n === node) return count + nodeOffset;
      count += n.nodeValue.length;
    }
    return -1;
  }

  function locateAtOffset(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    let count = 0;
    while ((n = walker.nextNode())) {
      const len = n.nodeValue.length;
      if (offset <= count + len) {
        return { node: n, offset: offset - count };
      }
      count += len;
    }
    return null;
  }

  function serialize(range) {
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    const startEl = startNode.nodeType === 1 ? startNode : startNode.parentElement;
    const endEl = endNode.nodeType === 1 ? endNode : endNode.parentElement;
    if (!startEl || !endEl) return null;

    let common = range.commonAncestorContainer;
    if (common.nodeType !== 1) common = common.parentElement;
    let stable = common;
    while (stable && stable !== document.body && !isElementStable(stable)) {
      stable = stable.parentElement;
    }
    if (!stable) stable = document.body;

    const selector = buildSelector(stable);
    const startOffset = textOffsetWithin(stable, startNode, range.startOffset);
    const endOffset = textOffsetWithin(stable, endNode, range.endOffset);
    const quote = range.toString();

    const fullText = stable.textContent || '';
    const prefix = fullText.slice(Math.max(0, startOffset - FINGERPRINT_LEN), startOffset);
    const suffix = fullText.slice(endOffset, endOffset + FINGERPRINT_LEN);

    return { selector, startOffset, endOffset, quote, prefix, suffix };
  }

  function deserializeBySelector(anchor) {
    if (!anchor.selector) return null;
    let root;
    try { root = document.querySelector(anchor.selector); } catch (e) { return null; }
    if (!root) return null;
    const start = locateAtOffset(root, anchor.startOffset);
    const end = locateAtOffset(root, anchor.endOffset);
    if (!start || !end) return null;
    try {
      const r = document.createRange();
      r.setStart(start.node, start.offset);
      r.setEnd(end.node, end.offset);
      if (r.toString() === anchor.quote) return r;
      return r;
    } catch (e) {
      return null;
    }
  }

  function deserializeByFingerprint(anchor) {
    const text = document.body.textContent || '';
    const needle = (anchor.prefix || '') + anchor.quote + (anchor.suffix || '');
    let idx = text.indexOf(needle);
    let quoteStart;
    if (idx >= 0) {
      quoteStart = idx + (anchor.prefix || '').length;
    } else {
      idx = text.indexOf(anchor.quote);
      if (idx < 0) return null;
      quoteStart = idx;
    }
    const quoteEnd = quoteStart + anchor.quote.length;
    const start = locateAtOffset(document.body, quoteStart);
    const end = locateAtOffset(document.body, quoteEnd);
    if (!start || !end) return null;
    try {
      const r = document.createRange();
      r.setStart(start.node, start.offset);
      r.setEnd(end.node, end.offset);
      return r;
    } catch (e) {
      return null;
    }
  }

  function deserialize(anchor) {
    return deserializeBySelector(anchor) || deserializeByFingerprint(anchor);
  }

  function ulid() {
    const enc = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let now = Date.now();
    let time = '';
    for (let i = 9; i >= 0; i--) {
      time = enc[now % 32] + time;
      now = Math.floor(now / 32);
    }
    let rnd = '';
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 16; i++) rnd += enc[buf[i] % 32];
    return time + rnd;
  }

  ns.anchoring = { serialize, deserialize, ulid, locateAtOffset, buildSelector };
})();
