/* global TrelloPowerUp */
const ICON = 'https://raw.githubusercontent.com/github/explore/master/topics/trello/trello.png'; // fallback icon
const LOCAL_ICON = './icon.svg';

// Small helpers
const uniq = (arr) => Array.from(new Set(arr));
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

async function getDependenciesForCard(t, cardIdInScope) {
  // dependencies stored on the card
  const dependsOn = (await t.get(cardIdInScope || 'card', 'shared', 'dependsOn', [])) || [];
  const blocks = (await t.get(cardIdInScope || 'card', 'shared', 'blocks', [])) || [];
  return { dependsOn: uniq(dependsOn), blocks: uniq(blocks) };
}

async function setDependenciesForCard(t, cardId, nextDependsOn) {
  const unique = uniq(nextDependsOn.filter(Boolean));
  await t.set(cardId || 'card', 'shared', 'dependsOn', unique);
  return unique;
}

async function setBlocksForCard(t, cardId, nextBlocks) {
  const unique = uniq(nextBlocks.filter(Boolean));
  await t.set(cardId, 'shared', 'blocks', unique);
  return unique;
}

async function addDependencyPair(t, currentCardId, targetCardId) {
  // Add B to A.dependsOn
  const A = await getDependenciesForCard(t, currentCardId);
  const nextA = uniq([...(A.dependsOn || []), targetCardId]);
  await setDependenciesForCard(t, currentCardId, nextA);

  // Add A to B.blocks
  const B = await getDependenciesForCard(t, targetCardId);
  const nextB = uniq([...(B.blocks || []), currentCardId]);
  await setBlocksForCard(t, targetCardId, nextB);
}

async function removeDependencyPair(t, currentCardId, targetCardId) {
  const A = await getDependenciesForCard(t, currentCardId);
  const nextA = (A.dependsOn || []).filter((id) => id !== targetCardId);
  await setDependenciesForCard(t, currentCardId, nextA);

  const B = await getDependenciesForCard(t, targetCardId);
  const nextB = (B.blocks || []).filter((id) => id !== currentCardId);
  await setBlocksForCard(t, targetCardId, nextB);
}
async function checklistSummary(t) {
  // Get display mode for checklist from board settings; default to 'next'
  const mode = (await t.get('board', 'shared', 'checklistDisplayMode')) || 'next';
  const card = await t.card('checklists', 'id', 'name', 'badges');
  let total = 0;
  let done = 0;
  const allItems = [];
  const upcomingItems = [];
  (card.checklists || []).forEach(cl => {
    (cl.checkItems || []).forEach(ci => {
      total += 1;
      const name = ci.name;
      if (ci.state === 'complete') {
        done += 1;
      }
      allItems.push(name);
      if (ci.state !== 'complete') {
        upcomingItems.push(name);
      }
    });
  });
  let namesToShow = [];
  if (mode === 'all') {
    namesToShow = allItems;
  } else if (mode === 'upcoming') {
    namesToShow = upcomingItems;
  } else {
    namesToShow = upcomingItems.slice(0, 1);
  }
  const text = total > 0
    ? `☑︎ ${done}/${total}` + (namesToShow.length ? ` • ${truncate(namesToShow.join(' • '), 36)}` : '')
    : '☑︎ No checklist';
  return {
    text,
    icon: LOCAL_ICON,
    title: 'Checklist summary',
  };
}
async function checklistSummary(t) {
  const card = await t.card('checklists', 'id', 'name', 'badges');
  let total = 0, done = 0, firstTitles = [];
  (card.checklists || []).forEach(cl => {
    (cl.checkItems || []).forEach(ci => {
      total += 1;
      if (ci.state === 'complete') done += 1;
      else if (firstTitles.length < 2) firstTitles.push(ci.name);
    });
  });
  const text = total > 0
    ? `☑︎ ${done}/${total}` + (firstTitles.length ? ` • ${truncate(firstTitles.join(' • '), 36)}` : '')
    : '☑︎ No checklist';
  return {
    text,
    icon: LOCAL_ICON,
    title: 'Checklist summary (first 2 incomplete items)',
  };
}

async function dependencyBadges(t) {
  const card = await t.card('id', 'name');
  const { dependsOn, blocks } = await getDependenciesForCard(t, card.id);

  const dependsBadge = {
    text: dependsOn.length ? `⛓ Depends on ${dependsOn.length}` : '⛓ No deps',
    color: dependsOn.length ? 'red' : null,
    title: dependsOn.length ? 'This card is blocked by prerequisite cards.' : 'No dependencies set for this card.',
    callback: () => t.modal({
      url: t.signUrl('./modal.html'),
      title: 'Dependencies',
      fullscreen: false,
      height: 640,
    }),
    icon: LOCAL_ICON,
  };

  const blocksBadge = {
    text: blocks.length ? `🚧 Blocking ${blocks.length}` : '🚧 Not blocking',
    color: blocks.length ? 'yellow' : null,
    title: blocks.length ? 'This card blocks other cards.' : 'Not blocking any cards.',
    icon: LOCAL_ICON,
  };

  return [dependsBadge, blocksBadge];
}

// Capability registration
TrelloPowerUp.initialize({
  'card-badges': function (t, opts) {
    // Return dynamic badges so they update as data changes
    return [
      {
        dynamic: function () { return checklistSummary(t); }
      },
      {
        dynamic: function () { return dependencyBadges(t).then(arr => arr[0]); }
      },
      {
        dynamic: function () { return dependencyBadges(t).then(arr => arr[1]); }
      }
    ];
  },

  'card-detail-badges': function (t, opts) {
    // More verbose badges on the back
    return Promise.all([t.card('id', 'name'), getDependenciesForCard(t)]).then(async ([card, dep]) => {
      // Lookup names for dependency card ids for nicer tooltips
      const allCards = await t.cards('id', 'name', 'shortLink', 'url');
      const byId = Object.fromEntries(allCards.map(c => [c.id, c]));
      const depNames = (dep.dependsOn || []).map(id => byId[id]?.name || id).slice(0, 5);
      const blockNames = (dep.blocks || []).map(id => byId[id]?.name || id).slice(0, 5);

      return [
        {
          text: dep.dependsOn.length ? `Depends on: ${dep.dependsOn.length}` : 'Depends on: none',
          icon: LOCAL_ICON,
          title: dep.dependsOn.length ? `Prerequisites:\n- ${depNames.join('\n- ')}` : 'No dependencies',
          callback: () => t.modal({ url: t.signUrl('./modal.html'), title: 'Dependencies', height: 640 })
        },
        {
          text: dep.blocks.length ? `Blocking: ${dep.blocks.length}` : 'Blocking: none',
          icon: LOCAL_ICON,
          title: dep.blocks.length ? `Blocking:\n- ${blockNames.join('\n- ')}` : 'Not blocking'
        }
      ];
    });
  },

  'card-buttons': function (t, opts) {
    return [{
      icon: LOCAL_ICON,
      text: 'Dependencies',
      callback: function () {
        return t.modal({
          url: t.signUrl('./modal.html'),
          title: 'Dependencies',
          fullscreen: false,
          height: 640
        });
      }
    }];
  },

  'show-settings': function (t) {
    return t.popup({
      title: 'Checklist & Dependencies – Settings',
      url: './settings.html',
    });
  }
});
