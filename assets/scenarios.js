(() => {
  'use strict';

  const parseCSV = text => {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') { field += '"'; index++; }
        else if (character === '"') quoted = false;
        else field += character;
      } else if (character === '"') quoted = true;
      else if (character === ',') { row.push(field); field = ''; }
      else if (character === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (character !== '\r') field += character;
    }
    row.push(field); rows.push(row);
    const headers = rows.shift().map(header => header.trim());
    return rows.filter(values => values.some(value => value.trim())).map(values =>
      Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]))
    );
  };

  let rowsPromise = null;
  const rows = () => {
    if (!rowsPromise) {
      rowsPromise = fetch('scenarios.csv', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Could not load scenarios.csv: ${response.status}`);
        return response.text();
      }).then(parseCSV).catch(error => {
        rowsPromise = null;
        throw error;
      });
    }
    return rowsPromise;
  };

  const boolean = (value, label) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${label} must be true or false`);
  };
  const integer = (value, label) => {
    if (!/^-?\d+$/.test(value)) throw new Error(`${label} must be an integer`);
    return Number(value);
  };
  const hex = (value, label) => {
    const parts = value.split(',');
    if (parts.length !== 2) throw new Error(`${label} must use q,r coordinates`);
    return { q: integer(parts[0], `${label} q`), r: integer(parts[1], `${label} r`), key: `${Number(parts[0])},${Number(parts[1])}` };
  };
  const player = (value, label) => {
    const number = integer(value, label);
    if (![1, 2].includes(number)) throw new Error(`${label} must be 1 or 2`);
    return number;
  };

  const definitions = allRows => {
    const groups = new Map();
    allRows.forEach((row, index) => {
      const scenario = integer(row.scenario, `Scenario row ${index + 2}`);
      const mission = integer(row.mission, `Mission row ${index + 2}`);
      const id = `${scenario}-${mission}`;
      if (!groups.has(id)) groups.set(id, { id, scenario, mission, rows: [] });
      const group = groups.get(id);
      ['scenario_name', 'mission_name', 'description'].forEach(field => {
        if (row[field]) {
          if (group[field] && group[field] !== row[field]) throw new Error(`Conflicting ${field} values for scenario ${id}`);
          group[field] = row[field];
        }
      });
      group.rows.push({ ...row, rowNumber: index + 2 });
    });
    return [...groups.values()].sort((a, b) => a.scenario - b.scenario || a.mission - b.mission);
  };

  const normalize = definition => {
    const config = {
      id: definition.id,
      scenario: definition.scenario,
      mission: definition.mission,
      scenarioName: definition.scenario_name || `Scenario ${definition.scenario}`,
      missionName: definition.mission_name || `Mission ${definition.mission}`,
      description: definition.description || '',
      players: {
        1: { faction: 1, controller: 'human', personality: 'balanced' },
        2: { faction: 2, controller: 'ai', personality: 'balanced' }
      },
      warband: { 1: [], 2: [] },
      deck: { 1: [], 2: [] },
      hand: { 1: [], 2: [] },
      map: { clearEffects: false, hexes: {} },
      deployment: { mode: 'normal', tokens: [], zones: { 1: null, 2: null } },
      presentation: { battleFast: false, initiativeVisible: null, randomDeployment: true }
    };
    definition.rows.forEach(row => {
      const label = `Scenario ${definition.id}, row ${row.rowNumber}`;
      const target = row.target;
      const value = row.value;
      if (row.type === 'faction' || row.type === 'controller' || row.type === 'ai_personality') {
        const owner = player(target, `${label} target`);
        if (row.type === 'faction') config.players[owner].faction = integer(value, `${label} faction`);
        else if (row.type === 'controller') {
          if (!['human', 'ai'].includes(value)) throw new Error(`${label} controller must be human or ai`);
          config.players[owner].controller = value;
        } else {
          if (!['offensive', 'defensive', 'balanced', 'chaotic'].includes(value)) throw new Error(`${label} has an unknown AI personality`);
          config.players[owner].personality = value;
        }
      } else if (/^(tokens|deck)\.(set|add|remove|replace)$/.test(row.type)) {
        const [collection, operation] = row.type.split('.');
        const owner = player(target, `${label} target`);
        config[collection === 'tokens' ? 'warband' : 'deck'][owner].push({ operation, value, rowNumber: row.rowNumber });
      } else if (row.type === 'hand.ensure') {
        const owner = player(target, `${label} target`);
        if (!value) throw new Error(`${label} needs at least one card`);
        config.hand[owner].push(...value.split('|').map(item => item.trim()).filter(Boolean));
      } else if (row.type === 'map.clear_effects') {
        config.map.clearEffects = boolean(value, `${label} value`);
      } else if (row.type === 'map.hex') {
        const coordinates = hex(target, `${label} target`);
        const changes = {};
        value.split('|').filter(Boolean).forEach(assignment => {
          const separator = assignment.indexOf('=');
          if (separator < 1) throw new Error(`${label} map assignments must use field=value`);
          const field = assignment.slice(0, separator);
          if (!['terrain', 'effects', 'icon', 'terrain_pl', 'terrain_de'].includes(field)) throw new Error(`${label} cannot modify map field ${field}`);
          changes[field] = assignment.slice(separator + 1);
        });
        config.map.hexes[coordinates.key] = { ...(config.map.hexes[coordinates.key] || {}), ...changes };
      } else if (row.type === 'deployment.mode') {
        if (!['normal', 'random', 'fixed'].includes(value)) throw new Error(`${label} mode must be normal, random, or fixed`);
        config.deployment.mode = value;
      } else if (row.type === 'deployment.token') {
        const reference = target.split(':');
        if (![2, 3].includes(reference.length)) throw new Error(`${label} target must use player:token_id or player:token_id:copy`);
        const placement = value.split(':');
        if (placement.length > 2) throw new Error(`${label} value must use q,r or q,r:rotation`);
        const copy = reference.length === 3 ? integer(reference[2], `${label} copy`) : 0;
        if (copy < 0) throw new Error(`${label} copy cannot be negative`);
        config.deployment.tokens.push({
          player: integer(reference[0], `${label} player`),
          tokenId: integer(reference[1], `${label} Token id`),
          copy,
          ...hex(placement[0], `${label} hex`),
          rotation: placement.length === 2 ? integer(placement[1], `${label} rotation`) : 0,
          rowNumber: row.rowNumber
        });
      } else if (row.type === 'deployment.zone') {
        const owner = player(target, `${label} target`);
        if (!value) throw new Error(`${label} needs at least one hex`);
        config.deployment.zones[owner] = value.split('|').map(item => hex(item, `${label} zone`).key);
      } else if (row.type.startsWith('ui.')) {
        const enabled = boolean(value, `${label} value`);
        if (row.type === 'ui.battle_fast') config.presentation.battleFast = enabled;
        else if (row.type === 'ui.initiative_visible') config.presentation.initiativeVisible = enabled;
        else if (row.type === 'ui.random_deployment') config.presentation.randomDeployment = enabled;
        else throw new Error(`${label} has unknown modifier ${row.type}`);
      } else {
        throw new Error(`${label} has unknown modifier ${row.type || '(blank)'}`);
      }
    });
    if (config.players[1].faction === config.players[2].faction) throw new Error(`Scenario ${config.id} players must use different factions`);
    return config;
  };

  const list = async () => {
    const allRows = await rows();
    return allRows.length ? definitions(allRows).map(definition => ({
      id: definition.id,
      scenario: definition.scenario,
      mission: definition.mission,
      scenarioName: definition.scenario_name || `Scenario ${definition.scenario}`,
      missionName: definition.mission_name || `Mission ${definition.mission}`,
      description: definition.description || ''
    })) : [];
  };
  const get = async id => {
    const definition = definitions(await rows()).find(item => item.id === id);
    if (!definition) throw new Error(`Unknown scenario ${id}`);
    return normalize(definition);
  };

  window.WarbandScenarios = Object.freeze({ list, get });
})();
