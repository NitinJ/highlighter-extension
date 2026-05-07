(function () {
  const ns = window.__hlx;
  if (!ns) return;

  const state = {
    annotations: [],
    orphans: [],
    settings: { lastUsedColor: '#FFF59D' },
    pendingReattach: null
  };

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => resolve(resp));
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function loadAndRestore() {
    const resp = await send({ type: 'get-annotations', url: location.href });
    if (!resp) return;
    state.annotations = resp.annotations || [];
    state.settings = resp.settings || state.settings;
    restoreAll();
  }

  function restoreAll() {
    state.orphans = [];
    state.annotations.forEach((a) => {
      const existing = document.querySelector(`[data-hlx-id="${CSS.escape(a.id)}"]`);
      if (existing) return;
      const range = ns.anchoring.deserialize(a.anchor);
      if (range) {
        renderAnnotation(a, range);
      } else {
        state.orphans.push(a);
      }
    });
    refreshOrphanBadge();
  }

  function restoreOrphansOnly() {
    if (!state.orphans.length) return;
    const stillOrphans = [];
    state.orphans.forEach((a) => {
      const existing = document.querySelector(`[data-hlx-id="${CSS.escape(a.id)}"]`);
      if (existing) return;
      const range = ns.anchoring.deserialize(a.anchor);
      if (range) renderAnnotation(a, range);
      else stillOrphans.push(a);
    });
    state.orphans = stillOrphans;
    refreshOrphanBadge();
  }

  function refreshOrphanBadge() {
    ns.orphanBadge.render(state.orphans, {
      onReattach: (a) => {
        state.pendingReattach = a;
        document.body.style.cursor = 'crosshair';
      },
      onDelete: async (a) => {
        await send({ type: 'delete-annotation', id: a.id, url: location.href });
        state.annotations = state.annotations.filter(x => x.id !== a.id);
        state.orphans = state.orphans.filter(x => x.id !== a.id);
        refreshOrphanBadge();
      }
    });
  }

  function renderAnnotation(a, range) {
    const spans = ns.highlight.wrapRange(range, a.id, a.kind, a.color);
    if (!spans.length) return;
    const last = spans[spans.length - 1];
    last.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onAnnotationClick(a);
    });
    if (a.comment) {
      const icon = ns.comment.makeIcon(a, last);
      icon.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openComment(a);
      });
    }
  }

  function onAnnotationClick(a) {
    const span = document.querySelector(`.hlx-highlight[data-hlx-id="${CSS.escape(a.id)}"]`);
    if (!span) return;
    ns.highlight.showColorPopover(span, a.color, {
      allowDelete: true,
      onPick: async (color) => {
        a.color = color;
        a.updatedAt = Date.now();
        ns.highlight.recolor(a.id, color);
        await persist(a);
        await updateLastColor(color);
      },
      onDelete: async () => {
        await deleteAnnotation(a);
      },
      onComment: () => openComment(a),
      commentLabel: a.comment ? 'Edit comment' : 'Add comment'
    });
  }

  function openComment(a) {
    let icon = document.querySelector(`.hlx-comment-icon[data-hlx-id="${CSS.escape(a.id)}"]`);
    if (!icon) {
      const last = [...document.querySelectorAll(`[data-hlx-id="${CSS.escape(a.id)}"]`)].filter(e => e.classList.contains('hlx-highlight') || e.classList.contains('hlx-underline')).pop();
      if (last) icon = ns.comment.makeIcon(a, last);
    }
    if (!icon) return;
    ns.comment.showBubble(a, icon, {
      onSave: async (text) => {
        const now = Date.now();
        a.comment = { text, createdAt: a.comment ? a.comment.createdAt : now, updatedAt: now };
        a.updatedAt = now;
        await persist(a);
      },
      onDelete: async () => {
        if (a.kind === 'comment-only') {
          await deleteAnnotation(a);
        } else {
          delete a.comment;
          a.updatedAt = Date.now();
          const cmt = document.querySelector(`.hlx-comment-icon[data-hlx-id="${CSS.escape(a.id)}"]`);
          if (cmt) cmt.remove();
          await persist(a);
        }
      },
      onCancelNew: async () => {
        if (!a.comment) {
          if (a.kind === 'comment-only') await deleteAnnotation(a);
          else {
            const cmt = document.querySelector(`.hlx-comment-icon[data-hlx-id="${CSS.escape(a.id)}"]`);
            if (cmt) cmt.remove();
          }
        }
      }
    });
  }

  async function persist(a) {
    const idx = state.annotations.findIndex(x => x.id === a.id);
    if (idx >= 0) state.annotations[idx] = a;
    else state.annotations.push(a);
    await send({ type: 'save-annotation', annotation: a, url: location.href });
  }

  async function deleteAnnotation(a) {
    ns.highlight.unwrapHighlight(a.id);
    state.annotations = state.annotations.filter(x => x.id !== a.id);
    state.orphans = state.orphans.filter(x => x.id !== a.id);
    refreshOrphanBadge();
    await send({ type: 'delete-annotation', id: a.id, url: location.href });
  }

  async function updateLastColor(color) {
    state.settings.lastUsedColor = color;
    await send({ type: 'update-settings', settings: { lastUsedColor: color } });
  }

  function findOverlapping(range) {
    const found = new Set();
    const walker = document.createTreeWalker(range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (!el.dataset || !el.dataset.hlxId) return NodeFilter.FILTER_SKIP;
        if (!el.classList.contains('hlx-highlight')) return NodeFilter.FILTER_SKIP;
        const r = document.createRange();
        r.selectNodeContents(el);
        if (range.compareBoundaryPoints(Range.END_TO_START, r) >= 0) return NodeFilter.FILTER_SKIP;
        if (range.compareBoundaryPoints(Range.START_TO_END, r) <= 0) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) found.add(n.dataset.hlxId);
    return [...found];
  }

  async function createHighlight(range, color) {
    if (range.collapsed) return null;
    const overlappingIds = findOverlapping(range);
    for (const id of overlappingIds) {
      const ann = state.annotations.find(a => a.id === id);
      if (ann && ann.kind === 'highlight' && !ann.comment) {
        await deleteAnnotation(ann);
      }
    }
    const anchor = ns.anchoring.serialize(range);
    if (!anchor || !anchor.quote) return null;
    const now = Date.now();
    const a = {
      id: ns.anchoring.ulid(),
      createdAt: now,
      updatedAt: now,
      kind: 'highlight',
      color,
      anchor
    };
    const newRange = ns.anchoring.deserialize(anchor);
    const useRange = newRange || range;
    const spans = ns.highlight.wrapRange(useRange, a.id, 'highlight', color);
    if (!spans.length) return null;
    const last = spans[spans.length - 1];
    last.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onAnnotationClick(a);
    });
    state.annotations.push(a);
    await send({ type: 'save-annotation', annotation: a, url: location.href });
    await updateLastColor(color);
    const chip = ns.highlight.makeChip(a.id, color, last);
    chip.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ns.highlight.showColorPopover(chip, a.color, {
        allowDelete: true,
        onPick: async (c) => {
          a.color = c;
          a.updatedAt = Date.now();
          ns.highlight.recolor(a.id, c);
          await persist(a);
          await updateLastColor(c);
        },
        onDelete: async () => { await deleteAnnotation(a); }
      });
    });
    setTimeout(() => { if (chip && chip.parentNode) chip.remove(); }, 5000);
    return a;
  }

  async function createCommentOnly(range) {
    if (range.collapsed) return null;
    const anchor = ns.anchoring.serialize(range);
    if (!anchor || !anchor.quote) return null;

    const overlappingIds = findOverlapping(range);
    let existingAnn = null;
    for (const id of overlappingIds) {
      const ann = state.annotations.find(a => a.id === id);
      if (ann && ann.kind === 'highlight') { existingAnn = ann; break; }
    }
    if (existingAnn) {
      const last = [...document.querySelectorAll(`[data-hlx-id="${CSS.escape(existingAnn.id)}"]`)].filter(e => e.classList.contains('hlx-highlight') || e.classList.contains('hlx-underline')).pop();
      if (last) {
        const icon = ns.comment.makeIcon(existingAnn, last);
        icon.addEventListener('click', (ev) => { ev.stopPropagation(); openComment(existingAnn); });
        openComment(existingAnn);
      }
      return existingAnn;
    }

    const now = Date.now();
    const a = {
      id: ns.anchoring.ulid(),
      createdAt: now,
      updatedAt: now,
      kind: 'comment-only',
      color: null,
      anchor
    };
    const newRange = ns.anchoring.deserialize(anchor);
    const useRange = newRange || range;
    const spans = ns.highlight.wrapRange(useRange, a.id, 'comment-only', null);
    if (!spans.length) return null;
    const last = spans[spans.length - 1];
    last.addEventListener('click', (ev) => { ev.stopPropagation(); openComment(a); });
    const icon = ns.comment.makeIcon(a, last);
    icon.addEventListener('click', (ev) => { ev.stopPropagation(); openComment(a); });
    state.annotations.push(a);
    await send({ type: 'save-annotation', annotation: a, url: location.href });
    openComment(a);
    return a;
  }

  function getCurrentRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    if (r.collapsed) return null;
    return r;
  }

  document.addEventListener('mouseup', (e) => {
    setTimeout(() => {
      const r = getCurrentRange();
      if (!r) { ns.toolbar.close(); return; }
      ns.toolbar.show(r, {
        onColor: async (color, range) => {
          await createHighlight(range, color);
          window.getSelection().removeAllRanges();
        },
        onComment: async (range) => {
          await createCommentOnly(range);
          window.getSelection().removeAllRanges();
        }
      });
    }, 0);
  });

  document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      ns.toolbar.close();
      ns.highlight.closeColorPopover();
      ns.comment.closeBubble();
      return;
    }
    if (e.altKey && (e.key === 'h' || e.key === 'H')) {
      const r = getCurrentRange();
      if (r) {
        e.preventDefault();
        await createHighlight(r, state.settings.lastUsedColor);
        window.getSelection().removeAllRanges();
        ns.toolbar.close();
      }
    } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
      const r = getCurrentRange();
      if (r) {
        e.preventDefault();
        const overlap = findOverlapping(r);
        if (overlap.length) {
          const ann = state.annotations.find(a => a.id === overlap[0]);
          if (ann) {
            const last = [...document.querySelectorAll(`[data-hlx-id="${CSS.escape(ann.id)}"]`)].filter(el => el.classList.contains('hlx-highlight') || el.classList.contains('hlx-underline')).pop();
            if (last) {
              const icon = ns.comment.makeIcon(ann, last);
              icon.addEventListener('click', (ev) => { ev.stopPropagation(); openComment(ann); });
              openComment(ann);
            }
          }
        } else {
          await createCommentOnly(r);
        }
        window.getSelection().removeAllRanges();
        ns.toolbar.close();
      }
    }
  });

  document.addEventListener('click', async (e) => {
    if (state.pendingReattach) {
      const a = state.pendingReattach;
      state.pendingReattach = null;
      document.body.style.cursor = '';
      const sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.getRangeAt(0).collapsed) {
        const r = sel.getRangeAt(0);
        const newAnchor = ns.anchoring.serialize(r);
        if (newAnchor && newAnchor.quote) {
          a.anchor = newAnchor;
          a.updatedAt = Date.now();
          await persist(a);
          state.orphans = state.orphans.filter(x => x.id !== a.id);
          renderAnnotation(a, r);
          refreshOrphanBadge();
        }
        window.getSelection().removeAllRanges();
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      if (msg.type === 'cmd-highlight') {
        const r = getCurrentRange();
        if (r) {
          await createHighlight(r, state.settings.lastUsedColor);
          window.getSelection().removeAllRanges();
        }
        sendResponse({ ok: true });
      } else if (msg.type === 'cmd-comment') {
        const r = getCurrentRange();
        if (r) {
          const overlap = findOverlapping(r);
          if (overlap.length) {
            const ann = state.annotations.find(a => a.id === overlap[0]);
            if (ann) openComment(ann);
          } else {
            await createCommentOnly(r);
          }
          window.getSelection().removeAllRanges();
        }
        sendResponse({ ok: true });
      } else if (msg.type === 'scroll-to') {
        const span = document.querySelector(`[data-hlx-id="${CSS.escape(msg.id)}"]`);
        if (span) {
          span.scrollIntoView({ behavior: 'smooth', block: 'center' });
          ns.highlight.pulse(msg.id);
        }
        sendResponse({ ok: true });
      } else if (msg.type === 'reload-annotations') {
        await loadAndRestore();
        sendResponse({ ok: true });
      }
    })();
    return true;
  });

  let mutTimer = null;
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (mutTimer) clearTimeout(mutTimer);
    mutTimer = setTimeout(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        document.querySelectorAll('.hlx-highlight, .hlx-underline, .hlx-chip, .hlx-comment-icon').forEach(el => {
          if (el.classList.contains('hlx-highlight') || el.classList.contains('hlx-underline')) {
            const p = el.parentNode;
            while (el.firstChild) p.insertBefore(el.firstChild, el);
            p.removeChild(el);
          } else {
            el.remove();
          }
        });
        loadAndRestore();
      } else {
        restoreOrphansOnly();
      }
    }, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  loadAndRestore();
})();
