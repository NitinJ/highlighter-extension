// PDF.js version: 4.7.76 (vendored from https://github.com/mozilla/pdf.js/releases/tag/v4.7.76)
import * as pdfjsLib from './pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf-viewer/pdf.worker.min.mjs');

const COLORS = [
  '#FFF59D','#FFE082','#FFCC80','#FFAB91','#F8BBD0','#E1BEE7',
  '#C5CAE9','#B3E5FC','#B2EBF2','#B2DFDB','#C8E6C9','#DCEDC8','#000000'
];
const SLATE = '#94A3B8';

const params = new URLSearchParams(location.search);
const fileUrl = params.get('file');
document.getElementById('meta').textContent = fileUrl || '';

const state = {
  url: fileUrl,
  annotations: [],
  orphans: [],
  settings: { lastUsedColor: '#FFF59D' },
  pages: []
};

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => resolve(resp));
  });
}

function ulid() {
  const enc = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let now = Date.now();
  let time = '';
  for (let i = 9; i >= 0; i--) { time = enc[now % 32] + time; now = Math.floor(now / 32); }
  let rnd = '';
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 16; i++) rnd += enc[buf[i] % 32];
  return time + rnd;
}

async function loadAnnotations() {
  const resp = await send({ type: 'get-annotations', url: fileUrl });
  if (!resp) return;
  state.annotations = resp.annotations || [];
  state.settings = resp.settings || state.settings;
}

async function renderPdf() {
  if (!fileUrl) return;
  const loadingTask = pdfjsLib.getDocument({ url: fileUrl });
  const pdf = await loadingTask.promise;
  const container = document.getElementById('pages');
  container.innerHTML = '';

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.5 });

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page';
    wrapper.dataset.page = String(p);
    wrapper.style.width = viewport.width + 'px';
    wrapper.style.height = viewport.height + 'px';

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrapper.appendChild(canvas);

    const textLayer = document.createElement('div');
    textLayer.className = 'pdf-text-layer';
    textLayer.style.width = viewport.width + 'px';
    textLayer.style.height = viewport.height + 'px';
    wrapper.appendChild(textLayer);

    container.appendChild(wrapper);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const textContent = await page.getTextContent();
    await renderTextLayer(textContent, textLayer, viewport);

    state.pages.push({ pageNumber: p, root: wrapper, textLayer, viewport });
  }
  restoreAll();
}

async function renderTextLayer(textContent, container, viewport) {
  const items = textContent.items;
  for (const item of items) {
    if (!item.str) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontSize = Math.hypot(tx[2], tx[3]);
    const angle = Math.atan2(tx[1], tx[0]);
    const span = document.createElement('span');
    span.textContent = item.str;
    span.style.fontSize = fontSize + 'px';
    span.style.fontFamily = item.fontName || 'sans-serif';
    span.style.left = tx[4] + 'px';
    span.style.top = (tx[5] - fontSize) + 'px';
    if (angle !== 0) span.style.transform = `rotate(${angle}rad)`;
    container.appendChild(span);
    if (item.hasEOL) container.appendChild(document.createElement('br'));
  }
}

function pageOfNode(node) {
  let el = node.nodeType === 1 ? node : node.parentElement;
  while (el && el !== document.body) {
    if (el.classList && el.classList.contains('pdf-page')) return parseInt(el.dataset.page, 10);
    el = el.parentElement;
  }
  return null;
}

function locateAtOffset(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n; let count = 0;
  while ((n = walker.nextNode())) {
    const len = n.nodeValue.length;
    if (offset <= count + len) return { node: n, offset: offset - count };
    count += len;
  }
  return null;
}

