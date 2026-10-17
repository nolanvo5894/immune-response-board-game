import * as E from './engine.js?v=9';

const $ = id => document.getElementById(id);
const ART = n => `art/${n}.webp?v=5`; // bump v when art changes, so browsers drop cached images
const SAVE = 'immune-response-save';
const CARD_ART = k => `cy_${k}`;
// Flat board-game icons for organs and nodes (Codex image, transparent background).
// Organs get a white icon; lymph nodes get none (their green ring is enough).
const glyph = id => (E.isNode(id) ? '' : `<img class="glyph" src="${ART(`ico_${id}`)}" alt="">`);
const ZD = Object.fromEntries(E.ZONES.map(z => [z.id, z]));
const VB_H = 105; // floor viewBox height for a width of 100 (the floor is 1 : 1.05)

let G = null;          // game state
let mode = null;       // null | {type:'card', idx} | {type:'give-pick'} | {type:'give-to', idx}
let difficulty = 'normal';
let hover = null;      // zone id under the pointer (desktop), shown in the inspector
let focus = null;      // highlighted set: { key, ids: Set, edge(a, b) } for a space and its neighbors, or a node's region
let flash = new Set(); // zones the cancer just changed

// ---------- persistence ----------
function save() {
  try { if (G && !G.over) localStorage.setItem(SAVE, JSON.stringify(G)); else localStorage.removeItem(SAVE); } catch {}
}
function loadSaved() {
  // saves from older maps (v1 one node, v2 ring) do not fit the body map
  try { const raw = localStorage.getItem(SAVE); const g = raw && JSON.parse(raw); return g?.v === 3 ? E.attachRng(g) : null; } catch { return null; }
}

// ---------- welcome + setup ----------
function renderStart() {
  $('team').innerHTML = E.ROLE_ORDER.map(r => `
    <article class="role-card" style="--c:var(--${r})">
      <img src="${ART(r)}" alt="${E.ROLES[r].name}">
      <div><h3 style="color:var(--${r})">${E.ROLES[r].name}</h3>
      <p><b>${E.ROLES[r].power}</b></p><p>${E.ROLES[r].weakness}</p></div>
    </article>`).join('');
  const blurb = Object.fromEntries(Object.entries(E.DIFFICULTY).map(([k, d]) => [k, `${d.metLimit} metastases${k === 'hard' ? ', more tumors' : ''}`]));
  $('diff').innerHTML = Object.entries(E.DIFFICULTY).map(([k, d]) =>
    `<button type="button" data-d="${k}" aria-pressed="${k === difficulty}">${d.label}<small>${blurb[k]}</small></button>`).join('');
}
function renderWelcome() {
  $('hero').style.backgroundImage = `url(${ART('title')})`;
  $('resume').hidden = !loadSaved();
}
$('diff').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  difficulty = b.dataset.d; renderStart();
});
$('go').addEventListener('click', () => { begin(E.createGame({ difficulty, seed: (Math.random() * 2 ** 32) >>> 0 })); turnBanner(); });
$('learn').addEventListener('click', () => begin(E.createTutorial()));
$('playnow').addEventListener('click', () => show('start'));
$('back').addEventListener('click', () => show('welcome'));
$('resume').addEventListener('click', () => { const s = loadSaved(); if (s) begin(s); });
$('quit').addEventListener('click', () => confirmSheet('Start a new game?', 'Your current game will be lost.', 'New game', () => {
  G = null; save(); show('welcome');
}));
$('rulesbtn').addEventListener('click', () => {
  sheet(`<div class="rules-sheet"><h2>How to play</h2>${$('rules-text').innerHTML.replace('<div class="label">How a turn works</div>', '')}</div>
    <div class="row"><button class="big" id="cont">Back to the game</button></div>`);
  $('cont').onclick = closeSheet;
});

function begin(state) {
  G = state; mode = null; hover = null; focus = null; flash = new Set();
  show('game');
  render();
}
function show(which) {
  for (const id of ['welcome', 'start', 'game']) $(id).hidden = which !== id;
  document.body.classList.toggle('playing', which === 'game');
  document.body.dataset.screen = which;
  if (which === 'start') renderStart();
  if (which === 'welcome') renderWelcome();
  if (which !== 'game') $('coach').hidden = true;
  window.scrollTo(0, 0);
}

// ---------- rendering ----------
function render() {
  const p = E.player(G);
  renderTurn(p);
  renderThreat();
  renderNodes();
  renderRoster();
  renderBoard(p);
  renderMe(p);
  renderInspect();
  renderActions(p);
  renderHand(p);
  $('hint').textContent = typeof G.tutorial === 'number' ? '' : hintText(p);
  renderCoach();
  save();
}

function renderTurn(p) {
  const t = $('turn');
  t.style.setProperty('--c', `var(--${p.role})`);
  t.innerHTML = `<img src="${ART(p.role)}" alt=""><span>Round ${G.round}</span><b>${E.ROLES[p.role].name}</b><span>${G.actionsLeft} action${G.actionsLeft === 1 ? '' : 's'} left</span>`;
}

