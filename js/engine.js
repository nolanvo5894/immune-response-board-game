// Immune Response — game rules. Pure logic, no DOM, so it can run in Node for balance sims.

// Zones sit in rough anatomical order (x/y in % of the board): head at the top, then neck, chest,
// abdomen and pelvis, with Skin out on the arm and Bone at the thigh. The body's right is the viewer's left.
// Blood vessels follow the arteries; the 4 lymph nodes form one central chain like the thoracic duct.
// Every tissue drains into one regional node (its "sentinel" node).
export const ZONES = [
  { id: 'brain',    name: 'Brain',    x: 50, y: 8,  region: 'neck_node' },
  { id: 'throat',   name: 'Throat',   x: 50, y: 22, region: 'neck_node' },
  { id: 'lung',     name: 'Lung',     x: 31, y: 34, region: 'chest_node' },
  { id: 'heart',    name: 'Heart',    x: 56, y: 36, region: 'chest_node' },
  { id: 'skin',     name: 'Skin',     x: 89, y: 52, region: 'chest_node' },
  { id: 'liver',    name: 'Liver',    x: 30, y: 48, region: 'gut_node' },
  { id: 'stomach',  name: 'Stomach',  x: 66, y: 48, region: 'gut_node' },
  { id: 'kidney',   name: 'Kidney',   x: 17, y: 61, region: 'gut_node' },
  { id: 'pancreas', name: 'Pancreas', x: 70, y: 62, region: 'gut_node' },
  { id: 'colon',    name: 'Colon',    x: 35, y: 71, region: 'groin_node' },
  { id: 'bladder',  name: 'Bladder',  x: 54, y: 78, region: 'groin_node' },
  { id: 'bone',     name: 'Bone',     x: 33, y: 89, region: 'groin_node' },
  { id: 'neck_node',  name: 'Neck Node',   x: 69, y: 20, node: true },
  { id: 'chest_node', name: 'Armpit Node', x: 80, y: 33, node: true },
  { id: 'gut_node',   name: 'Gut Node',    x: 48, y: 57, node: true },
  { id: 'groin_node', name: 'Groin Node',  x: 72, y: 81, node: true },
];
export const TISSUE = ZONES.filter(z => !z.node).map(z => z.id);
export const NODES = ZONES.filter(z => z.node).map(z => z.id);
export const ALL = ZONES.map(z => z.id);
export const regionOf = id => ZONES.find(z => z.id === id).region;
export const isNode = id => NODES.includes(id);

const BLOOD = [
  ['brain', 'throat'], ['throat', 'lung'], ['throat', 'heart'], ['throat', 'skin'], ['lung', 'heart'],
  ['heart', 'liver'], ['heart', 'skin'], ['liver', 'kidney'], ['liver', 'stomach'], ['stomach', 'pancreas'],
  ['pancreas', 'bladder'], ['kidney', 'colon'], ['colon', 'bladder'], ['bladder', 'bone'],
];
export const BASE_EDGES = [
  ...BLOOD.map(([a, b]) => [a, b, 'blood']),
  ...TISSUE.map(z => [z, regionOf(z), 'lymph']),
  ['neck_node', 'chest_node', 'lymph'], ['chest_node', 'gut_node', 'lymph'], ['gut_node', 'groin_node', 'lymph'],
];
export const START = { dendritic: 'neck_node', killer_t: 'chest_node', nk: 'gut_node', macrophage: 'groin_node' };