function serializePdfRange(range) {
  const pageNum = pageOfNode(range.startContainer);
  const endPage = pageOfNode(range.endContainer);
  if (!pageNum || pageNum !== endPage) return null;
  const pageState = state.pages.find(p => p.pageNumber === pageNum);
  if (!pageState) return null;
  const root = pageState.textLayer;
  const text = root.textContent || '';
  const startOffset = textOffsetWithin(root, range.startContainer, range.startOffset);
  const endOffset = textOffsetWithin(root, range.endContainer, range.endOffset);
  const quote = range.toString();
  const prefix = text.slice(Math.max(0, startOffset - 32), startOffset);
  const suffix = text.slice(endOffset, endOffset + 32);
  return { pageNumber: pageNum, startOffset, endOffset, quote, prefix, suffix };
}

function textOffsetWithin(root, node, off) {
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n === node) return count + off;
    count += n.nodeValue.length;
  }
  return -1;
}

function deserializePdfAnchor(anchor) {
  const pageState = state.pages.find(p => p.pageNumber === anchor.pageNumber);
  if (!pageState) return null;
  const root = pageState.textLayer;
  const fullText = root.textContent || '';
  const needle = (anchor.prefix || '') + anchor.quote + (anchor.suffix || '');
  let idx = fullText.indexOf(needle);
  let qStart;
  if (idx >= 0) qStart = idx + (anchor.prefix || '').length;
  else {
    idx = fullText.indexOf(anchor.quote);
    if (idx < 0) return null;
    qStart = idx;
  }
  const qEnd = qStart + anchor.quote.length;
  const start = locateAtOffset(root, qStart);
  const end = locateAtOffset(root, qEnd);
  if (!start || !end) return null;
  try {
    const r = document.createRange();
    r.setStart(start.node, start.offset);
    r.setEnd(end.node, end.offset);
    return r;
  } catch (e) { return null; }
}

function getTextNodesInRange(range) {
  const nodes = [];
  const root = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue.length) return NodeFilter.FILTER_REJECT;
      const r = document.createRange();
      r.selectNodeContents(n);
      if (range.compareBoundaryPoints(Range.END_TO_START, r) >= 0) return NodeFilter.FILTER_REJECT;
      if (range.compareBoundaryPoints(Range.START_TO_END, r) <= 0) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n; while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
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
      span.style.color = color;
    }
    target.parentNode.replaceChild(span, target);
    span.appendChild(target);
    spans.push(span);
  });
  return spans;
}

function restoreAll() {
  state.orphans = [];
  state.annotations.forEach((a) => {
    const range = deserializePdfAnchor(a.anchor);
    if (range) {
      wrapRange(range, a.id, a.kind, a.color);
    } else {
      state.orphans.push(a);
    }
  });
}

function getCurrentRange() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (r.collapsed) return null;
  return r;
}

async function createHighlight(range, color) {
  const anchor = serializePdfRange(range);
  if (!anchor || !anchor.quote) return;
  const now = Date.now();
  const a = { id: ulid(), createdAt: now, updatedAt: now, kind: 'highlight', color, anchor };
  wrapRange(range, a.id, 'highlight', color);
  state.annotations.push(a);
  await send({ type: 'save-annotation', annotation: a, url: fileUrl });
  state.settings.lastUsedColor = color;
  await send({ type: 'update-settings', settings: { lastUsedColor: color } });
  window.getSelection().removeAllRanges();
}

async function createCommentOnly(range) {
  const anchor = serializePdfRange(range);
  if (!anchor || !anchor.quote) return;
  const now = Date.now();
  const a = { id: ulid(), createdAt: now, updatedAt: now, kind: 'comment-only', color: null, anchor, comment: { text: '', createdAt: now, updatedAt: now } };
  wrapRange(range, a.id, 'comment-only', null);
  state.annotations.push(a);
  await send({ type: 'save-annotation', annotation: a, url: fileUrl });
  window.getSelection().removeAllRanges();
}

document.addEventListener('keydown', async (e) => {
  if (e.altKey && (e.key === 'h' || e.key === 'H')) {
    const r = getCurrentRange();
    if (r) { e.preventDefault(); await createHighlight(r, state.settings.lastUsedColor); }
  } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
    const r = getCurrentRange();
    if (r) { e.preventDefault(); await createCommentOnly(r); }
  }
});

(async () => {
  await loadAnnotations();
  await renderPdf();
})();