function renderThreat() {
  $('s-round').textContent = `${E.DIFFICULTY[G.difficulty].label} · round ${G.round}`;
  $('s-met').innerHTML = Array.from({ length: G.metLimit }, (_, i) => `<i class="${i < G.metastasis ? 'on' : ''}">${i + 1}</i>`).join('');
  $('s-met').title = `${G.metastasis} of ${G.metLimit}`;
  $('s-metcap').textContent = `${G.metastasis} of ${G.metLimit}`;
  const total = E.boardTotal(G);
  $('s-cells').textContent = `${total} / ${E.SUPPLY}`;
  $('s-cellbar').style.width = `${(100 * total) / E.SUPPLY}%`;
  const deckSize = G.tumorDeck.length + G.tumorDiscard.length;
  $('s-deck').textContent = `${G.tumorDeck.length} left`;
  $('s-deckbar').style.width = `${(100 * G.tumorDeck.length) / deckSize}%`;
  $('s-rate').textContent = `Deck ${G.cycles} of ${E.MAX_CYCLES}. The cancer draws ${G.rate} cards after every turn, and 1 more each reshuffle.`;
}

function renderNodes() {
  $('nodes').innerHTML = E.NODES.map(n => {
    const c = E.cubes(G, n), drains = E.TISSUE.filter(t => E.regionOf(t) === n).map(E.zoneName).join(', ');
    return `<li class="${c ? 'inv' : ''}" data-node="${n}" title="Drains the ${drains}">
      <span class="ig node">${glyph(n)}</span>
      <div><b>${E.zoneName(n).replace(' Node', '')}</b><span class="st ${c ? 'bad' : 'ok'}">${c ? `${c} cell${c > 1 ? 's' : ''}` : 'Clean'}</span></div>
    </li>`;
  }).join('');
}

function roleChips(o) {
  const chips = [];
  if (o.role === 'killer_t' && o.exhaustion) chips.push(`<span class="chip warn" title="Exhaustion ${o.exhaustion} of 3">Tired ${o.exhaustion}/3</span>`);
  if (o.role === 'killer_t' && G.activated) chips.push('<span class="chip" title="Activated: +2 actions next turn">Active</span>');
  if (o.role === 'dendritic' && o.antigen) chips.push('<span class="chip gold" title="Carrying antigen">Antigen</span>');
  return chips.join('');
}

function renderRoster() {
  const pickable = matePicks();
  $('mates').innerHTML = G.players.map((o, i) => `
    <button class="mate ${i === G.current ? 'now' : ''} ${pickable.includes(i) ? 'pick' : ''}" data-p="${i}" style="--c:var(--${o.role})" ${pickable.length && !pickable.includes(i) ? 'disabled' : ''}>
      <img src="${ART(o.role)}" alt="">
      <div><b>${E.ROLES[o.role].name}${i === G.current ? ' · now' : ''}</b>
      <span class="where">${E.zoneName(o.zone)} · ${o.hand.length} card${o.hand.length === 1 ? '' : 's'} ${roleChips(o)}</span></div>
    </button>`).join('');
}

// Quadratic curve from a to b that bends around other tokens (viewBox units: 100 wide, 150 tall).
function vesselPath(a, b, obstacles) {
  const P = id => ({ x: ZD[id].x, y: ZD[id].y * VB_H / 100 });
  const A = P(a), B = P(b);
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const nx = -(B.y - A.y) / L, ny = (B.x - A.x) / L;
  const obs = obstacles.filter(o => o.id !== a && o.id !== b);
  for (const k of [0, 5, -5, 9, -9, 13, -13, 18, -18, 24, -24]) {
    const cx = mx + nx * k, cy = my + ny * k;
    let clear = true;
    for (let t = 0.1; t <= 0.9 && clear; t += 0.04) {
      const x = (1 - t) ** 2 * A.x + 2 * t * (1 - t) * cx + t * t * B.x;
      const y = (1 - t) ** 2 * A.y + 2 * t * (1 - t) * cy + t * t * B.y;
      clear = obs.every(o => Math.hypot(x - o.x, y - o.y) > o.r);
    }
    if (clear) return `M${A.x} ${A.y} Q${cx} ${cy} ${B.x} ${B.y}`;
  }
  return `M${A.x} ${A.y} L${B.x} ${B.y}`;
}

// Hero standees stand in front of the pad; cancer tokens in an arc behind it (cqw offsets from the zone point).
const HERO_SPOTS = [[[0, 1.2]], [[-3.2, 1.2], [3.2, 1.2]], [[-4.2, 1.8], [0, -.4], [4.2, 1.8]], [[-4.8, 1.8], [-1.6, -.6], [1.6, -.6], [4.8, 1.8]]];
const cancerSpot = (i, n) => {
  const a = Math.PI * (1.1 + (n === 1 ? .4 : (.8 * i) / (n - 1)));
  return [Math.cos(a) * 5, Math.sin(a) * 4 - .6];
};

