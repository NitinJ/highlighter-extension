(function () {
  const ns = (window.__hlx = window.__hlx || {});
  let toolbar = null;
  let savedRange = null;

  function close() {
    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }
    savedRange = null;
  }

  function show(range, opts) {
    close();
    savedRange = range.cloneRange();
    toolbar = document.createElement('div');
    toolbar.className = 'hlx-toolbar';

    ns.highlight.COLORS.forEach((c) => {
      const sw = document.createElement('button');
      sw.className = 'hlx-tb-swatch';
      sw.style.backgroundColor = c.hex;
      sw.title = c.name;
      sw.setAttribute('aria-label', c.name);
      if (ns.highlight.isDarkSwatchColor && ns.highlight.isDarkSwatchColor(c.hex)) {
        sw.classList.add('hlx-tb-swatch-dark');
      }
      sw.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onColor(c.hex, savedRange);
        close();
      });
      toolbar.appendChild(sw);
    });

    const sep = document.createElement('span');
    sep.className = 'hlx-tb-sep';
    toolbar.appendChild(sep);

    const cmtBtn = document.createElement('button');
    cmtBtn.className = 'hlx-tb-comment';
    cmtBtn.textContent = '💬';
    cmtBtn.title = 'Add comment';
    cmtBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    cmtBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onComment(savedRange);
      close();
    });
    toolbar.appendChild(cmtBtn);

    document.body.appendChild(toolbar);
    position(range);
  }

  function position(range) {
    const rect = range.getBoundingClientRect();
    const tw = toolbar.offsetWidth;
    const th = toolbar.offsetHeight;
    let top = window.scrollY + rect.bottom + 8;
    let left = window.scrollX + rect.left + (rect.width / 2) - (tw / 2);
    if (rect.bottom + th + 16 > window.innerHeight) top = window.scrollY + rect.top - th - 8;
    if (left < window.scrollX + 4) left = window.scrollX + 4;
    if (left + tw + 4 > window.scrollX + window.innerWidth) left = window.scrollX + window.innerWidth - tw - 4;
    toolbar.style.top = top + 'px';
    toolbar.style.left = left + 'px';
  }

  document.addEventListener('mousedown', (e) => {
    if (toolbar && !toolbar.contains(e.target)) close();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  ns.toolbar = { show, close };
})();
