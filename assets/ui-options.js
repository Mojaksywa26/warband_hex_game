(() => {
  const mainMenu = document.querySelector('#main-menu');
  const optionsMenu = document.querySelector('#options-menu');
  const openButtons = [...document.querySelectorAll('[data-options-open]')];
  const backButton = document.querySelector('[data-options-back]');
  const languageSelect = document.querySelector('#language-select');
  if (!mainMenu || !optionsMenu || !openButtons.length || !backButton) return;

  const storage = {
    get(key, fallback = true) {
      try {
        const value = localStorage.getItem(`warband-option-${key}`);
        return value === null ? fallback : value === 'true';
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(`warband-option-${key}`, String(value)); } catch { /* Settings remain session-local. */ }
    }
  };
  window.WarbandOptions = {
    get: key => storage.get(key, true),
    set(key, value) {
      storage.set(key, Boolean(value));
      document.dispatchEvent(new CustomEvent('warband:optionschange', { detail: { key, value: Boolean(value) } }));
    }
  };

  const optionControls = {
    predictedDamage: document.querySelector('#option-predicted-damage'),
    movementHexHighlights: document.querySelector('#option-movement-hex-highlights'),
    tutorials: document.querySelector('#option-tutorials'),
    deploymentGlow: document.querySelector('#option-deployment-glow')
  };
  Object.entries(optionControls).forEach(([key, control]) => {
    if (!control) return;
    control.checked = storage.get(key, true);
    control.addEventListener('change', () => window.WarbandOptions.set(key, control.checked));
  });
  [
    ['tutorials', '#option-tutorials-select'],
    ['deploymentGlow', '#option-deployment-glow-select']
  ].forEach(([key, selector]) => {
    const select = document.querySelector(selector);
    if (!select) return;
    select.value = String(storage.get(key, true));
    select.addEventListener('change', () => window.WarbandOptions.set(key, select.value === 'true'));
  });

  let optionsOpener = null;
  let mainMenuWasVisible = false;
  const showOptions = (open, opener = optionsOpener) => {
    if (open) {
      optionsOpener = opener;
      mainMenuWasVisible = !mainMenu.hidden;
      mainMenu.hidden = true;
      optionsMenu.hidden = false;
      backButton.textContent = mainMenuWasVisible ? 'Back to Main Menu' : 'Back to Game';
      backButton.focus();
    } else {
      optionsMenu.hidden = true;
      mainMenu.hidden = !mainMenuWasVisible;
      optionsOpener?.focus();
    }
  };
  openButtons.forEach(button => button.addEventListener('click', () => showOptions(true, button)));
  backButton.addEventListener('click', () => showOptions(false));
  optionsMenu.addEventListener('keydown', event => {
    if (event.key === 'Escape') showOptions(false);
  });

  if (languageSelect) {
    languageSelect.addEventListener('change', async () => {
      await window.WarbandI18n?.setLanguage(languageSelect.value);
    });
  }
})();