function renderBoard(p) {
  const board = $('board');
  board.classList.toggle('focus', !!focus);
  const obstacles = E.ZONES.map(z => ({ id: z.id, x: z.x, y: z.y * VB_H / 100, r: z.node ? 4.6 : 5.6 }));
  const base = new Set(E.BASE_EDGES.map(e => e.join()));
  const inRegion = id => !!focus && focus.ids.has(id);
  const paths = G.edges.map(([a, b, k]) => {
    const trunk = E.isNode(a) && E.isNode(b);
    const on = !!focus && focus.edge(a, b, k);
    return `<path class="${k}${trunk ? ' trunk' : ''}${base.has([a, b, k].join()) ? '' : ' new'}${on ? ' on' : ''}" d="${vesselPath(a, b, obstacles)}"/>`;
  }).join('');

  const moves = mode ? [] : (G.actionsLeft ? E.moveTargets(G, p) : []);
  const cardZones = mode?.type === 'card' && E.CYTOKINES[p.hand[mode.idx]].target === 'zone' ? E.cardTargets(G, p.hand[mode.idx], p) : [];
  const at = (dx, dy) => `left:${dx}cqw;top:${dy}cqw`;

  const zones = E.ZONES.map(zd => {
    const z = G.zones[zd.id], n = E.cubes(G, zd.id);
    const here = G.players.map((o, i) => ({ o, i })).filter(x => x.o.zone === zd.id);
    const lit = n > 0 || moves.includes(zd.id) || cardZones.includes(zd.id) || hover === zd.id || inRegion(zd.id);
    const cls = ['zone', zd.node ? 'node' : '', zd.node && n ? 'involved' : '', !zd.node && n >= 3 ? 'hot' : '', n ? 'sick' : '', lit ? 'lit' : '',
      moves.includes(zd.id) ? 'can' : '', cardZones.includes(zd.id) ? 'target' : '', flash.has(zd.id) ? 'flash' : '',
      focus && !inRegion(zd.id) ? 'dim' : ''].join(' ');
    const cells = [...Array(z.revealed).fill('r'), ...Array(z.hidden).fill('h')];
    const cancer = cells.map((k, i) => { const [dx, dy] = cancerSpot(i, cells.length);
      return `<span class="up ct ${k === 'h' ? 'h' : ''}" style="${at(dx, dy)}"><img src="${ART(k === 'h' ? 'cancer_hidden' : 'cancer')}" alt=""></span>`; }).join('');
    const spots = HERO_SPOTS[Math.min(here.length, 4) - 1] || [];
    const heroes = here.map((x, i) => { const [dx, dy] = spots[i]; const me = x.i === G.current ? 'me' : '';
      return `<span class="base ${me}" style="--c:var(--${x.o.role});${at(dx, dy)}"></span>
        <span class="up sd ${me}" style="--c:var(--${x.o.role});${at(dx, dy)}"><img src="${ART(x.o.role)}" alt="${E.ROLES[x.o.role].name}"></span>`; }).join('');
    const toks = (z.shield ? '<span class="tok shield">PD-L1</span>' : '') + (z.treg ? '<span class="tok treg">Treg</span>' : '');
    const label = `${zd.name}: ${z.hidden} hidden, ${z.revealed} revealed${z.shield ? ', PD-L1 Shield' : ''}${z.treg ? ', Treg guard' : ''}${moves.includes(zd.id) ? '. Click to move here' : ''}`;
    const r = zd.node ? 4.1 : 5;
    return `<button class="${cls}" data-z="${zd.id}" style="left:${zd.x}%;top:${zd.y}%" aria-label="${label}">
      <span class="disc">${glyph(zd.id)}</span>
      ${cancer}${heroes}
      ${toks ? `<span class="up anchor" style="${at(-r - .6, -.4)}"><span class="toks">${toks}</span></span>` : ''}
      <span class="up anchor" style="${at(0, r + 2.2)}"><span class="name">${zd.name}</span></span>
    </button>`;
  }).join('');
  board.innerHTML = `<div class="floor" style="background-image:url(${ART('board')})"><svg viewBox="0 0 100 ${VB_H}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>${zones}</div>`;
}

function renderMe(p) {
  const R = E.ROLES[p.role], me = $('me');
  me.style.setProperty('--c', `var(--${p.role})`);
  const ex = p.role === 'killer_t'
    ? `<div class="pips">Exhaustion ${Array.from({ length: 3 }, (_, i) => `<i class="${i < p.exhaustion ? 'ex' : 'off'}"></i>`).join('')}</div>` : '';
  const extra = p.role === 'dendritic'
    ? `<div class="pips">${p.antigen ? '<span class="chip gold">Carrying antigen: Present it in a clean lymph node</span>' : 'No antigen yet. Scan a tumor to pick one up.'}${G.activated ? '<span class="chip">Killer T activated</span>' : ''}</div>` : '';
  me.innerHTML = `<img src="${ART(p.role)}" alt="">
    <div><h3>${R.name}</h3><p><b>${R.power}</b> ${R.weakness}</p>
    <div class="pips">Actions ${Array.from({ length: Math.max(E.ACTIONS, G.actionsLeft) }, (_, i) => `<i class="${i < G.actionsLeft ? '' : 'off'}"></i>`).join('')}</div>${ex}${extra}</div>`;
}

