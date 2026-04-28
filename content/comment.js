(function () {
  const ns = (window.__hlx = window.__hlx || {});
  const SLATE = '#94A3B8';

  function relativeTime(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return 'just now';
    if (d < 3600) return Math.floor(d / 60) + 'm ago';
    if (d < 86400) return Math.floor(d / 3600) + 'h ago';
    return Math.floor(d / 86400) + 'd ago';
  }

  function makeIcon(annotation, anchorEl) {
    const existing = document.querySelector(`.hlx-comment-icon[data-hlx-id="${CSS.escape(annotation.id)}"]`);
    if (existing) existing.remove();
    const icon = document.createElement('span');
    icon.className = 'hlx-comment-icon';
    icon.dataset.hlxId = annotation.id;
    icon.textContent = '1';
    if (annotation.kind === 'comment-only') {
      icon.classList.add('hlx-comment-icon-slate');
      icon.style.backgroundColor = SLATE;
    } else {
      icon.style.backgroundColor = annotation.color || SLATE;
    }
    anchorEl.parentNode.insertBefore(icon, anchorEl.nextSibling);
    return icon;
  }

  function positionBubble(bubble, iconEl) {
    const r = iconEl.getBoundingClientRect();
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    let top = window.scrollY + r.bottom + 8;
    let left = window.scrollX + r.left;
    bubble.classList.remove('hlx-bubble-up', 'hlx-bubble-right');
    if (r.bottom + bh + 16 > window.innerHeight && r.top - bh - 8 > 0) {
      top = window.scrollY + r.top - bh - 8;
      bubble.classList.add('hlx-bubble-up');
    }
    if (r.left + bw + 16 > window.innerWidth) {
      left = window.scrollX + r.right - bw;
      bubble.classList.add('hlx-bubble-right');
    }
    if (left < window.scrollX + 4) left = window.scrollX + 4;
    bubble.style.top = top + 'px';
    bubble.style.left = left + 'px';
  }

  let activeBubble = null;

  function closeBubble() {
    if (activeBubble) {
      if (activeBubble.__outside) document.removeEventListener('mousedown', activeBubble.__outside);
      activeBubble.remove();
      activeBubble = null;
    }
  }

  function showBubble(annotation, iconEl, opts) {
    closeBubble();
    const bubble = document.createElement('div');
    bubble.className = 'hlx-bubble';
    bubble.dataset.hlxId = annotation.id;
    activeBubble = bubble;
    document.body.appendChild(bubble);
    render();

    function render() {
      bubble.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'hlx-bubble-head';
      const ts = annotation.comment ? annotation.comment.updatedAt : annotation.updatedAt;
      head.textContent = `You · ${relativeTime(ts)}`;
      bubble.appendChild(head);

      const body = document.createElement('div');
      body.className = 'hlx-bubble-body';
      body.textContent = (annotation.comment && annotation.comment.text) || '';
      bubble.appendChild(body);

      const quote = document.createElement('div');
      quote.className = 'hlx-bubble-quote';
      quote.textContent = annotation.anchor.quote;
      bubble.appendChild(quote);

      const actions = document.createElement('div');
      actions.className = 'hlx-bubble-actions';
      const editBtn = document.createElement('button');
      editBtn.className = 'hlx-bubble-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', startEdit);
      const delBtn = document.createElement('button');
      delBtn.className = 'hlx-bubble-btn hlx-bubble-btn-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        opts.onDelete && opts.onDelete();
        closeBubble();
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      bubble.appendChild(actions);

      positionBubble(bubble, iconEl);
    }

    function startEdit() {
      bubble.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'hlx-bubble-head';
      head.textContent = 'You';
      bubble.appendChild(head);

      const ta = document.createElement('textarea');
      ta.className = 'hlx-bubble-textarea';
      ta.value = (annotation.comment && annotation.comment.text) || '';
      ta.placeholder = 'Add a comment...';
      bubble.appendChild(ta);

      const quote = document.createElement('div');
      quote.className = 'hlx-bubble-quote';
      quote.textContent = annotation.anchor.quote;
      bubble.appendChild(quote);

      const actions = document.createElement('div');
      actions.className = 'hlx-bubble-actions';
      const save = document.createElement('button');
      save.className = 'hlx-bubble-btn hlx-bubble-btn-primary';
      save.textContent = 'Save';
      save.addEventListener('click', () => {
        const text = ta.value.trim();
        if (!text) {
          opts.onDelete && opts.onDelete();
          closeBubble();
          return;
        }
        opts.onSave && opts.onSave(text);
        render();
      });
      const cancel = document.createElement('button');
      cancel.className = 'hlx-bubble-btn';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => {
        if (!annotation.comment) {
          opts.onCancelNew && opts.onCancelNew();
          closeBubble();
        } else {
          render();
        }
      });
      actions.appendChild(save);
      actions.appendChild(cancel);
      bubble.appendChild(actions);

      positionBubble(bubble, iconEl);
      ta.focus();
    }

    if (!annotation.comment || !annotation.comment.text) startEdit();

    setTimeout(() => {
      const handler = (e) => {
        if (!bubble.contains(e.target) && e.target !== iconEl) closeBubble();
      };
      bubble.__outside = handler;
      document.addEventListener('mousedown', handler);
    }, 0);
  }

  ns.comment = { makeIcon, showBubble, closeBubble };
})();
