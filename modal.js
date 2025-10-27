/* global TrelloPowerUp */
const t = TrelloPowerUp.iframe();

const state = {
  currentCard: null,
  allCards: [],
  currentDeps: new Set(),
  toAdd: new Set(),
  toRemove: new Set(),
};

function parseCardIdFromUrl(url) {
  try {
    const u = new URL(url.trim());
    // Expected: https://trello.com/c/<shortLink>/...
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'c' && parts[1]) return parts[1];
  } catch (e) {}
  return null;
}

async function load() {
  const [card, cards, dep] = await Promise.all([
    t.card('id', 'name', 'shortLink'),
    t.cards('id', 'name', 'shortLink', 'url'),
    t.get('card', 'shared', 'dependsOn', []),
  ]);
  state.currentCard = card;
  state.allCards = cards.filter(c => c.id !== card.id); // exclude self
  state.currentDeps = new Set(dep || []);

  document.getElementById('filter').addEventListener('input', renderList);
  document.getElementById('pasteUrl').addEventListener('keydown', onPasteUrl);
  document.getElementById('save').addEventListener('click', onSave);
  document.getElementById('close').addEventListener('click', () => t.closeModal());

  renderList();
  renderSelected();
}

function onPasteUrl(e) {
  if (e.key === 'Enter') {
    const short = parseCardIdFromUrl(e.target.value);
    if (!short) return;
    // map shortLink to full card id if we can
    const match = state.allCards.find(c => c.shortLink === short);
    if (match) {
      toggleCard(match.id, true);
      renderList();
      renderSelected();
      e.target.value = '';
    }
  }
}

function renderSelected() {
  const el = document.getElementById('selected');
  const all = Array.from(state.currentDeps).concat(Array.from(state.toAdd)).filter(id => !state.toRemove.has(id));
  if (!all.length) { el.innerHTML = ''; return; }
  const names = all.map(id => state.allCards.find(c => c.id === id)?.name || id);
  el.innerHTML = '<strong>Selected:</strong> ' + names.map(n => `<span class="badge">${n}</span>`).join(' ');
}

function toggleCard(id, forceAdd = null) {
  const isInCurrent = state.currentDeps.has(id);
  const isInAdd = state.toAdd.has(id);
  const isInRemove = state.toRemove.has(id);

  let nextChecked;
  if (forceAdd === true) nextChecked = true;
  else if (forceAdd === false) nextChecked = false;
  else nextChecked = !(isInCurrent || isInAdd) || isInRemove;

  if (nextChecked) {
    state.toRemove.delete(id);
    if (!isInCurrent) state.toAdd.add(id);
  } else {
    state.toAdd.delete(id);
    if (isInCurrent) state.toRemove.add(id);
  }
}

function renderList() {
  const list = document.getElementById('list');
  const q = (document.getElementById('filter').value || '').toLowerCase();
  const items = state.allCards
    .filter(c => c.name.toLowerCase().includes(q))
    .slice(0, 200); // limit for performance

  list.innerHTML = '';
  for (const c of items) {
    const id = c.id;
    const checked = state.toAdd.has(id) || (state.currentDeps.has(id) && !state.toRemove.has(id));
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <input type="checkbox" ${checked ? 'checked' : ''} data-id="${id}"/>
      <div style="flex:1">
        <div>${c.name}</div>
        <div class="small">${c.url}</div>
      </div>
    `;
    row.querySelector('input').addEventListener('change', (e) => {
      toggleCard(id, e.target.checked);
      renderSelected();
    });
    list.appendChild(row);
  }
}

async function onSave() {
  const add = Array.from(state.toAdd);
  const rem = Array.from(state.toRemove);

  const currentId = state.currentCard.id;

  // Update current card.dependsOn (add/remove)
  const existing = new Set(await t.get('card', 'shared', 'dependsOn', []));
  for (const id of add) existing.add(id);
  for (const id of rem) existing.delete(id);
  await t.set('card', 'shared', 'dependsOn', Array.from(existing));

  // Update reverse mapping on target cards (blocks)
  for (const id of add) {
    const blocks = new Set(await t.get(id, 'shared', 'blocks', []));
    blocks.add(currentId);
    await t.set(id, 'shared', 'blocks', Array.from(blocks));
  }
  for (const id of rem) {
    const blocks = new Set(await t.get(id, 'shared', 'blocks', []));
    blocks.delete(currentId);
    await t.set(id, 'shared', 'blocks', Array.from(blocks));
  }

  await t.notifyParent('done');
  await t.closeModal();
}

load().catch(err => {
  console.error(err);
});