// The inspector explains the zone under the pointer, or the active cell's own zone.
function renderInspect() {
  const p = E.player(G), id = hover || p.zone, zd = ZD[id], z = G.zones[id], n = E.cubes(G, id);
  const who = G.players.filter(o => o.zone === id).map(o => E.ROLES[o.role].name);
  const lines = [];
  if (zd.node) {
    lines.push(`Lymph node for the ${E.TISSUE.filter(t => E.regionOf(t) === id).map(E.zoneName).join(', ')}.`);
    lines.push(n ? `<b>Involved: ${n} cancer cell${n > 1 ? 's' : ''}.</b> A Metastasis card lets a cell break out from here. No resting or presenting until it is clear.`
      : `Clean. Cells can rest here, and the Dendritic Cell can present antigen.`);
  } else {
    lines.push(n ? `<b>${z.hidden} hidden, ${z.revealed} revealed.</b> Overflows into the ${E.zoneName(zd.region)} past ${E.ZONE_MAX} cells.` : `Healthy tissue. Drains into the ${E.zoneName(zd.region)}.`);
    if (z.shield) lines.push('<b>PD-L1 Shield:</b> the Killer T cell gains 1 exhaustion per attack here.');
    if (z.treg) lines.push('<b>Treg guard:</b> every attack here costs 2 actions.');
  }
  if (who.length) lines.push(`Here: ${who.join(', ')}.`);
  const can = !mode && G.actionsLeft && id !== p.zone && E.moveTargets(G, p).includes(id);
  $('inspect').innerHTML = `<span class="ig ${zd.node ? 'node' : ''}">${glyph(id)}</span>
    <div><h4>${zd.name} <span class="kind">${id === p.zone ? 'you are here' : zd.node ? 'lymph node' : 'tissue'}</span></h4>
    ${lines.map(l => `<p>${l}</p>`).join('')}${can ? '<p style="color:var(--gold)">Click to move here: 1 action.</p>' : ''}</div>`;
}

function renderActions(p) {
  const cost = E.attackCost(G, p);
  const acts = [
    ['scan', 'Scan', p.role === 'dendritic' ? 'Reveal all hidden cells here, +1 in each linked zone' : 'Reveal 1 hidden cell here'],
    ...(p.role === 'dendritic' ? [['present', 'Present', 'Activate the Killer T cell: +2 actions next turn']] : []),
    ['attack', `Attack${cost > 1 ? ' · 2 actions' : ''}`, { dendritic: '', killer_t: 'Destroy up to 2 revealed cells', nk: 'Destroy 1 hidden cell', macrophage: 'Destroy 1 revealed cell' }[p.role]],
    ...(p.role === 'macrophage' ? [['clean', 'Clean', 'Remove a Shield or Treg token here']] : []),
    ['rest', 'Rest', 'Remove 2 exhaustion'],
    ['give', 'Signal', 'Give a card to a cell in your zone'],
  ];
  // only the moves this cell can legally make right now; everything else is hidden
  const legal = mode ? [] : acts.filter(([t]) => E.canDo(G, t));
  $('actions').innerHTML = legal.map(([t, name, txt]) => `<button class="act" data-a="${t}"><b>${name}</b><span>${txt}</span></button>`).join('')
    + (!mode && !legal.length ? `<p class="act-note">${G.actionsLeft ? 'No actions here. Move to a glowing space, play a card, or end your turn.' : 'No actions left. Play a card or end your turn.'}</p>` : '')
    + (mode ? `<button class="act end" data-a="cancel"><b>Cancel</b><span>Stop choosing and go back to your actions</span></button>` :
    `<button class="act end" data-a="end"><b>End turn</b><span>${G.actionsLeft ? `${G.actionsLeft} action${G.actionsLeft > 1 ? 's' : ''} unused. ` : ''}Then the cancer draws ${G.rate} cards</span></button>`);
}

function renderHand(p) {
  $('hand').innerHTML = p.hand.length ? p.hand.map((k, i) => {
    const c = E.CYTOKINES[k];
    const usable = mode?.type === 'give-pick' || (!mode && E.cardTargets(G, k, p).length);
    return `<button class="card ${mode?.idx === i ? 'sel' : ''}" data-i="${i}" data-k="${k}" ${usable ? '' : 'disabled'}>
      <img src="${ART(CARD_ART(k))}" alt=""><div><b>${c.name}</b><span>${c.text}</span></div></button>`;
  }).join('') : `<p class="cap" style="grid-column:1/-1">No cards. You draw 1 at the end of each turn.</p>`;
}

function hintText(p) {
  if (mode?.type === 'card') {
    const k = p.hand[mode.idx];
    return E.CYTOKINES[k].target === 'zone' ? `${E.CYTOKINES[k].name}: click a glowing green zone.` : `${E.CYTOKINES[k].name}: click a glowing teammate in the team list.`;
  }
  if (mode?.type === 'give-pick') return 'Signal: click the card you want to give.';
  if (mode?.type === 'give-to') return 'Signal: click a glowing teammate in your zone.';
  if (!G.actionsLeft) return 'No actions left. Play cards or end your turn.';
  return 'Click a glowing gold space on the board to move there.';
}

function matePicks() {
  const p = E.player(G);
  if (mode?.type === 'card' && E.CYTOKINES[p.hand[mode.idx]].target === 'player') return E.cardTargets(G, p.hand[mode.idx], p);
  if (mode?.type === 'give-to') return G.players.map((o, i) => i).filter(i => i !== G.current && G.players[i].zone === p.zone && G.players[i].hand.length < E.HAND_MAX);
  return [];
}

