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
    title: 'Checklist summary'
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
      height: 640
    }),
    icon: LOCAL_ICON
  };

  const blocksBadge = {
    text: blocks.length ? `🚧 Blocking ${blocks.length}` : '🚧 Not blocking',
    color: blocks.length ? 'yellow' : null,
    title: blocks.length ? 'This card blocks other cards.' : 'Not blocking any cards.',
    icon: LOCAL_ICON
  };

  return [dependsBadge, blocksBadge];
}

window.TrelloPowerUp.initialize({
  'card-badges': …,
  'card-buttons': …,
  'card-detail-badges': …,
  'card-back-section': function (t) {
    return t.get('card', 'shared', 'dependsOn')
      .then(function (dependsOn = []) {
        if (!dependsOn.length) {
          return;
        }
        return {
          title: 'Dependencies',
          icon: ICON,
          content: {
            type: 'iframe',
            url: t.signUrl('./dependencies-section.html'),
            height: 80
          }
        };
      });
  },
  'show-settings': …
});
