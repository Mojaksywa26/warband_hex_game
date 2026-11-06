(() => {
  const meanings = {
    psychic: 'Attacks ignore Shields.',
    leader: 'The warband’s commander.',
    champion: 'Elite unit. Maximum two per warband.'
  };

  const style = document.createElement('style');
  style.textContent = `
    .keyword-chip[data-keyword-meaning] { cursor: help; }
    .keyword-meaning-tooltip {
      position: fixed;
      z-index: 1200;
      width: max-content;
      max-width: min(220px, calc(100vw - 24px));
      padding: 6px 9px;
      color: var(--parchment, #f4ecd8);
      background: rgba(25, 23, 21, .98);
      border: 1px solid rgba(198, 163, 86, .58);
      box-shadow: 0 5px 16px rgba(0, 0, 0, .38);
      font: 11px/1.4 var(--body, sans-serif);
      letter-spacing: normal;
      text-transform: none;
      white-space: normal;
      pointer-events: none;
    }
    .keyword-meaning-tooltip[hidden] { display: none; }
  `;
  document.head.appendChild(style);

  const tooltip = document.createElement('div');
  tooltip.className = 'keyword-meaning-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  let currentChip = null;
  const hide = () => {
    currentChip = null;
    tooltip.hidden = true;
  };
  const position = (chip, event) => {
    const rect = chip.getBoundingClientRect();
    const desiredLeft = event?.clientX ? event.clientX + 12 : rect.left;
    const desiredTop = event?.clientY ? event.clientY + 14 : rect.bottom + 7;
    const left = Math.max(12, Math.min(desiredLeft, window.innerWidth - tooltip.offsetWidth - 12));
    const top = desiredTop + tooltip.offsetHeight <= window.innerHeight - 12
      ? desiredTop
      : Math.max(12, rect.top - tooltip.offsetHeight - 7);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  const show = (chip, event) => {
    currentChip = chip;
    tooltip.textContent = chip.dataset.keywordMeaning;
    tooltip.hidden = false;
    position(chip, event);
  };
  const chipFromEvent = event => event.target.closest?.('.keyword-chip[data-keyword-meaning]');

  document.addEventListener('pointerover', event => {
    const chip = chipFromEvent(event);
    if (!chip || (event.relatedTarget && chip.contains(event.relatedTarget))) return;
    show(chip, event);
  });
  document.addEventListener('pointermove', event => {
    if (currentChip && chipFromEvent(event) === currentChip) position(currentChip, event);
  });
  document.addEventListener('pointerout', event => {
    if (!currentChip || chipFromEvent(event) !== currentChip) return;
    if (event.relatedTarget && currentChip.contains(event.relatedTarget)) return;
    hide();
  });
  document.addEventListener('focusin', event => {
    const chip = chipFromEvent(event);
    if (chip) show(chip);
  });
  document.addEventListener('focusout', event => {
    if (currentChip && chipFromEvent(event) === currentChip) hide();
  });
  document.addEventListener('scroll', hide, true);

  window.WarbandKeywordTooltips = {
    meaningFor: keywordId => meanings[keywordId] || ''
  };
})();
