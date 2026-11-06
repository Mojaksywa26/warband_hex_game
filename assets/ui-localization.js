(() => {
  const supported = ['en', 'pl', 'de'];
  let current = 'en';
  let dictionary = {};
  let requestSerial = 0;

  const savedLanguage = () => {
    try {
      const value = localStorage.getItem('warband-language');
      return supported.includes(value) ? value : 'en';
    } catch { return 'en'; }
  };
  const t = (key, variables = {}) => {
    const template = dictionary[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => variables[name] ?? `{${name}}`);
  };
  const text = (selector, key) => document.querySelectorAll(selector).forEach(element => {
    element.textContent = t(key);
  });
  const directText = (selector, key) => document.querySelectorAll(selector).forEach(element => {
    const node = [...element.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
    if (node) node.textContent = t(key);
  });
  const option = (selector, key) => document.querySelectorAll(selector).forEach(element => {
    element.textContent = t(key);
  });

  const apply = () => {
    document.documentElement.lang = current;
    text('#main-menu .menu-subtitle', 'menu.subtitle');
    text('[data-options-open]', 'menu.options');
    text('#demo-launch, #demo-match-3', 'menu.launch');
    text('#options-title', 'options.title');
    text('#options-menu .menu-subtitle', 'options.subtitle');
    directText('label:has(#language-select)', 'options.language');
    text('#language-note', 'options.languageNote');
    text('[data-options-back]', 'options.back');
    text('#faction-select-title', 'setup.title');
    text('#faction-selection .menu-subtitle', 'setup.subtitle');
    text('#player-setup-1', 'setup.player1');
    text('#player-setup-2', 'setup.player2');
    document.querySelectorAll('#player-faction-1, #player-faction-2').forEach(select => {
      const label = select.closest('label');
      const node = label && [...label.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
      if (node) node.textContent = t('setup.faction');
    });
    document.querySelectorAll('#player-controller-1, #player-controller-2').forEach(select => {
      const label = select.closest('label');
      const node = label && [...label.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
      if (node) node.textContent = t('setup.controller');
    });
    directText('#ai-personality-field-1, #ai-personality-field-2', 'setup.attitude');
    option('#player-controller-1 option[value="human"], #player-controller-2 option[value="human"]', 'setup.human');
    option('#player-controller-1 option[value="ai"], #player-controller-2 option[value="ai"]', 'setup.ai');
    ['offensive', 'defensive', 'balanced', 'chaotic'].forEach(value => {
      option(`#ai-personality-1 option[value="${value}"], #ai-personality-2 option[value="${value}"]`, `setup.${value}`);
    });
    text('#confirm-match', 'setup.confirm');
    text('#match-result .menu-subtitle', 'result.complete');
    text('#match-result-title', 'result.victory');
    text('#result-rounds + span', 'result.rounds');
    text('#result-battles + span', 'result.battles');
    text('#result-survivors + span', 'result.survivors');
    text('#result-rematch', 'result.rematch');
    text('.round-label', 'game.currentPhase');
    text('.ai-kicker', 'ai.kicker');
    text('#ai-status', 'ai.awaiting');
    text('#ai-detail', 'ai.detail');
    text('#ai-toggle', 'ai.pause');
    text('#ai-step', 'ai.step');
    directText('.ai-speed', 'ai.speed');
    text('#ai-log-toggle', 'ai.log');
    text('#ai-restart', 'ai.restart');
    text('.ai-metric:nth-child(1) span', 'ai.round');
    text('.ai-metric:nth-child(2) span', 'result.battles');
    text('.ai-metric:nth-child(3) span', 'ai.decisions');
    text('#faction-tab-1', 'warband.player1');
    text('#faction-tab-2', 'warband.player2');
    text('.leader .section-label', 'warband.leader');
    text('.units .section-label', 'warband.tokens');
    text('.resource:nth-child(1) span', 'warband.cardsHand');
    text('.resource:nth-child(2) span', 'warband.cardsDeck');
    text('.leader .status', 'warband.alive');
    directText('#token-back', 'warband.back');
    text('.token-stat:nth-child(2) span', 'token.movement');
    text('.token-stat:nth-child(3) span', 'token.initiative');
    text('#token-move', 'token.moveMode');
    text('#token-keywords-group h3', 'token.keywords');
    text('#token-side-coverage-group h3', 'token.sideCoverage');
    text('.side-coverage-legend span:nth-child(1)', 'token.close');
    text('.side-coverage-legend span:nth-child(2)', 'token.shooting');
    text('.side-coverage-legend span:nth-child(3)', 'token.shield');
    text('#token-attacks-group h3', 'token.attackDirections');
    text('#token-shooting-group h3', 'token.shootingDirections');
    text('#token-neighbors-group h3', 'token.neighbors');
    text('#token-static-group h3', 'token.staticAbilities');
    text('#token-activated-group h3', 'token.activatedAbilities');
    text('#token-effects-group h3', 'token.temporaryEffects');
    text('#battle-intro span', 'battle.fight');
    text('#ai-thinking', 'battle.thinking');
    text('.combat-log-heading span', 'battle.log');
    text('#combat-log-clear', 'battle.clear');
    text('#combat-log-empty', 'battle.empty');
    text('#rotation-tooltip', 'battle.rotate');
    document.querySelector('.token-tooltip-stats span:first-child')?.firstChild && (document.querySelector('.token-tooltip-stats span:first-child').firstChild.textContent = 'HP');
    document.querySelector('.token-tooltip-stats span:last-child')?.firstChild && (document.querySelector('.token-tooltip-stats span:last-child').firstChild.textContent = t('token.initiative'));
    text('#hex-coordinate span', 'map.axial');
    text('.terrain-row:nth-child(1) span', 'map.terrain');
    text('.terrain-row:nth-child(2) span', 'map.effects');
    text('.battle-meter span', 'map.occupied');
    text('#pass-turn', 'action.pass');
    text('#random-deployment', 'action.randomDeployment');
    text('#confirm-movement', 'action.confirmMovement');
    text('#cancel-movement', 'action.cancel');
    directText('#setup-tab', 'dock.setup');
    text('#hand-tab', 'dock.hand');
    text('#graveyard-tab', 'dock.graveyard');
    text('#discard-tab', 'dock.discard');
    text('#graveyard-empty', 'dock.noFallen');
    text('#discard-empty', 'dock.noDiscarded');
    text('.scrap-counter-label', 'scrap.counter');
    window.WarbandTheme?.apply(document.documentElement.dataset.uiTheme || 'manuscript');
  };

  const setLanguage = async language => {
    const selected = supported.includes(language) ? language : 'en';
    const serial = ++requestSerial;
    const select = document.querySelector('#language-select');
    if (select) select.disabled = true;
    try {
      const response = await fetch(`assets/locales/${selected}.json`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load locale ${selected}`);
      const nextDictionary = await response.json();
      if (serial !== requestSerial) return current;
      current = selected;
      dictionary = nextDictionary;
      if (select) select.value = current;
      try { localStorage.setItem('warband-language', current); } catch { /* Storage is optional. */ }
      apply();
      document.dispatchEvent(new CustomEvent('warband:languagechange', { detail: { language: current } }));
      return current;
    } catch (error) {
      console.error(error);
      if (selected !== 'en') return setLanguage('en');
      return current;
    } finally {
      if (select && serial === requestSerial) select.disabled = false;
    }
  };

  window.WarbandI18n = { t, setLanguage, get language() { return current; }, apply };
  window.WarbandI18n.ready = setLanguage(savedLanguage());
})();
