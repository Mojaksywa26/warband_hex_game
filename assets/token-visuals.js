(function exposeTokenVisuals(root) {
  'use strict';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const safeId = value => String(value ?? 'token').replace(/[^a-zA-Z0-9_-]/g, '-');

  const illustrationMarkup = (data, context) => {
    if (!data.illustration) return '';
    const clipId = `token-illustration-${safeId(context)}-${safeId(data.instanceId ?? data.id)}`;
    return `<defs><clipPath id="${clipId}"><polygon points="0,-24 20.78,-12 20.78,12 0,24 -20.78,12 -20.78,-12"/></clipPath></defs><image class="token-illustration" x="-24" y="-24" width="48" height="48" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" href="${escape(data.illustration)}"/>`;
  };

  const glyphMarkup = data => data.object_behavior === 'collect_scrap'
    ? '<g class="scrap-token-icon" transform="translate(-15 -15) scale(.75)" aria-hidden="true"><path d="M17 3h6l1 5 4 2 5-1 3 6-4 3v4l4 3-3 6-5-1-4 2-1 5h-6l-1-5-4-2-5 1-3-6 4-3v-4l-4-3 3-6 5 1 4-2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 14h8l4 6-4 6h-8l-4-6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></g>'
    : `<text y="1" class="token-glyph">${escape(data.glyph)}</text>`;

  const list = value => String(value || '').split('|').map(item => item.trim()).filter(Boolean);
  const canonicalDirection = direction => ({ E: 'NE', SE: 'E', SW: 'SE', W: 'SW', NW: 'W', NE: 'NW' })[direction] || direction;
  const directionOrder = ['NE', 'E', 'SE', 'SW', 'W', 'NW'];
  const vertices = Array.from({ length: 6 }, (_, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    return { x: Math.cos(angle) * 31, y: Math.sin(angle) * 31 };
  });
  const point = value => `${value.x},${value.y}`;
  const attackMarkerMarkup = (entry, attackType, psychic) => {
    const match = entry.match(/^([A-Z]+)(?:\((\d+)\))?$/);
    if (!match) return { outlines: '', marker: '' };
    const direction = canonicalDirection(match[1]);
    const damage = Number(match[2] || 1);
    const sideIndex = directionOrder.indexOf(direction);
    if (sideIndex < 0) return { outlines: '', marker: '' };
    const start = vertices[sideIndex], end = vertices[(sideIndex + 1) % 6];
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const tangent = { x: (end.x - start.x) / 31, y: (end.y - start.y) / 31 };
    const outward = { x: middle.x / 26.85, y: middle.y / 26.85 };
    const shooting = attackType === 'shooting';
    const width = shooting ? 16 : 10, reach = shooting ? 9 : 5;
    const a = { x: middle.x - tangent.x * width / 2, y: middle.y - tangent.y * width / 2 };
    const b = { x: middle.x + tangent.x * width / 2, y: middle.y + tangent.y * width / 2 };
    const c = { x: middle.x + outward.x * Math.sqrt(3) * reach, y: middle.y + outward.y * Math.sqrt(3) * reach };
    const centroid = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    let outlines = '';
    for (let layer = 1; layer <= Math.min(3, damage - 1); layer++) {
      const scale = 1 + layer * (shooting ? .4 : .58);
      const points = [a, c, b].map(vertex => point({
        x: centroid.x + (vertex.x - centroid.x) * scale,
        y: centroid.y + (vertex.y - centroid.y) * scale
      })).join(' ');
      outlines += `<polyline class="attack-power-outline" points="${points}"/>`;
    }
    return {
      outlines,
      marker: `<g class="attack-marker faction-token${shooting ? ' shooting-marker' : ''}${psychic ? ' psychic-attack-marker' : ''}" data-direction="${direction}" data-attack-type="${attackType}" data-native-damage="${damage}"><polygon points="${point(a)} ${point(b)} ${point(c)}"/></g>`
    };
  };
  const printedBadgesMarkup = data => {
    const psychic = list(data.keywords).some(keyword => keyword.toLocaleLowerCase() === 'psychic');
    const attacks = [
      ...list(data.shooting_attacks).map(entry => attackMarkerMarkup(entry, 'shooting', psychic)),
      ...list(data.attacks).map(entry => attackMarkerMarkup(entry, 'close', psychic))
    ];
    const initiatives = list(data.initiative).map((initiative, index) =>
      `<g transform="translate(0 ${index * 16})"><g class="initiative-icon"><circle r="7" class="initiative-disc"/><text y=".5" class="initiative-value">${escape(initiative)}</text></g></g>`
    ).join('');
    return {
      outlines: attacks.map(attack => attack.outlines).join(''),
      markers: attacks.map(attack => attack.marker).join(''),
      initiatives: initiatives ? `<g class="initiative-anchor" transform="translate(34 -30)">${initiatives}</g>` : ''
    };
  };

  const markup = (data, context = 'preview', { printedBadges = false } = {}) => {
    const badges = printedBadges ? printedBadgesMarkup(data) : { outlines: '', markers: '', initiatives: '' };
    return `<g class="token-core">${badges.outlines ? `<g class="attack-power-outline-layer">${badges.outlines}</g>` : ''}<polygon points="0,-31 26.85,-15.5 26.85,15.5 0,31 -26.85,15.5 -26.85,-15.5" class="token-ring faction-token${data.kind === 'Leader Token' ? ' leader-token' : ''}"/><polygon points="0,-25 21.65,-12.5 21.65,12.5 0,25 -21.65,12.5 -21.65,-12.5" class="token-inner faction-token"/>${illustrationMarkup(data, context)}${badges.markers}${glyphMarkup(data)}${badges.initiatives}</g>`;
  };

  const bindIllustrationFallback = container => {
    const image = container.querySelector('.token-illustration');
    if (!image) return;
    container.classList.add('has-illustration');
    image.addEventListener('error', event => {
      event.currentTarget.remove();
      container.classList.remove('has-illustration');
    }, { once: true });
  };

  const createSVG = (data, {
    context = 'preview', className = '', color = '', label = '', viewBox = '-48 -52 96 104'
  } = {}) => {
    const svg = root.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('class', className);
    if (label) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', label);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }
    if (color) svg.style.setProperty('--faction-color', color);
    if (data.kind === 'Object Token') svg.classList.add('object-token', `object-${data.object_behavior || 'generic'}`);
    svg.innerHTML = markup({ ...data, instanceId: data.instanceId ?? `wiki-${data.id}` }, context, { printedBadges: true });
    bindIllustrationFallback(svg);
    return svg;
  };

  root.WarbandTokenVisuals = Object.freeze({ markup, createSVG, bindIllustrationFallback });
})(typeof globalThis !== 'undefined' ? globalThis : window);