// ---------- pointer: inspector + region focus ----------
// kind 'near': the space and every space linked to it. kind 'region': a lymph node and the organs it drains.
function focusFor(id, kind) {
  if (!id || !kind) return null;
  if (kind === 'near') {
    const ids = new Set([id, ...E.neighbors(G, id)]);
    return { key: `near:${id}`, ids, edge: (a, b) => a === id || b === id };
  }
  const node = E.isNode(id) ? id : E.regionOf(id);
  const ids = new Set([node, ...E.TISSUE.filter(t => E.regionOf(t) === node)]);
  return { key: `region:${node}`, ids, edge: (a, b, k) => k === 'lymph' && ids.has(a) && ids.has(b) };
}
function setHover(id, kind = null) {
  const f = focusFor(id, kind);
  if (id === hover && (f?.key ?? null) === (focus?.key ?? null)) return;
  hover = id; focus = f;
  renderBoard(E.player(G)); renderInspect(); renderCoach();
}
// The board is redrawn on every hover change, and the tilted floor can briefly win the hit test
// between parts of one space, so clearing waits a moment and is cancelled by the next space.
let clearTimer = 0;
const clearHoverSoon = () => { clearTimeout(clearTimer); clearTimer = setTimeout(() => G && setHover(null), 160); };
$('board').addEventListener('pointerover', e => {
  if (e.pointerType === 'touch' || !G) return;
  const b = e.target.closest('.zone');
  if (!b) return clearHoverSoon();
  clearTimeout(clearTimer); setHover(b.dataset.z, 'near');
});
$('board').addEventListener('pointerleave', clearHoverSoon);
$('nodes').addEventListener('pointerover', e => {
  const li = e.target.closest('li'); if (li && G) { clearTimeout(clearTimer); setHover(li.dataset.node, 'region'); }
});
$('nodes').addEventListener('pointerleave', clearHoverSoon);
addEventListener('resize', () => { if (G && !$('game').hidden) render(); });

// ---------- input ----------
$('board').addEventListener('click', e => {
  const b = e.target.closest('.zone'); if (!b || !G) return;
  const id = b.dataset.z, p = E.player(G);
  if (mode?.type === 'card') {
    if (E.act(G, { type: 'play', card: mode.idx, target: id })) { mode = null; after(); }
    return;
  }
  if (!mode && !E.moveTargets(G, p).includes(id)) { setHover(id, e.pointerType !== 'touch' && matchMedia('(hover: hover)').matches ? 'near' : null); return; } // tap to inspect
  if (mode || !gate(`move:${id}`)) return;
  if (E.act(G, { type: 'move', to: id })) { advance(`move:${id}`); hover = null; focus = null; after(); }
});
$('actions').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const a = b.dataset.a;
  if (a === 'cancel') { mode = null; render(); return; }
  if (!gate(a)) return;
  if (a === 'end') { advance('end'); return endTurn(); }
  if (a === 'give') { mode = { type: 'give-pick' }; render(); return; }
  if (E.act(G, { type: a })) { advance(a); after(); }
});
$('hand').addEventListener('click', e => {
  const b = e.target.closest('.card'); if (!b || b.disabled) return;
  const i = +b.dataset.i, p = E.player(G), k = p.hand[i];
  if (mode?.idx === i) { mode = null; render(); return; }
  if (mode?.type === 'give-pick') { mode = { type: 'give-to', idx: i }; render(); return; }
  if (!gate(`play:${k}`)) return;
  if (E.CYTOKINES[k].target) { mode = { type: 'card', idx: i }; render(); return; }
  if (E.act(G, { type: 'play', card: i })) { advance(`play:${k}`); after(); }
});
$('mates').addEventListener('click', e => {
  const b = e.target.closest('.mate'); if (!b || b.disabled) return;
  const i = +b.dataset.p;
  if (!matePicks().includes(i)) return;
  const want = inTutorial() && STEPS[G.tutorial + 1]?.alsoAllow ? STEPS[G.tutorial + 1].target : null;
  if (want && !b.matches(want)) { gate('wrong-target'); return; }
  const k = E.player(G).hand[mode.idx];
  const ok = mode.type === 'give-to'
    ? E.act(G, { type: 'give', card: mode.idx, to: i })
    : E.act(G, { type: 'play', card: mode.idx, target: i });
  if (ok) { if (mode.type === 'card') advance(`play:${k}`); mode = null; after(); }
});
addEventListener('keydown', e => { if (e.key === 'Escape' && mode) { mode = null; render(); } });

function after() {
  render();
  if (G.over) endSheet();
}

