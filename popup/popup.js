function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => resolve(resp));
  });
}

function isInjectable(url) {
  if (!url) return false;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:')) return false;
  if (url.startsWith('https://chrome.google.com/webstore') || url.startsWith('https://chromewebstore.google.com')) return false;
  return true;
}

function isPdf(url) {
  if (!url) return false;
  if (url.endsWith('.pdf') || url.includes('.pdf?')) return true;
  return false;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const list = document.getElementById('list');
  const urlEl = document.getElementById('url');
  const openPdfBtn = document.getElementById('open-pdf');

  if (!tab) {
    list.innerHTML = '<div class="empty">No active tab.</div>';
    return;
  }

  if (!isInjectable(tab.url)) {
    urlEl.textContent = tab.url || '';
    list.innerHTML = '<div class="empty">Highlights aren\'t supported on this kind of page.</div>';
    if (isPdf(tab.url)) {
      openPdfBtn.hidden = false;
      openPdfBtn.addEventListener('click', async () => {
        await send({ type: 'open-pdf-viewer', url: tab.url });
        window.close();
      });
    }
    return;
  }

  if (isPdf(tab.url)) {
    openPdfBtn.hidden = false;
    openPdfBtn.addEventListener('click', async () => {
      await send({ type: 'open-pdf-viewer', url: tab.url });
      window.close();
    });
  }

  const resp = await send({ type: 'get-annotations', url: tab.url });
  urlEl.textContent = resp.url;

  const usage = await send({ type: 'storage-usage' });
  if (usage && usage.bytes / usage.quota > 0.8) {
    const warn = document.createElement('div');
    warn.className = 'warn';
    warn.textContent = `Storage at ${Math.round(usage.bytes / usage.quota * 100)}% of quota.`;
    document.getElementById('header').after(warn);
  }
  document.getElementById('quota').textContent = `${resp.annotations.length} annotation${resp.annotations.length === 1 ? '' : 's'}`;

  if (!resp.annotations.length) {
    list.innerHTML = '<div class="empty">No annotations on this page yet.</div>';
    return;
  }

  const sorted = [...resp.annotations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  sorted.forEach((a) => {
    const row = document.createElement('div');
    row.className = 'entry';

    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.backgroundColor = a.color || '#94A3B8';
    row.appendChild(sw);

    const body = document.createElement('div');
    body.className = 'body';
    const q = document.createElement('div');
    q.className = 'quote';
    q.textContent = a.anchor.quote;
    q.title = a.anchor.quote;
    body.appendChild(q);
    if (a.comment && a.comment.text) {
      const c = document.createElement('div');
      c.className = 'cmt';
      c.textContent = a.comment.text;
      c.title = a.comment.text;
      body.appendChild(c);
    }
    row.appendChild(body);

    row.addEventListener('click', async () => {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'scroll-to', id: a.id });
      } catch (e) {}
      window.close();
    });
    list.appendChild(row);
  });
}

init();
