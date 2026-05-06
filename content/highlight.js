(function () {
  const ns = (window.__hlx = window.__hlx || {});

  const COLORS = [
    { name: 'Lemon', hex: '#FFF59D' },
    { name: 'Honey', hex: '#FFE082' },
    { name: 'Apricot', hex: '#FFCC80' },
    { name: 'Coral', hex: '#FFAB91' },
    { name: 'Rose', hex: '#F8BBD0' },
    { name: 'Lavender', hex: '#E1BEE7' },
    { name: 'Periwinkle', hex: '#C5CAE9' },
    { name: 'Sky', hex: '#B3E5FC' },
    { name: 'Aqua', hex: '#B2EBF2' },
    { name: 'Mint', hex: '#B2DFDB' },
    { name: 'Sage', hex: '#C8E6C9' },
    { name: 'Lime', hex: '#DCEDC8' },
    { name: 'Black', hex: '#000000' }
  ];
  const SLATE = '#94A3B8';

  function isDarkSwatchColor(hex) {
    if (!hex) return false;
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return false;
    const v = parseInt(m[1], 16);
    const r = (v >> 16) & 0xff;
    const g = (v >> 8) & 0xff;
    const b = v & 0xff;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance < 0.25;
  }

  function getTextNodesInRange(range) {
    const nodes = [];
    const root = range.commonAncestorContainer;
    const walker = document.createTreeWalker(
      root.nodeType === 1 ? root : root.parentElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(n) {
          if (!n.nodeValue || !n.nodeValue.length) return NodeFilter.FILTER_REJECT;
          const r = document.createRange();
          r.selectNodeContents(n);
          if (range.compareBoundaryPoints(Range.END_TO_START, r) >= 0) return NodeFilter.FILTER_REJECT;
          if (range.compareBoundaryPoints(Range.START_TO_END, r) <= 0) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function isInsideHighlight(node) {
    let el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el !== document.body) {
      if (el.classList && (el.classList.contains('hlx-highlight') || el.classList.contains('hlx-underline'))) return el;
      el = el.parentElement;
    }
    return null;
  }

  function wrapRange(range, id, kind, color) {
    const className = kind === 'comment-only' ? 'hlx-underline' : 'hlx-highlight';
    const textNodes = getTextNodesInRange(range);
    const spans = [];
    textNodes.forEach((tn) => {
      const isStart = tn === range.startContainer;
      const isEnd = tn === range.endContainer;
      const start = isStart ? range.startOffset : 0;
      const end = isEnd ? range.endOffset : tn.nodeValue.length;
      if (start === end) return;
      let target = tn;
      if (start > 0) target = target.splitText(start);
      if (end - start < target.nodeValue.length) target.splitText(end - start);
      const span = document.createElement('span');
      span.className = className;
      span.dataset.hlxId = id;
      if (kind === 'comment-only') {
        span.style.borderBottom = `2px solid ${SLATE}`;
      } else {
        span.style.backgroundColor = color;
      }
      target.parentNode.replaceChild(span, target);
      span.appendChild(target);
      spans.push(span);
    });
    return spans;
  }

  function unwrapHighlight(id) {
    const spans = document.querySelectorAll(`[data-hlx-id="${CSS.escape(id)}"]`);
    spans.forEach((span) => {
      if (span.classList && (span.classList.contains('hlx-highlight') || span.classList.contains('hlx-underline'))) {
        const parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
        parent.normalize();
      }
    });
    const chip = document.querySelector(`.hlx-chip[data-hlx-id="${CSS.escape(id)}"]`);
    if (chip) chip.remove();
    const cmt = document.querySelector(`.hlx-comment-icon[data-hlx-id="${CSS.escape(id)}"]`);
    if (cmt) cmt.remove();
  }

  function recolor(id, color) {
    const spans = document.querySelectorAll(`.hlx-highlight[data-hlx-id="${CSS.escape(id)}"]`);
    spans.forEach((s) => { s.style.backgroundColor = color; });
    const chip = document.querySelector(`.hlx-chip[data-hlx-id="${CSS.escape(id)}"]`);
    if (chip) chip.style.backgroundColor = color;
    const cmt = document.querySelector(`.hlx-comment-icon[data-hlx-id="${CSS.escape(id)}"]`);
    if (cmt && !cmt.classList.contains('hlx-comment-icon-slate')) {
      cmt.style.backgroundColor = color;
    }
  }

  function makeChip(id, color, anchorEl) {
    const existing = document.querySelector(`.hlx-chip[data-hlx-id="${CSS.escape(id)}"]`);
    if (existing) existing.remove();
    const chip = document.createElement('span');
    chip.className = 'hlx-chip';
    chip.dataset.hlxId = id;
    chip.style.backgroundColor = color;
    chip.title = 'Click to recolor or delete';
    anchorEl.parentNode.insertBefore(chip, anchorEl.nextSibling);
    return chip;
  }

  function showColorPopover(targetEl, currentColor, opts) {
    closeColorPopover();
    const pop = document.createElement('div');
    pop.className = 'hlx-color-popover';
    const grid = document.createElement('div');
    grid.className = 'hlx-color-grid';
    COLORS.forEach((c) => {
      const sw = document.createElement('button');
      sw.className = 'hlx-swatch';
      sw.style.backgroundColor = c.hex;
      sw.title = c.name;
      sw.setAttribute('aria-label', c.name);
      if (isDarkSwatchColor(c.hex)) sw.classList.add('hlx-swatch-dark');
      if (c.hex.toLowerCase() === (currentColor || '').toLowerCase()) sw.classList.add('hlx-swatch-active');
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onPick(c.hex);
        closeColorPopover();
      });
      grid.appendChild(sw);
    });
    pop.appendChild(grid);
    if (opts.allowDelete) {
      const del = document.createElement('button');
      del.className = 'hlx-color-delete';
      del.textContent = 'Delete';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onDelete && opts.onDelete();
        closeColorPopover();
      });
      pop.appendChild(del);
    }
    document.body.appendChild(pop);
    positionPopover(pop, targetEl);

    let dismissTimer = null;
    const armDismiss = () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      dismissTimer = setTimeout(closeColorPopover, 3000);
    };
    pop.addEventListener('mouseenter', () => { if (dismissTimer) clearTimeout(dismissTimer); });
    pop.addEventListener('mouseleave', armDismiss);
    armDismiss();

    setTimeout(() => {
      document.addEventListener('mousedown', outsideHandler, { once: false });
    }, 0);
    function outsideHandler(e) {
      if (!pop.contains(e.target) && e.target !== targetEl) {
        closeColorPopover();
        document.removeEventListener('mousedown', outsideHandler);
      }
    }
    pop.__hlxOutsideHandler = outsideHandler;
    return pop;
  }

  function positionPopover(pop, targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    let top = window.scrollY + rect.bottom + 6;
    let left = window.scrollX + rect.left;
    if (rect.bottom + ph + 12 > window.innerHeight) top = window.scrollY + rect.top - ph - 6;
    if (rect.left + pw + 12 > window.innerWidth) left = window.scrollX + rect.right - pw;
    if (left < window.scrollX + 4) left = window.scrollX + 4;
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }

  function closeColorPopover() {
    document.querySelectorAll('.hlx-color-popover').forEach((p) => {
      if (p.__hlxOutsideHandler) document.removeEventListener('mousedown', p.__hlxOutsideHandler);
      p.remove();
    });
  }

  function pulse(id) {
    const spans = document.querySelectorAll(`[data-hlx-id="${CSS.escape(id)}"]`);
    spans.forEach((s) => {
      s.classList.remove('hlx-pulse');
      void s.offsetWidth;
      s.classList.add('hlx-pulse');
      setTimeout(() => s.classList.remove('hlx-pulse'), 700);
    });
  }

  ns.highlight = {
    COLORS,
    SLATE,
    isDarkSwatchColor,
    wrapRange,
    unwrapHighlight,
    recolor,
    makeChip,
    showColorPopover,
    closeColorPopover,
    isInsideHighlight,
    pulse
  };
})();
