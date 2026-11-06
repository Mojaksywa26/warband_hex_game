(() => {
  const STORAGE_KEY = 'warband.custom-warbands.v1';
  const FORMAT = 'warband-deck';
  const VERSION = 1;
  const MAX_WARBAND_CHAMPIONS = 2;

  const normalizeName = name => {
    if (typeof name !== 'string') throw new Error('Warband name must be text.');
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (!normalized) throw new Error('Enter a name for the warband.');
    return normalized;
  };

  const normalizeDeck = deck => {
    if (!Array.isArray(deck)) throw new Error('Warband deck must be an array.');
    const seen = new Set();
    return deck.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('Every deck entry must be an object.');
      }
      const card = typeof entry.card === 'string' ? entry.card.trim() : '';
      if (!/^[a-z0-9_]+$/i.test(card)) throw new Error('Every deck entry needs a valid card ID.');
      if (seen.has(card)) throw new Error(`Duplicate deck entry: ${card}.`);
      seen.add(card);
      if (!Number.isSafeInteger(entry.count) || entry.count < 0) {
        throw new Error(`Card count for ${card} must be a non-negative safe integer.`);
      }
      return { card, count: entry.count };
    }).filter(entry => entry.count > 0);
  };

  const normalizeFaction = faction => {
    if (!Number.isSafeInteger(faction) || faction < 1) {
      throw new Error('Warband faction must be a positive integer.');
    }
    return faction;
  };

  const validateWarbandRoster = tokens => {
    if (!Array.isArray(tokens)) throw new Error('Warband roster must be an array.');
    const champions = tokens.filter(token => token?.kind === 'Champion Token').length;
    if (champions > MAX_WARBAND_CHAMPIONS) {
      throw new Error(`A warband may include no more than ${MAX_WARBAND_CHAMPIONS} Champions; this roster has ${champions}.`);
    }
    return true;
  };

  const createId = () => {
    const suffix = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    return `custom:${suffix}`;
  };

  const readCustomWarbands = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap(record => {
        try {
          if (!record || typeof record.id !== 'string' || !record.id.startsWith('custom:')) return [];
          const fallbackName = `Saved Warband ${record.id.replace(/^custom:/, '').slice(0, 8)}`;
          return [{
            id: record.id,
            name: normalizeName(typeof record.name === 'string' && record.name.trim() ? record.name : fallbackName),
            faction: normalizeFaction(record.faction),
            deck: normalizeDeck(record.deck),
            updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : ''
          }];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  };

  const getCustomWarband = id => readCustomWarbands().find(warband => warband.id === id) || null;

  const saveCustomWarband = warband => {
    const id = typeof warband.id === 'string' && warband.id.startsWith('custom:')
      ? warband.id
      : createId();
    const record = {
      id,
      name: normalizeName(warband.name),
      faction: normalizeFaction(warband.faction),
      deck: normalizeDeck(warband.deck),
      updatedAt: new Date().toISOString()
    };
    const existing = readCustomWarbands();
    const duplicate = existing.find(item => item.id !== id && item.name.toLowerCase() === record.name.toLowerCase());
    if (duplicate) throw new Error(`A saved warband named “${record.name}” already exists. Choose a unique name.`);
    const records = existing.filter(item => item.id !== id);
    records.push(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return record;
  };

  const serializeWarband = warband => JSON.stringify({
    format: FORMAT,
    version: VERSION,
    name: normalizeName(warband.name),
    faction: normalizeFaction(warband.faction),
    deck: normalizeDeck(warband.deck)
  }, null, 2);

  const parseWarband = text => {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('This TXT file does not contain valid warband JSON.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('The warband file must contain a JSON object.');
    }
    if (data.format !== FORMAT) throw new Error(`Unsupported warband format: ${data.format || '(missing)'}.`);
    if (data.version !== VERSION) throw new Error(`Unsupported warband version: ${data.version ?? '(missing)'}.`);
    return {
      name: data.name === undefined ? '' : normalizeName(data.name),
      faction: normalizeFaction(data.faction),
      deck: normalizeDeck(data.deck)
    };
  };

  window.WarbandLibrary = {
    MAX_WARBAND_CHAMPIONS,
    validateWarbandRoster,
    normalizeWarbandName: normalizeName,
    readCustomWarbands,
    getCustomWarband,
    saveCustomWarband,
    serializeWarband,
    parseWarband
  };
})();