export const ROLES = {
  dendritic: {
    name: 'Dendritic Cell', color: '#b9a3ff',
    power: 'Scan reveals every hidden cell here and 1 in each linked zone. Present carries the antigen to a clean lymph node and activates the Killer T cell. Moves up to 2 zones per Move.',
    weakness: 'Cannot attack.',
  },
  killer_t: {
    name: 'Killer T Cell', color: '#3fd0c9',
    power: 'Attack destroys up to 2 revealed cancer cells.',
    weakness: 'Only hits revealed cells. A PD-L1 Shield exhausts it; at 3 exhaustion it cannot attack. Gets +2 actions on the turn after the Dendritic Cell presents.',
  },
  nk: {
    name: 'NK Cell', color: '#ff5fa8',
    power: 'Attack destroys 1 hidden cancer cell. NK cells find cells that are hiding.',
    weakness: 'Cannot hit revealed cells. Only 1 cell per attack.',
  },
  macrophage: {
    name: 'Macrophage', color: '#ffb23f',
    power: 'Attack destroys 1 revealed cell. Clean removes a Shield or Treg token.',
    weakness: 'Weak attack.',
  },
};
export const ROLE_ORDER = ['dendritic', 'killer_t', 'nk', 'macrophage'];

export const CYTOKINES = {
  fever:     { name: 'Fever',          count: 5, text: 'Gain 2 extra actions this turn.', target: null },
  ifng:      { name: 'Interferon-γ',   count: 4, text: 'Reveal every hidden cancer cell in your zone.', target: null },
  chemokine: { name: 'Chemokine',      count: 4, text: 'Pull any other player to your zone.', target: 'player' },
  il2:       { name: 'Interleukin-2',  count: 3, text: 'Remove all exhaustion from the Killer T cell. Gain 1 extra action.', target: null },
  tnf:       { name: 'TNF-α',          count: 4, text: 'Destroy 1 revealed cancer cell in your zone or an adjacent zone.', target: 'zone' },
  inflame:   { name: 'Inflammation',   count: 4, text: 'Remove 1 Shield or Treg token from any zone.', target: 'zone' },
};

export const MUTATIONS = {
  pdl1:    { name: 'PD-L1 Shield',  img: 'mut_pdl1',    text: 'The tumor raises a Shield. The Killer T cell gains 1 exhaustion each time it attacks there.' },
  antigen: { name: 'Antigen Loss',  img: 'mut_antigen', text: 'The tumor drops its disguise. All revealed cells there become hidden again.' },
  angio:   { name: 'Angiogenesis',  img: 'mut_angio',   text: 'The tumor grows a new blood vessel to a distant zone and sends 1 hidden cell through it.' },
  treg:    { name: 'Treg Recruit',  img: 'mut_treg',    text: 'Regulatory T cells guard the tumor. Every attack there costs 2 actions.' },
};

export const DIFFICULTY = {
  easy:   { label: 'Easy',   metLimit: +(globalThis.process?.env?.ME || 5), startRate: 2, primary: 4, seeds: 2 },
  normal: { label: 'Normal', metLimit: +(globalThis.process?.env?.MN || 4), startRate: 2, primary: 5, seeds: 3 },
  hard:   { label: 'Hard',   metLimit: +(globalThis.process?.env?.MH || 3), startRate: 2, primary: 5, seeds: 4 },
};

export const SUPPLY = 40;      // cancer cubes in the box
export const ZONE_MAX = +(globalThis.process?.env?.ZMAX || 5);     // one more cell overflows into the regional lymph node
export const NODE_MAX = +(globalThis.process?.env?.NMAX || 3);     // one more cell breaks out of the node: distant metastasis
export const MET_CARDS = +(globalThis.process?.env?.METC || 3);
export const ACTIVATE = +(globalThis.process?.env?.ACT || 2);     // extra Killer T actions after the Dendritic Cell presents
export const INVADE = +(globalThis.process?.env?.INV || 4);    // a neighbour needs this many cells to invade an empty zone
export const GROW = +(globalThis.process?.env?.GROW || 3);        // cubes added when a tumor zone grows
export const HAND_MAX = 5;
export const ACTIONS = 4;
export const MAX_CYCLES = 3;   // the tumor deck may be reshuffled twice; the third empty deck loses

