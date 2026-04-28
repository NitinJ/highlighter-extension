(function () {
  const ns = (window.__hlx = window.__hlx || {});
  let badge = null;
  let panel = null;

  function close() {
    if (panel) { panel.remove(); panel = null; }
  }

  function render(orphans, opts) {
    if (badge) { badge.remove(); badge = null; }
    close();
    if (!orphans.length) return;

    badge = document.createElement('div');
    badge.className = 'hlx-orphan-badge';
    badge.title = `${orphans.length} orphaned annotation${orphans.length === 1 ? '' : 's'}`;
    badge.innerHTML = `<span class="hlx-orphan-emoji">🔖</span><span class="hlx-orphan-count">${orphans.length}</span>`;
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel(orphans, opts);
    });
    document.body.appendChild(badge);
  }

  function togglePanel(orphans, opts) {
    if (panel) { close(); return; }
    panel = document.createElement('div');
    panel.className = 'hlx-orphan-panel';
    const head = document.createElement('div');
    head.className = 'hlx-orphan-head';
    head.textContent = `Orphaned (${orphans.length})`;
    panel.appendChild(head);

    orphans.forEach((a) => {
      const row = document.createElement('div');
      row.className = 'hlx-orphan-row';

      const sw = document.createElement('span');
      sw.className = 'hlx-orphan-swatch';
      sw.style.backgroundColor = a.color || '#94A3B8';
      row.appendChild(sw);

      const txt = document.createElement('span');
      txt.className = 'hlx-orphan-quote';
      txt.textContent = a.anchor.quote.length > 80 ? a.anchor.quote.slice(0, 77) + '...' : a.anchor.quote;
      txt.title = a.anchor.quote;
      row.appendChild(txt);

      const reattach = document.createElement('button');
      reattach.className = 'hlx-orphan-btn';
      reattach.textContent = 'Re-attach';
      reattach.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onReattach(a);
        close();
      });
      row.appendChild(reattach);

      const del = document.createElement('button');
      del.className = 'hlx-orphan-btn hlx-orphan-btn-danger';
      del.textContent = 'Delete';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onDelete(a);
      });
      row.appendChild(del);

      panel.appendChild(row);
    });

    document.body.appendChild(panel);
    const r = badge.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    panel.style.top = (window.scrollY + r.top - ph - 8) + 'px';
    panel.style.left = (window.scrollX + r.right - pw) + 'px';

    setTimeout(() => {
      const handler = (e) => {
        if (panel && !panel.contains(e.target) && e.target !== badge) {
          close();
          document.removeEventListener('mousedown', handler);
        }
      };
      document.addEventListener('mousedown', handler);
    }, 0);
  }

  ns.orphanBadge = { render, close };
})();