// ---------- cancer phase ----------
function endTurn() {
  const who = E.ROLES[E.player(G).role].name;
  const from = G.log.length;
  const before = Object.fromEntries(E.ALL.map(z => [z, E.cubes(G, z)]));
  const cards = E.endTurn(G);
  flash = new Set(E.ALL.filter(z => E.cubes(G, z) > before[z]));
  setTimeout(() => { flash = new Set(); if (G && !$('game').hidden) renderBoard(E.player(G)); }, 3200);
  const extra = G.log.slice(from).filter(l => /overflows|reshuffles|blood vessel|breaks out of/.test(l.text) && !cards.some(c => c.effect === 'breakout' && l.text.includes(E.zoneName(c.zone)) && l.text.includes(E.zoneName(c.to))));
  render();
  const rows = cards.filter(c => c.kind !== 'timeout').map((c, n) => {
    const d = `style="animation-delay:${n * 0.18}s"`;
    if (c.kind === 'grow') {
      const t = { grow: [`Grow: ${E.zoneName(c.zone)}`, `The tumor in the ${E.zoneName(c.zone)} grows by ${E.GROW} hidden cells.`, true],
        invade: [`Invade: ${E.zoneName(c.zone)}`, `A tumor next door sends 1 hidden cell into the ${E.zoneName(c.zone)} through a blood vessel.`, true],
        none: [`Grow: ${E.zoneName(c.zone)}`, `No tumor here or close by. Healthy tissue resists.`, false] }[c.effect];
      return `<div class="tcard ${t[2] ? 'bad' : ''}" ${d}><span class="ig">${glyph(c.zone)}</span><div><b>${t[0]}</b><p>${t[1]}</p></div></div>`;
    }
    if (c.kind === 'mutation') {
      const m = E.MUTATIONS[c.mutation];
      return `<div class="tcard bad" ${d}><img src="${ART(m.img)}" alt=""><div><b>Mutation: ${m.name} in the ${E.zoneName(c.zone)}</b><p>${m.text}</p></div></div>`;
    }
    if (c.effect === 'breakout') return `<div class="tcard bad" ${d}><img src="${ART('mut_angio')}" alt=""><div><b>Metastasis: breakout</b><p>A cell escapes the involved ${E.zoneName(c.zone)} and seeds the ${E.zoneName(c.to)}. Metastasis +1.</p></div></div>`;
    if (c.effect === 'sentinel') return `<div class="tcard bad" ${d}><img src="${ART('lymph')}" alt=""><div><b>Metastasis: sentinel node</b><p>A cell leaves the ${E.zoneName(c.zone)} through a lymph vessel and lodges in the ${E.zoneName(c.to)}. Clear that node before the cell breaks out.</p></div></div>`;
    return `<div class="tcard" ${d}><img src="${ART('cancer_hidden')}" alt=""><div><b>Metastasis fails</b><p>No lymph node holds cancer and no tumor has 3 or more cells.</p></div></div>`;
  }).join('');
  const notes = extra.map(l => `<p style="color:#ff9aa6;font-weight:700">${l.text}</p>`).join('');
  sheet(`<div class="label">After the ${who}'s turn</div><h2>The cancer acts</h2>
    <div class="tumor-list">${rows}</div>${notes}
    <p class="cap">Spaces the cancer changed flash red on the board.</p>
    <div class="row"><button class="big" id="cont">${G.over ? 'See result' : 'Continue'}</button></div>`);
  $('cont').focus();
  renderCoach();
  $('cont').onclick = () => {
    if (!gate('cancer-continue')) return;
    advance('cancer-continue');
    if (G.over) endSheet(); else turnBanner();
  };
}

function turnBanner() {
  const p = E.player(G), R = E.ROLES[p.role];
  sheet(`<div class="banner" style="display:grid;grid-template-columns:120px 1fr;gap:16px;align-items:center">
      <img class="art" src="${ART(p.role)}" alt="" style="border:3px solid var(--${p.role})">
      <div><div class="label">Round ${G.round}</div><h2 style="color:var(--${p.role})">${R.name}'s turn</h2>
      <p style="color:var(--muted)">You are in the ${E.zoneName(p.zone)}. You have ${G.actionsLeft} actions.</p></div></div>
    <div class="row"><button class="big" id="cont">Go</button></div>`);
  $('cont').focus();
  renderCoach();
  $('cont').onclick = () => { if (!gate('banner-go')) return; advance('banner-go'); closeSheet(); render(); };
}

function endSheet() {
  const win = G.over.win;
  const killed = G.log.filter(l => l.kind === 'attack').length;
  sheet(`<img class="art" src="${ART(win ? 'win' : 'lose')}" alt="">
    <h2 style="color:${win ? 'var(--good)' : 'var(--cancer)'}">${win ? 'The body is healthy again' : 'The cancer has won'}</h2>
    <p>${G.over.reason}</p>
    <p style="color:var(--muted)">${E.DIFFICULTY[G.difficulty].label} game · ${G.round} rounds · ${killed} successful attacks · metastasis ${G.metastasis} of ${G.metLimit}.</p>
    <div class="row"><button class="ghost" id="look">Look at the board</button><button class="big" id="again">Play again</button></div>`, true);
  $('again').onclick = () => { closeSheet(); G = null; save(); show('welcome'); };
  $('look').onclick = closeSheet;
  save();
}

function confirmSheet(title, text, yes, fn) {
  sheet(`<h2>${title}</h2><p>${text}</p><div class="row"><button class="ghost" id="no">Cancel</button><button class="big" id="yes">${yes}</button></div>`);
  $('no').onclick = closeSheet;
  $('yes').onclick = () => { closeSheet(); fn(); };
}
function sheet(html, wide) {
  $('sheet').className = 'sheet' + (wide ? ' wide' : '');
  $('sheet').innerHTML = html;
  $('overlay').hidden = false;
}
function closeSheet() { $('overlay').hidden = true; }

