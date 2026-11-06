/* Demo 5: side-effect-free, one-step AI forecasting. No DOM or game-loop access. */
(function exposeFuturesight(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WarbandFuturesight = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const VERSION = '1.0.0';
  const DIRECTIONS = Object.freeze(['NE', 'E', 'SE', 'SW', 'W', 'NW']);
  const VECTORS = Object.freeze([[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]]);
  const DEFAULTS = Object.freeze({
    weight: 0.5,
    maximumBonus: 2,
    hp: 1.1,
    attack: 0.22,
    mobility: 0.05,
    threat: 0.18,
    scrap: 0.08,
    actions: 0.03
  });
  const SETTABLE_TOKEN_FIELDS = new Set([
    'hp', 'maxHP', 'alive', 'visible', 'q', 'r', 'rotation', 'movement', 'player',
    'baseInitiatives', 'ignoreShields', 'piercing', 'exhausted'
  ]);
  const ADDABLE_TOKEN_FIELDS = new Set([
    'hp', 'maxHP', 'movement', 'movementBonus', 'initiativeBonus', 'closeBonus', 'shootingBonus',
  ]);
  const keyOf = (q, r) => `${q},${r}`;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const copyAttacks = attacks => (attacks || []).map(attack => ({
    direction: attack.direction,
    damage: finite(attack.damage, 1)
  }));
  const copyHex = hex => ({
    q: Number(hex.q), r: Number(hex.r), effects: [...(hex.effects || [])]
  });
  const copyRoad = road => {
    const copy = { q: Number(road.q), r: Number(road.r), player: Number(road.player) };
    if (![copy.q, copy.r, copy.player].every(Number.isFinite)) throw new Error('Forecast Road needs finite q, r, and player values');
    return copy;
  };
  const copyToken = (token, index) => ({
    index,
    player: Number(token.player || 0),
    kind: token.kind || 'Object Token',
    objectBehavior: token.objectBehavior || '',
    coOccupancy: Boolean(token.coOccupancy),
    battleInert: Boolean(token.battleInert),
    directDamageTargetable: token.directDamageTargetable !== false,
    exhausted: Boolean(token.exhausted),
    maxHP: Math.max(0, finite(token.maxHP)),
    hp: Math.max(0, finite(token.hp)),
    alive: Boolean(token.alive),
    visible: Boolean(token.visible),
    q: Number.isFinite(token.q) ? token.q : null,
    r: Number.isFinite(token.r) ? token.r : null,
    rotation: ((finite(token.rotation) % 360) + 360) % 360,
    movement: Math.max(0, finite(token.movement)),
    movementBonus: finite(token.movementBonus),
    baseInitiatives: [...(token.baseInitiatives || [])],
    initiativeBonus: finite(token.initiativeBonus),
    close: copyAttacks(token.close),
    shooting: copyAttacks(token.shooting),
    closeBonus: finite(token.closeBonus),
    shootingBonus: finite(token.shootingBonus),
    shields: [...(token.shields || [])],
    ignoreShields: Boolean(token.ignoreShields),
    piercing: Boolean(token.piercing),
    incomingReduction: Math.max(0, finite(token.incomingReduction))
  });

  // All dynamic and static forecast inputs are copied. Projections never retain
  // mutable references to the caller's live game objects.
  const createSnapshot = model => ({
    activePlayer: Number(model.activePlayer),
    actionsRemaining: Math.max(0, finite(model.actionsRemaining)),
    scrapPoints: Math.max(0, finite(model.scrapPoints)),
    hexes: (model.hexes || []).map(copyHex),
    roads: (model.roads || []).map(copyRoad),
    tokens: (model.tokens || []).map(copyToken)
  });

  const applyAttackAdditions = (token, attackType, additions) => {
    const attacks = token[attackType];
    (additions || []).forEach(addition => {
      if (!DIRECTIONS.includes(addition.direction)) throw new Error(`Invalid forecast attack direction ${addition.direction}`);
      const damage = finite(addition.damage, 1);
      const existing = attacks.find(attack => attack.direction === addition.direction);
      if (existing) existing.damage += damage;
      else attacks.push({ direction: addition.direction, damage });
    });
  };

  // A prediction is plain data: focusIndices, patches, roadsAdded, scrapGained.
  // Action and Scrap costs come from the candidate, not from provider mutations.
  const project = (snapshot, prediction = {}, costs = {}) => {
    const next = createSnapshot(snapshot);
    next.actionsRemaining = Math.max(0, next.actionsRemaining - Math.max(0, finite(costs.actionCost)));
    next.scrapPoints = Math.max(0, next.scrapPoints - Math.max(0, finite(costs.scrapCost)) + finite(prediction.scrapGained));
    (prediction.patches || []).forEach(patch => {
      if (!Number.isInteger(patch.index)) throw new Error(`Forecast patch has invalid Token index ${patch.index}`);
      const token = next.tokens[patch.index];
      if (!token) throw new Error(`Forecast patch references missing Token ${patch.index}`);
      Object.entries(patch.set || {}).forEach(([field, value]) => {
        if (!SETTABLE_TOKEN_FIELDS.has(field)) throw new Error(`Unsupported forecast Token field ${field}`);
        token[field] = Array.isArray(value) ? [...value] : value;
      });
      Object.entries(patch.add || {}).forEach(([field, value]) => {
        if (!ADDABLE_TOKEN_FIELDS.has(field)) throw new Error(`Unsupported additive forecast Token field ${field}`);
        if (!Number.isFinite(value)) throw new Error(`Non-finite additive forecast value for ${field}`);
        token[field] = finite(token[field]) + value;
      });
      applyAttackAdditions(token, 'close', patch.addClose);
      applyAttackAdditions(token, 'shooting', patch.addShooting);
      token.hp = clamp(finite(token.hp), 0, token.maxHP);
      token.alive = Boolean(token.alive) && token.hp > 0;
      if (!token.alive) token.hp = 0;
      token.visible = Boolean(token.visible) && token.alive;
      token.movement = Math.max(0, token.movement);
      token.incomingReduction = Math.max(0, token.incomingReduction);
    });
    (prediction.roadsAdded || []).forEach(road => {
      const copy = copyRoad(road);
      if (!next.roads.some(existing => existing.q === copy.q && existing.r === copy.r && existing.player === copy.player)) {
        next.roads.push(copy);
      }
    });
    return next;
  };

  const occupancyRank = token => token.kind !== 'Object Token' ? 2 : token.objectBehavior === 'disgraceful_sprout' ? 1 : 0;
  const occupancyFor = snapshot => {
    const occupancy = new Map();
    snapshot.tokens.forEach((token, index) => {
      if (!token.alive || !token.visible || token.q === null || token.r === null) return;
      const key = keyOf(token.q, token.r);
      const previousIndex = occupancy.get(key);
      const previous = previousIndex === undefined ? null : snapshot.tokens[previousIndex];
      // Roads and Sprouts may share a combat Token's hex. Prefer the combat
      // occupant, then a targetable Sprout, over a non-blocking Road.
      if (!previous || occupancyRank(token) > occupancyRank(previous)) occupancy.set(key, index);
    });
    return occupancy;
  };
  const hexMapFor = snapshot => new Map(snapshot.hexes.map(hex => [keyOf(hex.q, hex.r), hex]));
  const localSide = (impactDirection, targetRotation) => {
    const impactIndex = DIRECTIONS.indexOf(impactDirection);
    const rotationSteps = Math.round((((targetRotation % 360) + 360) % 360) / 60) % 6;
    return DIRECTIONS[(impactIndex - rotationSteps + 6) % 6];
  };

  // Lightweight base-attack geometry for opportunity evaluation. It is not a
  // replacement for the full Battle resolver and never claims to be one.
  const attackEventsAt = (snapshot, attackerIndex, rotation, occupancy, hexMap, targetOnly = undefined) => {
    const attacker = snapshot.tokens[attackerIndex];
    if (!attacker?.alive || !attacker.visible || attacker.exhausted || attacker.battleInert ||
        attacker.q === null || attacker.kind === 'Object Token') return [];
    const events = [];
    ['close', 'shooting'].forEach(attackType => {
      const bonus = attackType === 'close' ? attacker.closeBonus : attacker.shootingBonus;
      attacker[attackType].forEach(attack => {
        const localIndex = DIRECTIONS.indexOf(attack.direction);
        if (localIndex < 0) return;
        const rotationSteps = Math.round(rotation / 60) % 6;
        const globalIndex = (localIndex + rotationSteps + 6) % 6;
        const [dq, dr] = VECTORS[globalIndex];
        for (let step = 1; ; step++) {
          const q = attacker.q + dq * step;
          const r = attacker.r + dr * step;
          const targetHex = hexMap.get(keyOf(q, r));
          if (!targetHex) break;
          const occupantIndex = occupancy.get(keyOf(q, r));
          const target = occupantIndex === undefined ? null : snapshot.tokens[occupantIndex];
          if (target?.alive && target.visible) {
            const piercingShot = attackType === 'shooting' && attacker.piercing;
            const targetable = piercingShot
              ? target.directDamageTargetable && !target.battleInert
              : !target.battleInert && target.player !== attacker.player &&
                (target.kind !== 'Object Token' || target.objectBehavior === 'disgraceful_sprout');
            if (targetable) {
              if ((target.kind !== 'Object Token' || piercingShot || target.objectBehavior === 'disgraceful_sprout') &&
                  (targetOnly === undefined || occupantIndex === targetOnly)) {
                const impactDirection = DIRECTIONS[(globalIndex + 3) % 6];
                const side = localSide(impactDirection, target.rotation);
                const shielded = !attacker.ignoreShields && target.shields.includes(side);
                let damage = Math.max(0, attack.damage + bonus - (shielded ? Math.min(1, attack.damage + bonus) : 0));
                damage = Math.max(0, damage - target.incomingReduction);
                if (attackType === 'shooting' && targetHex.effects.some(effect => effect === 'Foliage' || effect === 'Dense Foliage')) {
                  damage = Math.max(0, damage - (targetHex.effects.includes('Dense Foliage') ? 2 : 1));
                }
                events.push({ attackerIndex, targetIndex: occupantIndex, attackType, direction: attack.direction, damage });
              }
              if (!piercingShot) break;
            }
          }
          if (attackType === 'close') break;
        }
      });
    });
    return events;
  };

  const initiativeCount = token => Math.max(0, token.baseInitiatives.length + Math.floor(token.initiativeBonus));
  const bestRotationAttack = (snapshot, tokenIndex, occupancy, hexMap, targetOnly = undefined) => {
    const token = snapshot.tokens[tokenIndex];
    const activations = initiativeCount(token);
    if (!activations || !token.alive || !token.visible || token.exhausted) return 0;
    let best = 0;
    for (let rotation = 0; rotation < 360; rotation += 60) {
      const attacker = snapshot.tokens[tokenIndex];
      const damage = attackEventsAt(snapshot, tokenIndex, rotation, occupancy, hexMap, targetOnly)
        .reduce((sum, event) => {
          const target = snapshot.tokens[event.targetIndex];
          return sum + event.damage * (target.player === attacker.player ? -1 : 1);
        }, 0);
      best = Math.max(best, damage);
    }
    return best * activations;
  };

  const mobilityFor = (snapshot, tokenIndex, occupancy, hexMap) => {
    const token = snapshot.tokens[tokenIndex];
    if (!token?.alive || !token.visible || token.exhausted || token.q === null || token.kind === 'Object Token') {
      return { openHexes: 0, roadLinks: 0, effectiveMovement: 0, value: 0 };
    }
    let openHexes = 0;
    let roadLinks = 0;
    VECTORS.forEach(([dq, dr]) => {
      const q = token.q + dq;
      const r = token.r + dr;
      if (!hexMap.has(keyOf(q, r))) return;
      const occupantIndex = occupancy.get(keyOf(q, r));
      const occupant = occupantIndex === undefined ? null : snapshot.tokens[occupantIndex];
      if (!occupant || occupantIndex === tokenIndex || occupant.coOccupancy) openHexes++;
      if (snapshot.roads.some(road => road.q === q && road.r === r && road.player === token.player)) roadLinks++;
    });
    const effectiveMovement = Math.max(0, token.movement + token.movementBonus);
    return {
      openHexes, roadLinks, effectiveMovement,
      value: openHexes + Math.min(2, roadLinks) * 0.5 + effectiveMovement * 0.1
    };
  };

  const tokenFeatures = (snapshot, tokenIndex, occupancy, hexMap) => {
    const token = snapshot.tokens[tokenIndex];
    if (!token) return { attack: 0, threat: 0, mobility: 0, hpRatio: 0 };
    const attack = bestRotationAttack(snapshot, tokenIndex, occupancy, hexMap);
    const mobility = mobilityFor(snapshot, tokenIndex, occupancy, hexMap);
    const threat = snapshot.tokens.reduce((sum, enemy, enemyIndex) => {
      if (!enemy.alive || !enemy.visible || enemy.player === token.player || enemy.kind === 'Object Token') return sum;
      return sum + bestRotationAttack(snapshot, enemyIndex, occupancy, hexMap, tokenIndex);
    }, 0);
    return {
      attack, threat, mobility: mobility.value,
      mobilityDetails: mobility,
      hpRatio: token.alive && token.maxHP > 0 ? clamp(token.hp / token.maxHP, 0, 1) : 0,
    };
  };

  // Evaluate only Tokens affected by the candidate. Enemy values have opposite
  // sign; enemy incoming threat is omitted to avoid double-counting a kill.
  const evaluate = (snapshot, focusIndices = [], config = DEFAULTS) => {
    const occupancy = occupancyFor(snapshot);
    const hexMap = hexMapFor(snapshot);
    const unique = [...new Set(focusIndices.filter(index => Number.isInteger(index) && snapshot.tokens[index]))];
    const byToken = unique.map(index => {
      const token = snapshot.tokens[index];
      const features = tokenFeatures(snapshot, index, occupancy, hexMap);
      const allied = token.player === snapshot.activePlayer;
      const alignment = allied ? 1 : -1;
      const threatValue = allied ? features.threat * config.threat : 0;
      const value = alignment * (features.hpRatio * config.hp + features.attack * config.attack +
        features.mobility * config.mobility) - threatValue;
      return { index, player: token.player, allied, features, value };
    });
    const resources = snapshot.scrapPoints * config.scrap + snapshot.actionsRemaining * config.actions;
    return {
      total: byToken.reduce((sum, token) => sum + token.value, 0) + resources,
      byToken,
      resources,
      focusIndices: unique
    };
  };

  const opportunityBonus = (before, after, config = DEFAULTS) => {
    const delta = after.total - before.total;
    const raw = delta * config.weight;
    return {
      delta, raw,
      value: clamp(raw, -config.maximumBonus, config.maximumBonus),
      clamped: raw > config.maximumBonus || raw < -config.maximumBonus
    };
  };

  // Decision-state fingerprint used by the non-visual Demo 5 QA hooks.
  const fingerprint = snapshot => JSON.stringify({
    activePlayer: snapshot.activePlayer,
    actionsRemaining: snapshot.actionsRemaining,
    scrapPoints: snapshot.scrapPoints,
    hexes: snapshot.hexes.map(copyHex).sort((a, b) => keyOf(a.q, a.r).localeCompare(keyOf(b.q, b.r))),
    roads: snapshot.roads.map(copyRoad).sort((a, b) => keyOf(a.q, a.r).localeCompare(keyOf(b.q, b.r)) || a.player - b.player),
    tokens: snapshot.tokens.map(token => ({
      player: token.player, kind: token.kind, objectBehavior: token.objectBehavior,
      coOccupancy: token.coOccupancy, battleInert: token.battleInert,
      directDamageTargetable: token.directDamageTargetable, exhausted: token.exhausted, maxHP: token.maxHP,
      hp: token.hp, alive: token.alive, visible: token.visible, q: token.q, r: token.r,
      rotation: token.rotation, movement: token.movement, baseInitiatives: token.baseInitiatives,
      closeBonus: token.closeBonus, shootingBonus: token.shootingBonus,
      movementBonus: token.movementBonus, initiativeBonus: token.initiativeBonus,
      shields: token.shields, ignoreShields: token.ignoreShields, piercing: token.piercing,
      close: token.close, shooting: token.shooting
    }))
  });

  const runInvariantTests = () => {
    const tests = [];
    const check = (name, condition) => tests.push({ name, ok: Boolean(condition) });
    const base = createSnapshot({
      activePlayer: 1, actionsRemaining: 3, scrapPoints: 0,
      hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 0, r: 1 }],
      tokens: [
        { player: 1, kind: 'Unit Token', maxHP: 4, hp: 4, alive: true, visible: true, q: 0, r: 0,
          baseInitiatives: [3], movement: 2, close: [{ direction: 'E', damage: 1 }] },
        { player: 2, kind: 'Unit Token', maxHP: 2, hp: 2, alive: true, visible: true, q: 1, r: 0,
          baseInitiatives: [2], movement: 1, close: [{ direction: 'W', damage: 1 }] }
      ]
    });
    const original = fingerprint(base);
    const damaged = project(base, { focusIndices: [1], patches: [{ index: 1, set: { hp: 0, alive: false, visible: false } }] }, { actionCost: 1 });
    check('projection leaves its source snapshot untouched', fingerprint(base) === original);
    check('projection pays candidate Action cost', damaged.actionsRemaining === 2);
    check('zero-HP projection is not alive or visible', !damaged.tokens[1].alive && !damaged.tokens[1].visible);
    const before = evaluate(base, [0, 1]);
    const after = evaluate(damaged, [0, 1]);
    check('enemy casualty improves forecast value', after.total > before.total);
    const repeat = project(base, { focusIndices: [1], patches: [{ index: 1, set: { hp: 0, alive: false, visible: false } }] }, { actionCost: 1 });
    check('identical predictions are deterministic', evaluate(repeat, [0, 1]).total === after.total);
    const road = project(base, { roadsAdded: [{ q: 0, r: 1, player: 2 }] });
    check('enemy Road projection does not increase mobility', mobilityFor(road, 0, occupancyFor(road), hexMapFor(road)).roadLinks === 0);
    const alliedRoad = project(base, { roadsAdded: [{ q: 0, r: 1, player: 1 }] });
    check('allied Road projection increases combat Token mobility', mobilityFor(alliedRoad, 0, occupancyFor(alliedRoad), hexMapFor(alliedRoad)).roadLinks === 1);
    const exhausted = project(base, { patches: [{ index: 0, set: { exhausted: true } }] });
    check('Exhaustion removes forecast attacks and mobility',
      bestRotationAttack(exhausted, 0, occupancyFor(exhausted), hexMapFor(exhausted)) === 0 &&
      mobilityFor(exhausted, 0, occupancyFor(exhausted), hexMapFor(exhausted)).value === 0);
    const bounded = opportunityBonus({ total: 0 }, { total: 100 });
    const boundedBelow = opportunityBonus({ total: 0 }, { total: -100 });
    check('future bonus is bounded', bounded.value === DEFAULTS.maximumBonus && bounded.clamped &&
      boundedBelow.value === -DEFAULTS.maximumBonus && boundedBelow.clamped);
    const extraInitiative = project(base, { patches: [{ index: 0, add: { initiativeBonus: 1 } }] });
    check('extra Initiative increases forecast attack opportunities',
      bestRotationAttack(extraInitiative, 0, occupancyFor(extraInitiative), hexMapFor(extraInitiative)) === 2);
    const damageBuff = project(base, { patches: [{ index: 0, add: { closeBonus: 1 } }] });
    check('additive damage bonuses project without rejection',
      damageBuff.tokens[0].closeBonus === 1 && bestRotationAttack(damageBuff, 0, occupancyFor(damageBuff), hexMapFor(damageBuff)) === 2);
    const line = createSnapshot({
      activePlayer: 1, actionsRemaining: 3, scrapPoints: 0,
      hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
      tokens: [
        { player: 1, kind: 'Unit Token', maxHP: 3, hp: 3, alive: true, visible: true, q: 0, r: 0,
          baseInitiatives: [3], shooting: [{ direction: 'E', damage: 1 }] },
        { player: 1, kind: 'Unit Token', maxHP: 3, hp: 3, alive: true, visible: true, q: 1, r: 0 },
        { player: 2, kind: 'Unit Token', maxHP: 3, hp: 3, alive: true, visible: true, q: 2, r: 0, shields: ['W'] }
      ]
    });
    const lineEvents = attackEventsAt(line, 0, 0, occupancyFor(line), hexMapFor(line));
    check('ordinary shooting passes allies and checks the impact-side Shield',
      lineEvents.length === 1 && lineEvents[0].targetIndex === 2 && lineEvents[0].damage === 0);
    const denseLine = createSnapshot({
      ...line,
      hexes: line.hexes.map(hex => hex.q === 2 && hex.r === 0 ? { ...hex, effects: ['Dense Foliage'] } : hex),
      tokens: line.tokens.map((token, index) => index === 0
        ? { ...token, ignoreShields: true, shooting: [{ direction: 'E', damage: 3 }] } : token)
    });
    const denseEvents = attackEventsAt(denseLine, 0, 0, occupancyFor(denseLine), hexMapFor(denseLine));
    check('Dense Foliage reduces shooting damage by 2', denseEvents.length === 1 && denseEvents[0].damage === 1);
    const shared = createSnapshot({
      activePlayer: 1, actionsRemaining: 3, scrapPoints: 0, hexes: [{ q: 0, r: 0 }],
      tokens: [
        { player: 1, kind: 'Unit Token', maxHP: 3, hp: 3, alive: true, visible: true, q: 0, r: 0 },
        { player: 0, kind: 'Object Token', objectBehavior: 'disgraceful_sprout', coOccupancy: true,
          maxHP: 1, hp: 1, alive: true, visible: true, q: 0, r: 0 }
      ]
    });
    check('co-occupant Objects do not replace combat occupancy', occupancyFor(shared).get('0,0') === 0);
    const healed = project(base, { patches: [{ index: 0, set: { hp: 99 } }] });
    check('projected healing remains capped at maximum HP', healed.tokens[0].hp === healed.tokens[0].maxHP);
    let invalidPatchRejected = false;
    try { project(base, { patches: [{ index: 0, add: { closeBonsu: 1 } }] }); }
    catch { invalidPatchRejected = true; }
    check('misspelled or unsupported patch fields are rejected', invalidPatchRejected);
    return { ok: tests.every(test => test.ok), tests };
  };

  return Object.freeze({
    VERSION, DIRECTIONS, VECTORS, DEFAULTS,
    createSnapshot, project, evaluate, opportunityBonus, fingerprint,
    occupancyFor, hexMapFor, mobilityFor, attackEventsAt, bestRotationAttack,
    runInvariantTests
  });
});
