/* The HTML, prices and contact links work before the interactive layer starts. */
(() => {
  const loader = document.currentScript;
  if (!loader?.dataset.entry || window.__assistenciaMarketingBootstrap) return;
  window.__assistenciaMarketingBootstrap = true;
  let started = false;
  let ready = false;
  let pending = [];
  let status = null;
  let feedbackTimer = 0;
  const removeListeners = () => {
    document.removeEventListener('click', capture, true);
    document.removeEventListener('keydown', capture, true);
    document.removeEventListener('assistencia:marketing-ready', complete);
  };
  const complete = () => {
    ready = true;
    removeListeners();
    status?.remove();
    clearTimeout(feedbackTimer);
    const actions = pending;
    pending = [];
    for (const action of actions) {
      let target = action.target;
      if (!target.isConnected) continue;
      if (action.key) {
        const tabs = target.closest('[role="tablist"]');
        if (tabs?.contains(document.activeElement)) target = document.activeElement;
        target.focus();
        target.dispatchEvent(new KeyboardEvent('keydown', { key: action.key, bubbles: true, cancelable: true }));
      } else target.click();
    }
  };
  const fail = () => {
    clearTimeout(feedbackTimer);
    feedbackTimer = 0;
    status?.remove();
    status = document.createElement('div');
    status.className = 'sf-interaction-status';
    status.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = 'Não foi possível carregar as opções interativas. Confira a conexão e tente novamente.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', () => location.reload());
    status.append(text, retry);
    document.body.append(status);
  };
  const start = () => {
    if (started || ready) return;
    started = true;
    // Fetch the graph together after paint, avoiding a serial import waterfall.
    const modules = JSON.parse(loader.dataset.modules || '[]');
    for (const src of modules) {
      if (typeof src !== 'string' || !src.startsWith('/_next/static/chunks/')) continue;
      const link = document.createElement('link');
      link.rel = 'modulepreload'; link.href = src; link.crossOrigin = 'anonymous';
      document.head.append(link);
    }
    const script = document.createElement('script');
    script.type = 'module';
    script.src = loader.dataset.entry;
    script.id = '_R_';
    script.onerror = () => { script.remove(); fail(); };
    document.head.append(script);
  };
  const capture = event => {
    if (ready || !(event.target instanceof Element)) return;
    const keyboard = event.type === 'keydown';
    if (keyboard && (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))) return;
    const target = event.target.closest(keyboard ? '.sales-home [role="tab"]' : '.site-header button, .sales-home button, .back-to-top');
    if (!target) return;
    // Honor an early tap once the component is ready, rather than losing it.
    event.preventDefault();
    event.stopImmediatePropagation();
    pending.push({ target, key: keyboard ? event.key : null });
    if (pending.length > 32) pending.shift();
    if (!feedbackTimer) feedbackTimer = setTimeout(() => {
      if (ready || status) return;
      status = document.createElement('div');
      status.className = 'sf-interaction-status';
      status.setAttribute('role', 'status');
      status.textContent = 'Preparando as opções. Sua escolha será aberta em instantes.';
      document.body.append(status);
    }, 250);
    start();
  };
  document.addEventListener('click', capture, true);
  document.addEventListener('keydown', capture, true);
  document.addEventListener('assistencia:marketing-ready', complete);
  window.addEventListener('pageshow', event => {
    if (!event.persisted || ready) return;
    document.addEventListener('click', capture, true);
    document.addEventListener('keydown', capture, true);
    document.addEventListener('assistencia:marketing-ready', complete);
    start();
  });
  // Yield through a painted frame; this is not an arbitrary loading delay.
  if (document.visibilityState === 'hidden') start();
  else requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(start, 0)));
  window.addEventListener('pagehide', removeListeners, { once: true });
})();
