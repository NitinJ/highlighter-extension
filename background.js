const STORAGE_KEY = 'hlx';

async function readStore() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || { annotations: {}, settings: { lastUsedColor: '#FFF59D' } };
}

async function writeStore(store) {
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}

function canonicalize(url) {
  try {
    const u = new URL(url);
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const search = params.length ? '?' + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
    return u.origin + u.pathname + search;
  } catch (e) {
    return url;
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  const type = command === 'highlight-selection' ? 'cmd-highlight' : command === 'comment-selection' ? 'cmd-comment' : null;
  if (!type) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type });
  } catch (e) {}
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === 'get-annotations') {
      const store = await readStore();
      const url = msg.url || (sender.tab && sender.tab.url);
      const key = canonicalize(url);
      sendResponse({
        url: key,
        annotations: store.annotations[key] || [],
        settings: store.settings
      });
    } else if (msg.type === 'save-annotation') {
      const store = await readStore();
      const key = msg.url ? canonicalize(msg.url) : canonicalize(sender.tab.url);
      const list = store.annotations[key] || [];
      const idx = list.findIndex(a => a.id === msg.annotation.id);
      if (idx >= 0) {
        if ((msg.annotation.updatedAt || 0) >= (list[idx].updatedAt || 0)) {
          list[idx] = msg.annotation;
        }
      } else {
        list.push(msg.annotation);
      }
      store.annotations[key] = list;
      await writeStore(store);
      sendResponse({ ok: true });
    } else if (msg.type === 'delete-annotation') {
      const store = await readStore();
      const key = msg.url ? canonicalize(msg.url) : canonicalize(sender.tab.url);
      const list = store.annotations[key] || [];
      store.annotations[key] = list.filter(a => a.id !== msg.id);
      await writeStore(store);
      sendResponse({ ok: true });
    } else if (msg.type === 'update-settings') {
      const store = await readStore();
      store.settings = { ...store.settings, ...msg.settings };
      await writeStore(store);
      sendResponse({ ok: true, settings: store.settings });
    } else if (msg.type === 'storage-usage') {
      chrome.storage.local.getBytesInUse(null, (bytes) => {
        sendResponse({ bytes, quota: chrome.storage.local.QUOTA_BYTES || 10485760 });
      });
      return;
    } else if (msg.type === 'open-pdf-viewer') {
      const viewerUrl = chrome.runtime.getURL('pdf-viewer/viewer.html') + '?file=' + encodeURIComponent(msg.url);
      const tab = await chrome.tabs.create({ url: viewerUrl });
      sendResponse({ ok: true, tabId: tab.id });
    } else if (msg.type === 'scroll-to-annotation') {
      try {
        await chrome.tabs.sendMessage(msg.tabId, { type: 'scroll-to', id: msg.id });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    } else {
      sendResponse({ ok: false, error: 'unknown' });
    }
  })();
  return true;
});
