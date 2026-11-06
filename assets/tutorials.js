(() => {
  'use strict';

  let rowsPromise = null;
  let session = null;
  const preparers = new Map();
  const registerPreparer = (name, prepare) => preparers.set(name, prepare);
  const labels = {
    en: { tutorial: 'Tutorial', skip: 'Skip', next: 'Next' },
    pl: { tutorial: 'Samouczek', skip: 'Pomiń', next: 'Dalej' },
    de: { tutorial: 'Tutorial', skip: 'Überspringen', next: 'Weiter' }
  };
  const language = () => labels[window.WarbandI18n?.language] ? window.WarbandI18n.language : 'en';
  const localized = (row, field) => window.WarbandCSV.text(row, field, language()) || row[field];
  const writeInstruction = (element, text) => {
    const parts = String(text).split(/(\[b\].*?\[\/b\])/g).filter(Boolean);
    element.replaceChildren(...parts.map(part => {
      if (!part.startsWith('[b]') || !part.endsWith('[/b]')) return document.createTextNode(part);
      const strong = document.createElement('strong');
      strong.textContent = part.slice(3, -4);
      return strong;
    }));
  };
  const visibleElements = selector => [...document.querySelectorAll(selector)].filter(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  });

  // Named subjects keep tutorial CSV readable. Prefixed subjects support future
  // UI, setup Token, board Token, and Card steps without new overlay code.
  const namedSubjects = {
    setup_board: () => ['.map-wrap', '#setup-panel'].flatMap(visibleElements),
    setup_tray: () => visibleElements('#setup-panel'),
    setup_tokens: () => visibleElements('#setup-tokens .setup-token'),
    board_tokens: () => visibleElements('.map > g[data-token-index]'),
    action_counter: () => visibleElements('#action-counter'),
    token_abilities: () => visibleElements('#token-card .token-move'),
    token_move: () => visibleElements('#token-move'),
    hand_cards: () => visibleElements('#cards .card'),
    battle_tutorial_card: () => visibleElements('.tutorial-preview-host .tutorial-battle-card'),
    battle_tutorial_token: () => visibleElements('.tutorial-preview-host .tutorial-battle-token'),
    battle_tutorial_melee: () => visibleElements('.tutorial-preview-host .tutorial-battle-token .attack-marker[data-attack-type="close"]'),
    battle_tutorial_shooting: () => visibleElements('.tutorial-preview-host .tutorial-battle-token .attack-marker[data-attack-type="shooting"]'),
    battle_tutorial_power: () => visibleElements('.tutorial-preview-host .tutorial-battle-token .attack-marker[data-attack-type="shooting"], .tutorial-preview-host .tutorial-battle-token .attack-power-outline-layer'),
    battle_tutorial_initiative: () => visibleElements('.tutorial-preview-host .tutorial-battle-token .initiative-anchor')
  };
  const resolveSubject = subject => {
    if (namedSubjects[subject]) return namedSubjects[subject]();
    const separator = subject.indexOf(':');
    if (separator < 1) throw new Error(`Unknown tutorial subject "${subject}".`);
    const kind = subject.slice(0, separator);
    const id = subject.slice(separator + 1);
    if (kind === 'ui') return visibleElements(id);
    if (kind === 'setup_token') return visibleElements(`#setup-tokens .setup-token[data-token-index="${id}"]`);
    if (kind === 'setup_tokens') return visibleElements(`#setup-tokens .setup-token[data-player="${id}"]`);
    if (kind === 'board_token') return visibleElements(`.map > g[data-token-index="${id}"]`);
    if (kind === 'card') {
      const card = visibleElements('#cards .card')[Number(id)];
      return card ? [card] : [];
    }
    throw new Error(`Unknown tutorial subject type "${kind}".`);
  };

  const get = async (scenarioId, trigger = 'setup') => {
    rowsPromise ||= window.WarbandCSV.readCSV('tutorials.csv');
    const rows = await rowsPromise;
    const separator = String(scenarioId).lastIndexOf('-');
    const scenario = String(scenarioId).slice(0, separator);
    const mission = String(scenarioId).slice(separator + 1);
    const slides = rows.filter(row => row.scenario === scenario && row.mission === mission && (row.trigger || 'setup') === trigger)
      .sort((left, right) => Number(left.step) - Number(right.step));
    slides.forEach((row, index) => {
      if (Number(row.step) !== index + 1 || !row.targets || !row.instruction) {
        throw new Error(`Tutorial CSV error in scenario ${scenarioId} (${trigger}): steps must be sequential and include targets and instructions.`);
      }
      row.step = index + 1;
    });
    return slides;
  };

  const svgElement = (name, attributes = {}) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  };
  const overlapArea = (left, right) => {
    const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
    const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    return width * height;
  };
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  const ensureInterface = () => {
    if (session?.root) return session;
    const root = document.createElement('div');
    root.className = 'tutorial-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'tutorial-heading');
    root.setAttribute('aria-describedby', 'tutorial-instruction');
    root.hidden = true;
    root.innerHTML = `
      <div class="tutorial-preview-host" aria-hidden="true" hidden></div>
      <svg class="tutorial-spotlight-svg" aria-hidden="true">
        <defs><mask id="warband-tutorial-mask" maskUnits="userSpaceOnUse">
          <rect class="tutorial-mask-base" fill="white"></rect>
          <g class="tutorial-mask-cutouts"></g>
        </mask></defs>
        <rect class="tutorial-shade" mask="url(#warband-tutorial-mask)"></rect>
        <g class="tutorial-target-outlines"></g>
      </svg>
      <section class="tutorial-instruction-box">
        <div class="tutorial-heading" id="tutorial-heading"><span data-tutorial-label></span><span data-tutorial-progress></span></div>
        <p id="tutorial-instruction" aria-live="polite"></p>
      </section>
      <div class="turn-action-dock tutorial-action-dock">
        <button class="pass-turn tutorial-skip" type="button"></button>
        <button class="pass-turn tutorial-next" type="button"></button>
      </div>`;
    document.body.appendChild(root);
    session = {
      root,
      slides: [],
      index: 0,
      active: false,
      previousFocus: null,
      cleanup: null,
      preview: root.querySelector('.tutorial-preview-host'),
      box: root.querySelector('.tutorial-instruction-box'),
      instruction: root.querySelector('#tutorial-instruction'),
      next: root.querySelector('.tutorial-next'),
      skip: root.querySelector('.tutorial-skip'),
      svg: root.querySelector('.tutorial-spotlight-svg'),
      maskBase: root.querySelector('.tutorial-mask-base'),
      shade: root.querySelector('.tutorial-shade'),
      cutouts: root.querySelector('.tutorial-mask-cutouts'),
      outlines: root.querySelector('.tutorial-target-outlines'),
      targetRects: []
    };
    session.next.addEventListener('click', advance);
    session.skip.addEventListener('click', () => finish(true));
    root.addEventListener('pointerdown', event => event.stopPropagation());
    root.addEventListener('click', event => event.stopPropagation());
    return session;
  };

  const subjectRects = slide => {
    const elements = window.WarbandCSV.list(slide.targets).flatMap(resolveSubject);
    if (!elements.length) throw new Error(`Tutorial step ${slide.step} has no visible subject: ${slide.targets}.`);
    return [...new Set(elements)].map(element => {
      const bounds = element.getBoundingClientRect();
      const padding = 8;
      return {
        left: Math.max(0, bounds.left - padding),
        top: Math.max(0, bounds.top - padding),
        right: Math.min(window.innerWidth, bounds.right + padding),
        bottom: Math.min(window.innerHeight, bounds.bottom + padding),
        width: Math.min(window.innerWidth, bounds.right + padding) - Math.max(0, bounds.left - padding),
        height: Math.min(window.innerHeight, bounds.bottom + padding) - Math.max(0, bounds.top - padding),
        outline: element.getAttribute('data-tutorial-outline') !== 'hidden'
      };
    });
  };

  const positionInstruction = () => {
    if (!session?.active) return;
    const { box, targetRects, next, skip } = session;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const margin = 16;
    const gap = 20;
    const width = box.offsetWidth;
    const height = box.offsetHeight;
    const union = targetRects.reduce((bounds, rectangle) => ({
      left: Math.min(bounds.left, rectangle.left),
      top: Math.min(bounds.top, rectangle.top),
      right: Math.max(bounds.right, rectangle.right),
      bottom: Math.max(bounds.bottom, rectangle.bottom)
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const centerX = (union.left + union.right) / 2;
    const centerY = (union.top + union.bottom) / 2;
    const dockBounds = {
      left: viewport.width - Math.max(next.offsetWidth, skip.offsetWidth, 204) - 44,
      top: viewport.height - 150,
      right: viewport.width,
      bottom: viewport.height
    };
    const candidates = [
      { x: union.right + gap, y: centerY - height / 2 },
      { x: union.left - width - gap, y: centerY - height / 2 },
      { x: centerX - width / 2, y: union.top - height - gap },
      { x: centerX - width / 2, y: union.bottom + gap },
      { x: margin, y: margin },
      { x: viewport.width - width - margin, y: margin },
      { x: margin, y: viewport.height - height - margin },
      { x: viewport.width - width - margin, y: viewport.height - height - margin }
    ];
    const positioned = candidates.map(candidate => {
      const left = clamp(candidate.x, margin, Math.max(margin, viewport.width - width - margin));
      const top = clamp(candidate.y, margin, Math.max(margin, viewport.height - height - margin));
      const rectangle = { left, top, right: left + width, bottom: top + height };
      const targetOverlap = targetRects.reduce((total, target) => total + overlapArea(rectangle, target), 0);
      const dockOverlap = overlapArea(rectangle, dockBounds);
      const distance = Math.hypot(left + width / 2 - centerX, top + height / 2 - centerY);
      return { left, top, score: targetOverlap * 100 + dockOverlap * 40 + distance };
    }).sort((left, right) => left.score - right.score)[0];
    box.style.left = `${positioned.left}px`;
    box.style.top = `${positioned.top}px`;
  };

  const layout = () => {
    if (!session?.active) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    session.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    [session.maskBase, session.shade].forEach(rectangle => {
      rectangle.setAttribute('width', width);
      rectangle.setAttribute('height', height);
    });
    const slide = session.slides[session.index];
    session.targetRects = subjectRects(slide);
    const cutouts = session.targetRects.map(rectangle => svgElement('rect', {
      x: rectangle.left, y: rectangle.top, width: rectangle.width, height: rectangle.height, rx: 7, fill: 'black'
    }));
    const outlines = session.targetRects.filter(rectangle => rectangle.outline).map(rectangle => svgElement('rect', {
      x: rectangle.left, y: rectangle.top, width: rectangle.width, height: rectangle.height, rx: 7,
      class: 'tutorial-target-outline'
    }));
    session.cutouts.replaceChildren(...cutouts);
    session.outlines.replaceChildren(...outlines);
    positionInstruction();
  };

  const render = () => {
    if (!session?.active) return;
    clearGlowTimers();
    const slide = session.slides[session.index];
    session.cleanup?.();
    session.cleanup = null;
    session.preview.hidden = true;
    session.preview.replaceChildren();
    if (slide.prepare) {
      const prepare = preparers.get(slide.prepare);
      if (!prepare) throw new Error(`Tutorial step ${slide.step} has no registered view preparation: ${slide.prepare}.`);
      session.cleanup = prepare(session.preview, { layout }) || null;
    }
    const copy = labels[language()];
    session.root.querySelector('[data-tutorial-label]').textContent = copy.tutorial;
    session.root.querySelector('[data-tutorial-progress]').textContent = `${session.index + 1} / ${session.slides.length}`;
    writeInstruction(session.instruction, localized(slide, 'instruction'));
    session.next.textContent = localized(slide, 'button') || copy.next;
    session.skip.textContent = copy.skip;
    layout();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      session.box.animate([
        { opacity: .35, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 160, easing: 'ease-out' });
    }
    glowTimer = startGlowCycle(session.box, 1286, 1714);
    glowSwitchTimer = setTimeout(() => {
      clearInterval(glowTimer);
      glowTimer = startGlowCycle(session.next, 1286, 1714);
    }, 10000);
  };

  const keydown = event => {
    if (!session?.active || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      const controls = [session.skip, session.next];
      const current = controls.indexOf(document.activeElement);
      const nextIndex = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current + 1) % controls.length;
      controls[nextIndex].focus();
    } else if (event.key === 'Enter' && ![session.skip, session.next].includes(document.activeElement)) {
      event.preventDefault();
      session.next.click();
    } else if (event.key !== 'Enter') {
      event.preventDefault();
    }
    event.stopImmediatePropagation();
  };

  function finish(skipped = false) {
    if (!session?.active) return;
    clearGlowTimers();
    session.active = false;
    const effect = skipped ? null : session.slides[session.index]?.effect || null;
    session.cleanup?.();
    document.removeEventListener('keydown', keydown, true);
    window.removeEventListener('resize', layout);
    window.removeEventListener('scroll', layout, true);
    document.removeEventListener('warband:languagechange', render);
    session.root.hidden = true;
    document.querySelector('.shell')?.removeAttribute('inert');
    session.root.remove();
    const previousFocus = session.previousFocus;
    const resolve = session.resolve;
    session = null;
    document.dispatchEvent(new CustomEvent('warband:tutorialchange'));
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    resolve?.(effect);
  }

  function advance() {
    if (!session?.active) return;
    if (session.index >= session.slides.length - 1) {
      finish();
      return;
    }
    session.index++;
    render();
    session.next.focus({ preventScroll: true });
  }

  let glowTimer = null;
  let glowSwitchTimer = null;

  const clearGlowTimers = () => {
    if (glowTimer) { clearInterval(glowTimer); glowTimer = null; }
    if (glowSwitchTimer) { clearTimeout(glowSwitchTimer); glowSwitchTimer = null; }
  };

  const startGlow = (element, duration = 1200, intensity = 1) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const blur = Math.round(26 * intensity);
    const spread = Math.round(5 * intensity);
    const alpha = Math.min(.70 * intensity, .95);
    element.animate([
      { boxShadow: `0 14px 38px rgba(0,0,0,.62), inset 0 0 0 1px rgba(244,236,216,.025), 0 0 0 0 rgba(198,163,86,0)` },
      { boxShadow: `0 14px 38px rgba(0,0,0,.62), inset 0 0 0 1px rgba(244,236,216,.025), 0 0 ${blur}px ${spread}px rgba(198,163,86,${alpha})`, offset: 0.166 },
      { boxShadow: `0 14px 38px rgba(0,0,0,.62), inset 0 0 0 1px rgba(244,236,216,.025), 0 0 0 0 rgba(198,163,86,0)`, offset: 1 }
    ], { duration, easing: 'ease-in-out' });
  };

  const startGlowCycle = (element, interval = 3000, duration = 1200) => {
    let pulseCount = 0;
    const runPulse = () => {
      pulseCount++;
      const intensity = pulseCount % 2 === 0 ? 2.0 : 1;
      startGlow(element, duration, intensity);
    };
    runPulse();
    return setInterval(runPulse, interval);
  };

  const start = slides => {
    if (!slides.length) return Promise.resolve();
    if (session?.active) finish();
    const state = ensureInterface();
    state.slides = slides;
    state.index = 0;
    state.active = true;
    state.previousFocus = document.activeElement;
    state.root.hidden = false;
    document.querySelector('.shell')?.setAttribute('inert', '');
    document.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', layout);
    window.addEventListener('scroll', layout, true);
    document.addEventListener('warband:languagechange', render);
    render();
    document.dispatchEvent(new CustomEvent('warband:tutorialchange'));
    state.next.focus({ preventScroll: true });
    return new Promise(resolve => { state.resolve = resolve; });
  };

  window.WarbandTutorials = Object.freeze({ get, start, registerPreparer, isActive: () => Boolean(session?.active) });
})();