// ---------- tutorial coach ----------
const Z = id => `.zone[data-z="${id}"]`, ACT = a => `.act[data-a="${a}"]`;
const STEPS = [
  { bio: 'Blood carries immune cells around the whole body. A second network, the lymphatic system, collects fluid from every tissue and filters it through hundreds of lymph nodes.', text: 'Welcome, commander. This is the <b>body</b>. Each organ is a zone. Red <b>blood vessels</b> link organs the way arteries do.', target: '#board' },
  { bio: 'Lymph nodes are the immune system\'s meeting points. Fluid from each region passes through its nearest nodes, so that is where germs and cancer cells are usually noticed first.', text: 'Green dotted <b>lymph vessels</b> drain every organ into one of 4 <b>lymph nodes</b>: Neck, Armpit, Gut and Groin. Point at a node in the list to see its region light up on the body.', target: '#nodes' },
  { bio: 'Cancer cells are your own cells that keep dividing when they should stop. Many hide by showing fewer warning flags, called antigens, so immune cells pass them by.', text: 'A tumor has formed in the <b>Throat</b>. The purple badge counts <b>hidden</b> cancer cells. A red badge counts <b>revealed</b> ones.', target: Z('throat') },
  { bio: 'Each hero is a real white blood cell. They work as a team: some find the enemy, some kill it, and some clean up and send signals.', text: 'You control all 4 immune cells, one turn each. Each starts in a different lymph node. Every turn has <b>4 actions</b>, the gold squares.', target: '#me' },
  { bio: 'Dendritic cells sit in tissues like sentries. Their long branching arms sample everything around them.', text: 'The <b>Dendritic Cell</b> goes first. Click the glowing <b>Throat</b> to move there.', wait: 'move:throat', target: Z('throat') },
  { bio: 'A scan stands for a dendritic cell swallowing bits of tumor and finding abnormal proteins (antigens) that mark those cells as dangerous.', text: 'Click <b>Scan</b>. It reveals every hidden cell here, plus 1 in each linked zone.', wait: 'scan', target: ACT('scan') },
  { bio: 'Chemokines are chemical signals. Immune cells follow the trail toward the place that released them. This is called chemotaxis.', text: 'The cells are revealed, so the Killer T cell can hit them. <b>Cytokine cards</b> cost no action. Click <b>Chemokine</b> to call a teammate here.', wait: 'play:chemokine', target: '.card[data-k="chemokine"]' },
  { text: 'Click the <b>Killer T Cell</b> in your team list. It travels to the Throat at once.', wait: 'play:chemokine', target: '.mate[data-p="1"]', alsoAllow: true },
  { bio: 'After sampling a tumor, a real dendritic cell travels through the lymph vessels to the nearest lymph node, carrying the antigen with it.', text: 'The Dendritic Cell also picked up the tumor\'s <b>antigen</b>. T cells are switched on inside lymph nodes, so move back to the <b>Neck Node</b>.', wait: 'move:neck_node', target: Z('neck_node') },
  { bio: 'In the node, the dendritic cell shows the antigen to T cells. A T cell that recognizes it switches on and copies itself many times. This is called clonal expansion.', text: 'Click <b>Present</b>. The Killer T cell\'s exhaustion clears and it gets <b>2 extra actions</b> next turn. This only works in a lymph node with no cancer in it.', wait: 'present', target: ACT('present') },
  { text: 'Click <b>End turn</b>. After every turn, the cancer acts.', wait: 'end', target: ACT('end') },
  { bio: 'Real tumors spread the same way. Cancer cells usually reach the nearest lymph node first, the sentinel node. Surgeons check that node to see whether a cancer has spread.', text: 'The Throat tumor grew past 5 cells, so the extra cell <b>drained into the Neck Node</b>. That node is now <b>involved</b>: nobody can rest or present there until it is cleared. Click <b>Continue</b>.', wait: 'cancer-continue', target: '#sheet' },
  { text: 'The activated Killer T cell is next, already in the Throat. Click <b>Go</b>.', wait: 'banner-go', target: '#cont' },
  { bio: 'Killer T cells (CD8+ T cells) recognize antigen on a cancer cell. They punch holes in it with perforin and send in granzymes, which make the cell destroy itself.', text: 'It has <b>6 actions</b>. Click <b>Attack</b> to destroy up to 2 revealed cells.', wait: 'attack', target: ACT('attack') },
  { text: 'Attack again for the last revealed cell.', wait: 'attack', target: ACT('attack') },
  { text: 'Follow the blood vessel to the <b>Lung</b>.', wait: 'move:lung', target: Z('lung') },
  { text: 'Attack the revealed cell in the Lung.', wait: 'attack', target: ACT('attack') },
  { text: 'The hidden cells left over need a Scan or the NK cell. Click <b>End turn</b>.', wait: 'end', target: ACT('end') },
  { bio: 'PD-L1 is a real tumor trick. It presses the PD-1 off switch on T cells and wears them out. Drugs called checkpoint inhibitors block that switch. Metastasis, cancer spreading to distant organs, causes most cancer deaths.', text: 'Two bad cards. A <b>PD-L1 Shield</b> now protects the Colon. Worse, the cell in the Neck Node <b>broke out</b> and seeded the <b>Skin</b> on the arm. Each breakout fills a circle on the Metastasis track. Click <b>Continue</b>.', wait: 'cancer-continue', target: '#sheet' },
  { text: 'The NK cell is next. Click <b>Go</b>.', wait: 'banner-go', target: '#cont' },
  { bio: 'Natural killer cells check every cell for a self marker called MHC class I. Cancer cells that hide their antigens often lose this marker too, and NK cells kill cells that are missing it.', text: 'The <b>NK cell</b> kills hidden cells, no scan needed. Catch the escaped cell before it grows. Take the lymph vessel to the <b>Armpit Node</b>.', wait: 'move:chest_node', target: Z('chest_node') },
  { text: 'Now move down the arm to the <b>Skin</b>.', wait: 'move:skin', target: Z('skin') },
  { text: 'Click <b>Attack</b> to destroy the hidden cell.', wait: 'attack', target: ACT('attack') },
  { text: 'Caught it. Click <b>End turn</b>.', wait: 'end', target: ACT('end') },
  { text: 'Both Grow cards found no tumor to grow. Click <b>Continue</b>.', wait: 'cancer-continue', target: '#sheet' },
  { text: 'Last, the Macrophage. Click <b>Go</b>.', wait: 'banner-go', target: '#cont' },
  { bio: 'Macrophages are large eater cells. They swallow dead cells and debris, a process called phagocytosis, and release signals that rally or calm other immune cells.', text: 'The <b>Macrophage</b> removes Shields. The Colon drains into the Groin Node, so it is one step away. Move to the <b>Colon</b>.', wait: 'move:colon', target: Z('colon') },
  { text: 'Click <b>Clean</b> to remove the PD-L1 Shield.', wait: 'clean', target: ACT('clean') },
  { bio: 'Real cancer immunotherapies boost these same cells. Checkpoint inhibitors release the brakes on T cells, and CAR-T therapy gives T cells new receptors aimed at the tumor.', text: 'You know the basics. Scan and present with the Dendritic Cell, strike with the Killer T cell, and send the NK cell after hidden cells. Keep the lymph nodes clean so cancer cannot break out. <b>Win</b> by destroying every cancer cell. This game is yours to finish.', target: '#s-met', last: true },
];
let coachShown = -1;
const inTutorial = () => G && typeof G.tutorial === 'number';

