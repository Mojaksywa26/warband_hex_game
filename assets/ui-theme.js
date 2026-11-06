(() => {
  const storageKey = 'warband-ui-theme';
  const themes = ['manuscript', 'ironbound'];

  const savedTheme = () => {
    try {
      const value = localStorage.getItem(storageKey);
      return themes.includes(value) ? value : 'manuscript';
    } catch {
      return 'manuscript';
    }
  };

  const applyTheme = theme => {
    const selected = themes.includes(theme) ? theme : 'manuscript';
    document.documentElement.dataset.uiTheme = selected;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', selected === 'ironbound' ? '#12110f' : '#191715'
    );
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const ironbound = selected === 'ironbound';
      const currentName = ironbound ? 'Ironbound' : 'Manuscript';
      const nextName = ironbound ? 'Manuscript' : 'Ironbound';
      const translate = window.WarbandI18n?.t;
      button.textContent = translate
        ? translate('theme.current', { theme: translate(ironbound ? 'theme.ironbound' : 'theme.manuscript') })
        : `UI Skin: ${currentName}`;
      button.setAttribute('aria-pressed', String(ironbound));
      button.setAttribute(
        'aria-label',
        translate
          ? translate('theme.switch', { theme: translate(ironbound ? 'theme.manuscript' : 'theme.ironbound') })
          : `Switch to ${nextName} UI skin`
      );
    });
    try { localStorage.setItem(storageKey, selected); } catch { /* Storage is optional. */ }
  };

  window.WarbandTheme = { apply: applyTheme, get: savedTheme };
  applyTheme(savedTheme());
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.uiTheme === 'ironbound' ? 'manuscript' : 'ironbound');
    });
  });
})();