// ---------- RNG ----------
// The RNG state lives in the game object (s.rs), so a game can be saved as JSON and restored.
export function attachRng(s) {
  Object.defineProperty(s, 'r', { enumerable: false, configurable: true, value: () => {
    s.rs = (s.rs + 0x6d2b79f5) >>> 0;
    let t = s.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  } });
  return s;
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function shuffle(r, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- setup ----------
export function createGame({ roles = ROLE_ORDER, difficulty = 'normal', seed = Date.now() } = {}) {
  const diff = DIFFICULTY[difficulty];
  const s = {
    v: 3, seed, difficulty, rs: seed >>> 0,
    zones: Object.fromEntries(ZONES.map(z => [z.id, { hidden: 0, revealed: 0, shield: false, treg: false }])),
    edges: BASE_EDGES.map(e => [...e]),
    players: roles.map(role => ({ role, zone: START[role], exhaustion: 0, hand: [], antigen: false })),
    activated: false,
    current: 0,
    actionsLeft: ACTIONS,
    metastasis: 0,
    metLimit: diff.metLimit,
    rate: diff.startRate,
    cycles: 1,
    round: 1,
    tumorDeck: [], tumorDiscard: [],
    mutDeck: [], cytoDeck: [], cytoDiscard: [],
    log: [],
    over: null, // { win: bool, reason }
    lastMutation: null,
  };
  attachRng(s);
  const r = s.r;
  for (const z of TISSUE) s.tumorDeck.push({ kind: 'grow', zone: z }, { kind: 'grow', zone: z });
  for (let i = 0; i < 4; i++) s.tumorDeck.push({ kind: 'mutation' });
  for (let i = 0; i < MET_CARDS; i++) s.tumorDeck.push({ kind: 'metastasis' });
  shuffle(r, s.tumorDeck);
  s.mutDeck = shuffle(r, Object.keys(MUTATIONS).flatMap(k => [k, k]));
  s.cytoDeck = shuffle(r, Object.entries(CYTOKINES).flatMap(([k, c]) => Array(c.count).fill(k)));

  const primary = pick(r, TISSUE);
  s.primary = primary;
  s.zones[primary].hidden = diff.primary;
  const nb = neighbors(s, primary, 'blood');
  for (const z of nb) s.zones[z].hidden = 2;
  // micro-tumors: cells that already escaped to other regions
  const far = TISSUE.filter(t => regionOf(t) !== regionOf(primary) && !nb.includes(t));
  for (const z of shuffle(r, far).slice(0, diff.seeds)) s.zones[z].hidden = 2;
  for (const p of s.players) { drawCyto(s, p); drawCyto(s, p); }
  log(s, 'setup', `A tumor has formed somewhere in the body. Your cells wait in the lymph nodes.`);
  return s;
}

// ---------- queries ----------
// kind: 'blood' | 'lymph' | undefined (both)
export function neighbors(s, z, kind) {
  const out = [];
  for (const [a, b, k] of s.edges) {
    if (kind && k !== kind) continue;
    if (a === z) out.push(b); else if (b === z) out.push(a);
  }
  return out;
}
export const cubes = (s, z) => s.zones[z].hidden + s.zones[z].revealed;
export const boardTotal = s => ALL.reduce((n, z) => n + cubes(s, z), 0);
export const cleanNode = (s, z) => isNode(z) && cubes(s, z) === 0;
export const player = s => s.players[s.current];

function within(s, from, steps) {
  const seen = new Set([from]); let frontier = [from];
  for (let i = 0; i < steps; i++) {
    const next = [];
    for (const z of frontier) for (const n of neighbors(s, z)) if (!seen.has(n)) { seen.add(n); next.push(n); }
    frontier = next;
  }
  seen.delete(from);
  return [...seen];
}
export const moveTargets = (s, p = player(s)) => within(s, p.zone, p.role === 'dendritic' ? 2 : 1);

export function attackCost(s, p = player(s)) { return s.zones[p.zone].treg ? 2 : 1; }

export function canDo(s, type) {
  if (s.over) return false;
  const p = player(s), z = s.zones[p.zone];
  switch (type) {
    case 'move': return s.actionsLeft >= 1;
    case 'scan': return s.actionsLeft >= 1 && (z.hidden > 0 || (p.role === 'dendritic' && neighbors(s, p.zone).some(n => s.zones[n].hidden > 0)));
    case 'attack': {
      if (s.actionsLeft < attackCost(s, p)) return false;
      if (p.role === 'dendritic') return false;
      if (p.role === 'killer_t') return z.revealed > 0 && p.exhaustion < 3;
      if (p.role === 'nk') return z.hidden > 0;
      return z.revealed > 0;
    }
    case 'clean': return p.role === 'macrophage' && s.actionsLeft >= 1 && (z.shield || z.treg);
    case 'rest': return s.actionsLeft >= 1 && cleanNode(s, p.zone) && p.exhaustion > 0;
    case 'present': return p.role === 'dendritic' && p.antigen && s.actionsLeft >= 1 && cleanNode(s, p.zone);
    case 'give': return s.actionsLeft >= 1 && p.hand.length > 0 && s.players.some(o => o !== p && o.zone === p.zone && o.hand.length < HAND_MAX);
  }
  return false;
}

// ---------- logging ----------
function log(s, kind, text) { s.log.push({ kind, text, round: s.round }); }

// ---------- player actions ----------
export function act(s, a) {
  if (s.over) return false;
  const p = player(s), z = s.zones[p.zone], R = ROLES[p.role].name;
  switch (a.type) {
    case 'move': {
      if (!canDo(s, 'move') || !moveTargets(s, p).includes(a.to)) return false;
      p.zone = a.to; s.actionsLeft--;
      log(s, 'move', `${R} moved to the ${zoneName(a.to)}.`);
      break;
    }
    case 'scan': {
      if (!canDo(s, 'scan')) return false;
      let n = Math.min(z.hidden, p.role === 'dendritic' ? 99 : 1);
      z.hidden -= n; z.revealed += n; s.actionsLeft--;
      if (p.role === 'dendritic') for (const nb of neighbors(s, p.zone)) {
        const Z = s.zones[nb]; if (Z.hidden) { Z.hidden--; Z.revealed++; n++; }
      }
      if (p.role === 'dendritic' && n > 0) p.antigen = true;
      log(s, 'scan', `${R} revealed ${n} cancer cell${n > 1 ? 's' : ''}${p.role === 'dendritic' ? ' in and around' : ' in'} the ${zoneName(p.zone)}.`);
      break;
    }
    case 'attack': {
      if (!canDo(s, 'attack')) return false;
      s.actionsLeft -= attackCost(s, p);
      let killed = 0;
      if (p.role === 'killer_t') { killed = Math.min(2, z.revealed); z.revealed -= killed; }
      else if (p.role === 'nk') { z.hidden--; killed = 1; }
      else { z.revealed--; killed = 1; }
      log(s, 'attack', `${R} destroyed ${killed} cancer cell${killed > 1 ? 's' : ''} in the ${zoneName(p.zone)}.`);
      if (p.role === 'killer_t' && z.shield) {
        p.exhaustion++;
        log(s, 'bad', `The PD-L1 Shield exhausts the Killer T cell (${p.exhaustion}/3).`);
      }
      break;
    }
    case 'clean': {
      if (!canDo(s, 'clean')) return false;
      const what = z.shield ? 'shield' : 'treg';
      z[what] = false; s.actionsLeft--;
      log(s, 'clean', `Macrophage cleared the ${what === 'shield' ? 'PD-L1 Shield' : 'Treg guard'} in the ${zoneName(p.zone)}.`);
      break;
    }
    case 'rest': {
      if (!canDo(s, 'rest')) return false;
      p.exhaustion = Math.max(0, p.exhaustion - 2); s.actionsLeft--;
      log(s, 'rest', `${R} rested in the ${zoneName(p.zone)} (exhaustion ${p.exhaustion}/3).`);
      break;
    }
    case 'present': {
      if (!canDo(s, 'present')) return false;
      p.antigen = false; s.actionsLeft--; s.activated = true;
      for (const o of s.players) if (o.role === 'killer_t') o.exhaustion = 0;
      log(s, 'present', `${R} presented the tumor antigen in the ${zoneName(p.zone)}. The Killer T cell is activated: exhaustion cleared, +${ACTIVATE} actions on its next turn.`);
      break;
    }
    case 'give': {
      const to = s.players[a.to];
      if (!canDo(s, 'give') || !to || to === p || to.zone !== p.zone || to.hand.length >= HAND_MAX) return false;
      const [card] = p.hand.splice(a.card, 1);
      if (!card) return false;
      to.hand.push(card); s.actionsLeft--;
      log(s, 'give', `${R} signalled ${CYTOKINES[card].name} to the ${ROLES[to.role].name}.`);
      break;
    }
    case 'play': return playCard(s, a);
    default: return false;
  }
  checkWin(s);
  return true;
}

export function cardTargets(s, key, p = player(s)) {
  switch (key) {
    case 'chemokine': return s.players.map((o, i) => i).filter(i => s.players[i] !== p && s.players[i].zone !== p.zone);
    case 'tnf': return [p.zone, ...neighbors(s, p.zone)].filter(z => s.zones[z].revealed > 0);
    case 'inflame': return ALL.filter(z => s.zones[z].shield || s.zones[z].treg);
    case 'ifng': return s.zones[p.zone].hidden > 0 ? [true] : [];
    case 'il2': return [true];
    case 'fever': return [true];
  }
  return [];
}

function playCard(s, a) {
  const p = player(s), key = p.hand[a.card];
  if (!key || !cardTargets(s, key, p).length) return false;
  const c = CYTOKINES[key], z = s.zones[p.zone];
  switch (key) {
    case 'fever': s.actionsLeft += 2; break;
    case 'ifng': z.revealed += z.hidden; z.hidden = 0; break;
    case 'il2': {
      s.actionsLeft += 1;
      for (const o of s.players) if (o.role === 'killer_t') o.exhaustion = 0;
      break;
    }
    case 'chemokine': {
      if (!cardTargets(s, key, p).includes(a.target)) return false;
      s.players[a.target].zone = p.zone; break;
    }
    case 'tnf': {
      if (!cardTargets(s, key, p).includes(a.target)) return false;
      s.zones[a.target].revealed--; break;
    }
    case 'inflame': {
      if (!cardTargets(s, key, p).includes(a.target)) return false;
      const t = s.zones[a.target];
      if (t.shield) t.shield = false; else t.treg = false;
      break;
    }
  }
  p.hand.splice(a.card, 1);
  s.cytoDiscard.push(key);
  log(s, 'card', `${ROLES[p.role].name} played ${c.name}.`);
  checkWin(s);
  return true;
}

function drawCyto(s, p) {
  if (!s.cytoDeck.length) { s.cytoDeck = shuffle(s.r, s.cytoDiscard); s.cytoDiscard = []; }
  const c = s.cytoDeck.pop();
  if (!c) return;
  if (p.hand.length < HAND_MAX) p.hand.push(c); else s.cytoDiscard.push(c);
}

// ---------- end of turn + cancer phase ----------
// Returns the list of tumor cards resolved, for the UI to animate.
export function endTurn(s) {
  if (s.over) return [];
  const p = player(s);
  drawCyto(s, p);
  const resolved = [];
  for (let i = 0; i < s.rate && !s.over; i++) resolved.push(resolveTumorCard(s));
  if (!s.over) checkWin(s);
  if (s.over) return resolved;
  s.current = (s.current + 1) % s.players.length;
  if (s.current === 0) s.round++;
  s.actionsLeft = ACTIONS;
  if (player(s).role === 'killer_t' && s.activated) {
    s.actionsLeft += ACTIVATE; s.activated = false;
    log(s, 'present', `The activated Killer T cell starts with ${s.actionsLeft} actions.`);
  }
  return resolved;
}

function drawTumor(s) {
  if (!s.tumorDeck.length) {
    if (s.cycles >= MAX_CYCLES) { lose(s, 'Time ran out. The tumor became too advanced to stop.'); return null; }
    s.tumorDeck = shuffle(s.r, s.tumorDiscard); s.tumorDiscard = [];
    s.cycles++; s.rate++;
    log(s, 'bad', `The tumor deck reshuffles. Cancer now grows faster: ${s.rate} cards per turn.`);
  }
  const c = s.tumorDeck.pop();
  s.tumorDiscard.push(c);
  return c;
}

function biggest(s) {
  const max = Math.max(...TISSUE.map(z => cubes(s, z)));
  return pick(s.r, TISSUE.filter(z => cubes(s, z) === max));
}

function resolveTumorCard(s) {
  const c = drawTumor(s);
  if (!c) return { kind: 'timeout' };
  const out = { ...c };
  if (c.kind === 'grow') {
    const z = c.zone;
    if (cubes(s, z) > 0) {
      log(s, 'grow', `The tumor in the ${zoneName(z)} grows (+${GROW}).`);
      out.events = addCubes(s, z, GROW); out.effect = 'grow';
    } else if (neighbors(s, z, 'blood').some(n => cubes(s, n) >= INVADE)) {
      log(s, 'grow', `Cancer invades the ${zoneName(z)} through a blood vessel (+1).`);
      out.events = addCubes(s, z, 1); out.effect = 'invade';
    } else {
      log(s, 'calm', `Healthy ${zoneName(z)} tissue resists. Nothing happens.`); out.effect = 'none';
    }
  } else if (c.kind === 'mutation') {
    if (!s.mutDeck.length) s.mutDeck = shuffle(s.r, Object.keys(MUTATIONS).flatMap(k => [k, k]));
    const m = s.mutDeck.pop(), z = biggest(s), Z = s.zones[z];
    out.mutation = m; out.zone = z; s.lastMutation = { mutation: m, zone: z };
    log(s, 'mutation', `Mutation! ${MUTATIONS[m].name} in the ${zoneName(z)}.`);
    if (m === 'pdl1') { if (Z.shield) out.events = addCubes(s, z, 1); Z.shield = true; }
    if (m === 'antigen') { Z.hidden += Z.revealed; Z.revealed = 0; }
    if (m === 'treg') { if (Z.treg) out.events = addCubes(s, z, 1); Z.treg = true; }
    if (m === 'angio') {
      const far = TISSUE.filter(t => t !== z && regionOf(t) !== regionOf(z) && !neighbors(s, z, 'blood').includes(t));
      if (far.length) {
        const empty = far.filter(t => cubes(s, t) === 0);
        const t = pick(s.r, empty.length ? empty : far);
        s.edges.push([z, t, 'blood']); out.to = t;
        log(s, 'bad', `A new blood vessel links the ${zoneName(z)} to the ${zoneName(t)}.`);
        out.events = addCubes(s, t, 1);
      }
    }
  } else if (c.kind === 'metastasis') {
    // Step 2: a node that already holds cancer lets a cell escape to another region.
    const nodeMax = Math.max(...NODES.map(n => cubes(s, n)));
    if (nodeMax > 0) {
      const n = pick(s.r, NODES.filter(x => cubes(s, x) === nodeMax));
      takeCube(s, n);
      out.zone = n; out.effect = 'breakout';
      out.to = breakout(s, n);
      out.events = addCubes(s, out.to, 1);
    } else {
      // Step 1: a big tumor sends a cell into its sentinel lymph node.
      const z = biggest(s);
      if (cubes(s, z) >= 3) {
        takeCube(s, z);
        const n = regionOf(z);
        out.zone = z; out.to = n; out.effect = 'sentinel';
        log(s, 'bad', `A cell leaves the ${zoneName(z)} through a lymph vessel and lodges in the ${zoneName(n)}.`);
        out.events = addCubes(s, n, 1);
      } else {
        log(s, 'calm', `Metastasis fails. No tumor is big enough to break away.`); out.effect = 'none';
      }
    }
  }
  return out;
}

// A cell escapes a lymph node and travels in the blood to a tissue in another region.
function breakout(s, node) {
  const far = TISSUE.filter(t => regionOf(t) !== node);
  const empty = far.filter(t => cubes(s, t) === 0);
  const t = pick(s.r, empty.length ? empty : far);
  log(s, 'bad', `Metastasis! A cell breaks out of the ${zoneName(node)} and seeds the ${zoneName(t)}.`);
  bumpMet(s);
  return t;
}

function takeCube(s, z) { const Z = s.zones[z]; if (Z.hidden) Z.hidden--; else Z.revealed--; }

// Adds hidden cells. A full tissue drains the extra cell into its lymph node; a full node lets it break out.
// Returns a list of spread events for the UI.
function addCubes(s, z, n, chain = new Set(), events = []) {
  for (let i = 0; i < n && !s.over; i++) {
    if (boardTotal(s) >= SUPPLY) { lose(s, 'The cancer used up every cell in the supply. The body is overwhelmed.'); return events; }
    const max = isNode(z) ? NODE_MAX : ZONE_MAX;
    if (cubes(s, z) < max) { s.zones[z].hidden++; continue; }
    if (chain.has(z)) continue;
    chain.add(z);
    if (!isNode(z)) {
      const node = regionOf(z);
      log(s, 'bad', `The ${zoneName(z)} overflows. A cell drains into the ${zoneName(node)}.`);
      events.push({ from: z, to: node, kind: 'drain' });
      addCubes(s, node, 1, chain, events);
    } else {
      const t = breakout(s, z);
      events.push({ from: z, to: t, kind: 'breakout' });
      addCubes(s, t, 1, chain, events);
    }
  }
  return events;
}

function bumpMet(s) {
  s.metastasis++;
  if (s.metastasis >= s.metLimit) lose(s, 'Metastasis reached its limit. Cancer escaped the lymph nodes and spread through the body.');
}

function lose(s, reason) { if (!s.over) { s.over = { win: false, reason }; log(s, 'lose', reason); } }
function checkWin(s) {
  if (!s.over && boardTotal(s) === 0) { s.over = { win: true, reason: 'Every cancer cell is gone. The body is healthy again!' }; log(s, 'win', s.over.reason); }
}

export const zoneName = id => ZONES.find(z => z.id === id).name;

// ---------- tutorial ----------
// A fixed board and a stacked tumor deck, so the guided first game always plays out the same way.
export function createTutorial() {
  const s = createGame({ difficulty: 'easy', seed: 4242 });
  for (const z of ALL) Object.assign(s.zones[z], { hidden: 0, revealed: 0, shield: false, treg: false });
  s.zones.throat.hidden = 3; s.zones.lung.hidden = 2; s.zones.colon.hidden = 2;
  s.primary = 'throat';
  // first eight tumor cards, in draw order: 2 per turn
  const script = [
    { kind: 'grow', zone: 'kidney' }, { kind: 'grow', zone: 'throat' },
    { kind: 'mutation' }, { kind: 'metastasis' },
    { kind: 'grow', zone: 'bone' }, { kind: 'grow', zone: 'heart' },
    { kind: 'grow', zone: 'skin' }, { kind: 'grow', zone: 'liver' },
  ];
  const rest = [...s.tumorDeck];
  for (const c of script) rest.splice(rest.findIndex(d => d.kind === c.kind && d.zone === c.zone), 1);
  s.tumorDeck = [...rest, ...script.reverse()]; // pop() draws from the end
  s.mutDeck = [...s.mutDeck.filter((m, i, a) => !(m === 'pdl1' && a.indexOf('pdl1') === i)), 'pdl1'];
  const hands = { dendritic: ['ifng', 'chemokine'], killer_t: ['il2', 'tnf'], nk: ['fever', 'tnf'], macrophage: ['inflame', 'fever'] };
  s.cytoDeck.push(...s.players.flatMap(p => p.hand));
  for (const p of s.players) {
    p.hand = hands[p.role];
    for (const k of p.hand) s.cytoDeck.splice(s.cytoDeck.indexOf(k), 1);
  }
  s.log = [{ kind: 'setup', text: 'Tutorial: a tumor has formed. Follow the coach.', round: 1 }];
  s.tutorial = 0;
  return s;
}