function gate(ev) {
  if (!inTutorial()) return true;
  const st = STEPS[G.tutorial];
  if (st.wait === ev) return true;
  const c = $('coach'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
  return false;
}
function advance(ev) {
  if (!inTutorial()) return;
  if (STEPS[G.tutorial].wait === ev) G.tutorial++;
  // a two-click card (pick card, then pick target) shares one wait; skip the target step once it is played
  while (inTutorial() && STEPS[G.tutorial].alsoAllow && STEPS[G.tutorial].wait === ev) G.tutorial++;
}
function renderCoach() {
  document.querySelectorAll('.coach-target').forEach(el => el.classList.remove('coach-target'));
  if (!inTutorial() || G.over) { $('coach').hidden = true; return; }
  let st = STEPS[G.tutorial];
  // after the card is picked, point at the target step that follows it
  if (mode?.type === 'card' && STEPS[G.tutorial + 1]?.alsoAllow) st = STEPS[G.tutorial + 1];
  $('coach').hidden = false;
  $('coach-step').textContent = `Tutorial · step ${G.tutorial + 1} of ${STEPS.length}`;
  $('coach-text').innerHTML = st.text;
  $('coach-bio').hidden = !st.bio;
  $('coach-bio-text').textContent = st.bio || '';
  $('coach-next').hidden = !!st.wait;
  $('coach-next').textContent = st.last ? 'Play on' : 'Next';
  const t = st.target && document.querySelector(st.target);
  if (t) {
    t.classList.add('coach-target');
    if (coachShown !== G.tutorial && !t.closest('.overlay')) t.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  placeCoach(t);
  coachShown = G.tutorial;
}
// Keep the coach in the screen corner farthest from what it points at, so it never covers the thing to click.
function placeCoach(t) {
  const c = $('coach'), pad = '16px';
  Object.assign(c.style, { top: 'auto', bottom: 'auto', left: 'auto', right: 'auto' });
  const r = (t?.id === 'sheet' ? $('cont') : t)?.getBoundingClientRect(); // on a sheet, keep clear of its button
  const below = r ? r.top + r.height / 2 < innerHeight / 2 : true; // target in the top half: coach goes to the bottom
  const leftSide = r ? r.left + r.width / 2 > innerWidth / 2 : false;
  c.style[below ? 'bottom' : 'top'] = below ? `calc(${pad} + env(safe-area-inset-bottom, 0px))` : `calc(${pad} + env(safe-area-inset-top, 0px))`;
  if (innerWidth <= 620) { c.style.left = pad; c.style.right = pad; return; }
  c.style[leftSide ? 'left' : 'right'] = pad;
}
addEventListener('resize', () => { if (inTutorial()) placeCoach(document.querySelector('.coach-target')); });
$('coach-next').addEventListener('click', () => {
  if (!inTutorial() || STEPS[G.tutorial].wait) return;
  G.tutorial = STEPS[G.tutorial].last ? null : G.tutorial + 1;
  render();
});
$('coach-skip').addEventListener('click', () => { G.tutorial = null; render(); });

// ---------- boot (keeps a running game across live page updates) ----------
function start(data) {
  const s = data?.game?.v === 3 ? E.attachRng(data.game) : null;
  if (s && !s.over) begin(s); else show('welcome');
}
window.claude?.hot?.snapshot?.(() => ({ game: G ? JSON.parse(JSON.stringify(G)) : null }));
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
