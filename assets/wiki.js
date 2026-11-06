(function exposeWiki(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WarbandWiki = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, root => {
  'use strict';

  const language = () => root.WarbandI18n?.language || 'en';
  const csvText = (row, field) => root.WarbandCSV.text(row, field, language());
  const list = value => root.WarbandCSV.list(value);
  const normalizeSearch = value => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
  const words = value => normalizeSearch(value).split(/\s+/).filter(Boolean);
  const unique = values => [...new Set(values.filter(Boolean))];
  const abilitySummary = row => [
    row.hp && `HP ${row.hp}`,
    row.movement && `Movement ${row.movement}`,
    row.initiative && `Initiative ${row.initiative}`
  ].filter(Boolean).join(' · ');

  // Adding a category means supplying a CSV and this small display adapter.
  // Search, filters, selection, deep links, and source-data display stay shared.
  const categoryRegistry = [
    {
      id: 'concepts', label: 'Concepts', file: 'concepts.csv', idField: 'id',
      name: row => csvText(row, 'name'), type: () => 'Concept',
      keywords: () => [], summary: row => csvText(row, 'short_description'),
      descriptions: row => [
        { title: 'Short description', text: csvText(row, 'short_description') },
        { title: 'Full description', text: csvText(row, 'long_description') }
      ]
    },
    {
      id: 'tokens', label: 'Tokens', file: 'tokens.csv', idField: 'id',
      name: row => csvText(row, 'name'), type: row => csvText(row, 'kind') || 'Token',
      keywords: row => list(row.keywords), summary: abilitySummary,
      descriptions: row => [
        { title: 'Static abilities', text: list(row.static_abilities).join('\n') },
        { title: 'Activated abilities', text: list(row.activated_abilities).join('\n') }
      ]
    },
    {
      id: 'cards', label: 'Cards', file: 'cards.csv', idField: 'id',
      name: row => csvText(row, 'name'), type: row => csvText(row, 'type') || 'Card',
      keywords: row => list(row.keywords), summary: row => csvText(row, 'description'),
      descriptions: row => [
        { title: 'Description', text: csvText(row, 'description') },
        { title: 'Lore', text: csvText(row, 'lore'), className: 'lore' }
      ]
    },
    {
      id: 'abilities', label: 'Abilities', file: 'abilities.csv', idField: 'name',
      name: row => csvText(row, 'display') || row.name, type: () => 'Ability',
      keywords: row => list(row.keywords), summary: row => csvText(row, 'tooltip'),
      descriptions: row => [{ title: 'Ability description', text: csvText(row, 'tooltip') }]
    },
    {
      id: 'keywords', label: 'Keywords', file: 'keywords.csv', idField: 'id',
      name: row => csvText(row, 'display'), type: row => row.category || 'Keyword',
      keywords: () => [], summary: row => csvText(row, 'description'),
      descriptions: row => [{ title: 'Description', text: csvText(row, 'description') }]
    },
    {
      id: 'terrain', label: 'Terrain Effects', file: 'terrain-effects.csv', idField: 'name',
      name: row => csvText(row, 'name'), type: () => 'Terrain Effect',
      keywords: () => [], summary: row => csvText(row, 'description') || row.glyph,
      descriptions: row => [{ title: 'Description', text: csvText(row, 'description') }]
    },
    {
      id: 'factions', label: 'Factions', file: 'factions.csv', idField: 'player',
      name: row => csvText(row, 'name'), type: () => 'Faction',
      keywords: row => list(row.keywords), summary: row => csvText(row, 'leader'),
      descriptions: row => [{ title: 'Leader', text: csvText(row, 'leader') }]
    },
    {
      id: 'attack-rules', label: 'Attack Rules', file: 'attack-rules.csv', idField: 'id',
      name: row => row.id, type: () => 'Attack Rule', keywords: () => [],
      summary: row => `${row.source} · ${row.modifier} ${row.operation} ${row.value}`,
      descriptions: row => [{
        title: 'Rule definition',
        text: `${row.source}\n${row.attack_types} · ${row.target_players} · ${row.modifier} ${row.operation} ${row.value}`
      }]
    }
  ];

  const entryMatches = (entry, filters) => {
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.type && entry.type !== filters.type) return false;
    if (filters.keyword && !entry.keywords.includes(filters.keyword)) return false;
    return words(filters.query).every(word => entry.searchText.includes(word));
  };

  const proseLinkExclusions = new Set([
    'aim', 'battle', 'champion', 'close', 'initiative', 'leader', 'melee',
    'movement', 'object', 'ranged', 'upgrade'
  ].map(normalizeSearch));

  const buildReferenceModel = entries => {
    const candidates = new Map();
    const add = (alias, entry) => {
      const title = String(alias ?? '');
      if (!title || proseLinkExclusions.has(normalizeSearch(title))) return;
      if (!candidates.has(title)) candidates.set(title, new Map());
      candidates.get(title).set(entry.key, entry);
    };
    entries.forEach(entry => add(entry.name, entry));
    const aliases = new Map();
    candidates.forEach((targets, alias) => {
      // An alias shared by different entries is not safe to infer from prose.
      if (targets.size === 1) aliases.set(alias, [...targets.values()][0]);
    });
    const ordered = [...aliases.keys()].sort((a, b) => b.length - a.length);
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = ordered.length
      ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${ordered.map(escape).join('|')})(?![\\p{L}\\p{N}_])`, 'gu')
      : null;
    return {
      resolve: mention => aliases.get(mention) || null,
      pattern
    };
  };

  const descriptionParts = (text, currentKey, references) => {
    const source = String(text ?? '');
    if (!references?.pattern) return [{ text: source, entry: null }];
    const parts = [];
    let lastIndex = 0;
    for (const match of source.matchAll(references.pattern)) {
      const entry = references.resolve(match[0]);
      if (!entry || entry.key === currentKey) continue;
      const index = match.index;
      if (index > lastIndex) parts.push({ text: source.slice(lastIndex, index), entry: null });
      parts.push({ text: match[0], entry });
      lastIndex = index + match[0].length;
    }
    if (lastIndex < source.length) parts.push({ text: source.slice(lastIndex), entry: null });
    return parts.length ? parts : [{ text: source, entry: null }];
  };

  const formatFieldName = field => field
    .replace(/_pl$/, ' (Polish)').replace(/_de$/, ' (German)')
    .replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
    .replace(/^Id\b/, 'ID').replace(/\bAi\b/g, 'AI').replace(/^Hp\b/, 'HP');

  const make = (tag, className, text) => {
    const element = root.document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
  };

  // Preview and article mounts stay independent from catalogue filtering.
  const renderPreview = (entry, mount, factionRows = []) => {
    mount.replaceChildren();
    if (entry?.category !== 'tokens') return;
    const faction = factionRows.find(row => Number(row.player) === Number(entry.row.player));
    const preview = root.WarbandTokenVisuals.createSVG(entry.row, {
      context: 'wiki', className: 'wiki-token-preview', color: faction?.color || '',
      label: `${entry.name} Token preview`
    });
    mount.appendChild(preview);
  };
  const renderSupplementalArticle = (entry, mount) => mount.replaceChildren();

  const boot = async () => {
    const elements = Object.fromEntries([
      'search', 'categories', 'type-filter', 'keyword-filter', 'clear', 'count', 'status',
      'workspace', 'detail', 'detail-close', 'detail-category', 'detail-name', 'detail-type',
      'detail-keywords', 'descriptions', 'source-fields', 'list', 'preview-mount', 'article-mount'
    ].map(id => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), root.document.getElementById(`wiki-${id}`)]));

    const state = { category: '', type: '', keyword: '', query: '', selectedKey: null };
    const rawRows = new Map();
    const keywordRows = () => rawRows.get('keywords') || [];
    let keywordLookup = new Map();
    let entries = [];
    let references = { resolve: () => null, pattern: null };

    const keywordLabel = keywordId => {
      const row = keywordRows().find(keyword => keyword.id === keywordId);
      return row ? csvText(row, 'display') : keywordId;
    };

    const rebuildKeywordLookup = () => {
      keywordLookup = new Map();
      keywordRows().forEach(row => {
        ['id', 'display', 'display_pl', 'display_de'].forEach(field => {
          if (row[field]) keywordLookup.set(normalizeSearch(row[field]), row.id);
        });
      });
    };

    const canonicalKeywords = references => unique(references.map(reference =>
      keywordLookup.get(normalizeSearch(reference)) || reference));

    const buildEntries = () => {
      rebuildKeywordLookup();
      entries = categoryRegistry.flatMap(category => (rawRows.get(category.id) || []).map(row => {
        const sourceId = String(row[category.idField] ?? '');
        const name = category.name(row) || sourceId;
        const type = category.type(row) || category.label;
        const keywords = canonicalKeywords(category.keywords(row));
        const summary = category.summary(row) || '';
        const key = `${category.id}:${sourceId}`;
        const searchText = normalizeSearch([
          name, type, summary, sourceId, category.label,
          ...keywords.map(keywordLabel), ...Object.values(row)
        ].join(' '));
        return { key, sourceId, category: category.id, name, type, keywords, summary, searchText, row,
          hiddenKeyword: category.id === 'keywords' && row.hidden === 'true' };
      }));
      references = buildReferenceModel(entries);
    };

    const entryByKey = key => entries.find(entry => entry.key === key);
    const categoryById = id => categoryRegistry.find(category => category.id === id);

    const keywordChip = keywordId => {
      const row = keywordRows().find(keyword => keyword.id === keywordId);
      const chip = make('span', 'keyword-chip', keywordLabel(keywordId));
      if (row) chip.dataset.keywordId = keywordId;
      const specialMeaning = root.WarbandKeywordTooltips?.meaningFor(keywordId);
      if (specialMeaning) {
        chip.dataset.keywordMeaning = specialMeaning;
        chip.tabIndex = 0;
        chip.setAttribute('aria-description', specialMeaning);
      } else if (csvText(row, 'description')) chip.title = csvText(row, 'description');
      return chip;
    };

    const renderCategories = () => {
      const allButton = make('button', 'wiki-category', 'All entries');
      allButton.type = 'button';
      allButton.dataset.category = '';
      allButton.setAttribute('aria-pressed', String(!state.category));
      const allCount = make('span', 'wiki-category-count', String(entries.length));
      allButton.appendChild(allCount);
      const buttons = categoryRegistry.map(category => {
        const button = make('button', 'wiki-category', category.label);
        button.type = 'button';
        button.dataset.category = category.id;
        button.setAttribute('aria-pressed', String(state.category === category.id));
        const count = entries.filter(entry => entry.category === category.id).length;
        button.appendChild(make('span', 'wiki-category-count', String(count)));
        return button;
      });
      elements.categories.replaceChildren(allButton, ...buttons);
    };

    const fillSelect = (select, values, selected, allLabel, labelFor = value => value) => {
      const available = new Set(values.map(option => option.value));
      if (selected && !available.has(selected)) {
        if (select === elements.typeFilter) state.type = '';
        if (select === elements.keywordFilter) state.keyword = '';
      }
      const options = [new Option(allLabel, ''), ...values.map(option => new Option(option.label, option.value))];
      select.replaceChildren(...options);
      select.value = select === elements.typeFilter ? state.type : state.keyword;
    };

    const renderFilterOptions = () => {
      const types = unique(entries.map(entry => entry.type)).sort((a, b) => a.localeCompare(b));
      const keywords = unique(entries.flatMap(entry => entry.keywords))
        .map(value => ({ value, label: keywordLabel(value) }))
        .sort((a, b) => a.label.localeCompare(b.label));
      fillSelect(elements.typeFilter, types.map(value => ({ value, label: value })), state.type, 'All types');
      fillSelect(elements.keywordFilter, keywords, state.keyword, 'All keywords');
    };

    const filteredEntries = () => entries.filter(entry => entryMatches(entry, state))
      .sort((a, b) => {
        const categoryDifference = categoryRegistry.findIndex(category => category.id === a.category) -
          categoryRegistry.findIndex(category => category.id === b.category);
        return categoryDifference || a.name.localeCompare(b.name);
      });

    const renderList = visible => {
      if (!visible.length) {
        elements.list.replaceChildren(make('p', 'wiki-empty', 'No entries match these filters.'));
        return;
      }
      const groups = categoryRegistry.map(category => ({ category, items: visible.filter(entry => entry.category === category.id) }))
        .filter(group => group.items.length);
      elements.list.replaceChildren(...groups.map(({ category, items }) => {
        const section = make('section', 'wiki-group');
        const heading = make('div', 'wiki-group-heading');
        heading.append(make('h2', '', category.label), make('span', '', `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`));
        const listElement = make('div', 'wiki-entry-list');
        items.forEach(entry => {
          const button = make('button', 'wiki-entry');
          button.type = 'button';
          button.dataset.entryKey = entry.key;
          button.setAttribute('aria-current', String(entry.key === state.selectedKey));
          const type = make('span', 'wiki-entry-type', entry.type);
          if (entry.hiddenKeyword) type.appendChild(make('span', 'keyword-chip wiki-hidden-label', 'Hidden'));
          button.append(make('span', 'wiki-entry-name', entry.name), type);
          if (entry.summary) button.appendChild(make('span', 'wiki-entry-summary', entry.summary));
          listElement.appendChild(button);
        });
        section.append(heading, listElement);
        return section;
      }));
    };

    const renderDetail = () => {
      const entry = entryByKey(state.selectedKey);
      const selected = Boolean(entry);
      elements.workspace.classList.toggle('has-selection', selected);
      elements.detail.hidden = !selected;
      if (!entry) {
        renderPreview(null, elements.previewMount, rawRows.get('factions'));
        renderSupplementalArticle(null, elements.articleMount);
        return;
      }
      const category = categoryById(entry.category);
      elements.detailCategory.textContent = category.label;
      elements.detailName.textContent = entry.name;
      elements.detailType.replaceChildren(root.document.createTextNode(entry.type));
      if (entry.hiddenKeyword) elements.detailType.appendChild(make('span', 'keyword-chip wiki-hidden-label', 'Hidden'));
      elements.detailKeywords.replaceChildren(...entry.keywords.map(keywordChip));
      elements.detailKeywords.hidden = !entry.keywords.length;
      renderPreview(entry, elements.previewMount, rawRows.get('factions'));
      elements.descriptions.replaceChildren(...category.descriptions(entry.row)
        .filter(description => description.text).map(description => {
          const section = make('section', `wiki-description${description.className ? ` ${description.className}` : ''}`);
          const paragraph = make('p');
          descriptionParts(description.text, entry.key, references).forEach(part => {
            if (!part.entry) {
              paragraph.appendChild(root.document.createTextNode(part.text));
              return;
            }
            const link = make('a', 'wiki-reference', part.text);
            link.href = hashFor(part.entry);
            paragraph.appendChild(link);
          });
          section.append(make('h3', '', description.title), paragraph);
          return section;
        }));
      const fields = Object.entries(entry.row).filter(([field, value]) => {
        const localization = field.match(/_(pl|de)$/)?.[1];
        return value !== '' && (!localization || localization === language());
      }).flatMap(([field, value]) => [
        make('dt', '', formatFieldName(field)), make('dd', '', value.split('|').join('\n'))
      ]);
      elements.sourceFields.replaceChildren(...fields);
      renderSupplementalArticle(entry, elements.articleMount);
    };

    const render = () => {
      const visible = filteredEntries();
      elements.count.textContent = `${visible.length} of ${entries.length} entries`;
      elements.categories.querySelectorAll('[data-category]').forEach(button =>
        button.setAttribute('aria-pressed', String(button.dataset.category === state.category)));
      renderList(visible);
      renderDetail();
    };

    const hashFor = entry => `#${entry.category}/${encodeURIComponent(entry.sourceId)}`;
    const selectEntry = (entry, updateHistory = true) => {
      state.selectedKey = entry?.key || null;
      if (updateHistory) {
        const target = entry ? hashFor(entry) : `${root.location.pathname}${root.location.search}`;
        root.history.pushState(null, '', target);
      }
      render();
      if (entry && root.innerWidth <= 900) elements.detail.scrollIntoView({ block: 'start' });
    };

    const applyHash = () => {
      const match = root.location.hash.match(/^#([^/]+)\/(.+)$/);
      if (!match) {
        state.selectedKey = null;
        render();
        return;
      }
      const category = decodeURIComponent(match[1]);
      const sourceId = decodeURIComponent(match[2]);
      selectEntry(entryByKey(`${category}:${sourceId}`) || null, false);
    };

    elements.search.addEventListener('input', () => {
      state.query = elements.search.value;
      render();
    });
    elements.typeFilter.addEventListener('change', () => {
      state.type = elements.typeFilter.value;
      render();
    });
    elements.keywordFilter.addEventListener('change', () => {
      state.keyword = elements.keywordFilter.value;
      render();
    });
    elements.categories.addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      state.category = button.dataset.category;
      render();
    });
    elements.clear.addEventListener('click', () => {
      state.category = state.type = state.keyword = state.query = '';
      elements.search.value = '';
      elements.typeFilter.value = '';
      elements.keywordFilter.value = '';
      render();
    });
    elements.list.addEventListener('click', event => {
      const button = event.target.closest('[data-entry-key]');
      if (button) selectEntry(entryByKey(button.dataset.entryKey));
    });
    elements.detailClose.addEventListener('click', () => selectEntry(null));
    root.addEventListener('hashchange', applyHash);
    root.document.getElementById('language-select')?.addEventListener('change', async event => {
      await root.WarbandI18n?.setLanguage(event.target.value);
    });
    root.document.addEventListener('warband:languagechange', () => {
      buildEntries();
      renderCategories();
      renderFilterOptions();
      render();
    });

    try {
      await Promise.all([
        ...categoryRegistry.map(async category => rawRows.set(category.id, await root.WarbandCSV.readCSV(category.file))),
        root.WarbandI18n?.ready
      ]);
      buildEntries();
      renderCategories();
      renderFilterOptions();
      elements.status.hidden = true;
      elements.workspace.hidden = false;
      applyHash();
      return { entries: entries.length };
    } catch (error) {
      elements.status.dataset.error = 'true';
      elements.status.textContent = `The wiki could not load its CSV data.\n${error.message}`;
      throw error;
    }
  };

  const api = { categoryRegistry, normalizeSearch, entryMatches, buildReferenceModel, descriptionParts, formatFieldName };
  if (root.document) api.ready = boot();
  return Object.freeze(api);
});
