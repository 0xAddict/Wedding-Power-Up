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

// Capability registration
// Main initialization
window.TrelloPowerUp.initialize({

  // 1. Buttons shown on the card front
  'card-buttons': function (t, opts) {
    return [
      // If you still want a dynamic checklist summary badge
      {
        dynamic: function () {
          return checklistSummary(t);
        }
      },
      // A dynamic badge for dependencies (depends/blocks)
      {
        dynamic: function () {
          return dependencyBadges(t).then(arr => arr[0]);
        }
      },
      {
        dynamic: function () {
          return dependencyBadges(t).then(arr => arr[1]);
        }
      },
      // A static button to open the modal
      {
        icon: ICON,
        text: 'Dependencies',
        callback: function (t) {
          return t.modal({
            url: './modal.html',
            height: 500,
            fullscreen: false
          });
        }
      }
    ];
  },

  // 2. Badges shown on the card detail view (front of card)
  'card-detail-badges': function (t, opts) {
    // Show counts of dependencies and blockers
    return Promise.all([
      t.get('card', 'shared', 'dependsOn'),
      t.get('card', 'shared', 'blocks')
    ]).then(([dependsOn = [], blocks = []]) => {
      const badges = [];
      if (dependsOn.length) {
        badges.push({
          title: 'Depends on',
          text: dependsOn.length.toString(),
          color: 'yellow',
          callback: function (t) {
            return t.modal({
              url: './modal.html',
              height: 500,
              fullscreen: false
            });
          }
        });
      }
      if (blocks.length) {
        badges.push({
          title: 'Blocked by',
          text: blocks.length.toString(),
          color: 'red',
          callback: function (t) {
            return t.modal({
              url: './modal.html',
              height: 500,
              fullscreen: false
            });
          }
        });
      }
      return badges;
    });
  },

  // 3. Optional verbose badges (if you prefer the older style)
  // If you no longer need these, you can delete this function.
  // 'card-badges': function (t, opts) {
  //   return Promise.all([t.card('id', 'name'), getDependenciesForCard(t)])
  //     .then(async ([card, dep]) => {
  //       // Look up card names for nicer tooltips
  //       const allCards = await t.cards('id', 'name', 'shortLink', 'url');
  //       const byId = Object.fromEntries(allCards.map(c => [c.id, c]));
  //       const depNames  = (dep.dependsOn || []).map(id => byId[id]?.name || id).slice(0, 5);
  //       const blockNames = (dep.blocks || []).map(id => byId[id]?.name || id).slice(0, 5);
  //       return [
  //         {
  //           text: dep.dependsOn.length ? `Depends on: ${dep.dependsOn.length}` : 'Depends on: none',
  //           icon: LOCAL_ICON,
  //           title: dep.dependsOn.length ? `Prerequisites:\n- ${depNames.join('\n- ')}` : 'No dependencies',
  //           callback: () => t.modal({ url: t.signUrl('./modal.html'), title: 'Dependencies', height: 640 })
  //         },
  //         {
  //           text: dep.blocks.length ? `Blocking: ${dep.blocks.length}` : 'Blocking: none',
  //           icon: LOCAL_ICON,
  //           title: dep.blocks.length ? `Blocking:\n- ${blockNames.join('\n- ')}` : 'Not blocking'
  //         }
  //       ];
  //     });
  // },

  // 4. Settings menu
  'show-settings': function (t, opts) {
    return t.popup({
      title: 'Power‑Up Settings',
      url: './settings.html',
      height: 200
    });
  },

  // 5. Section on the card back to list dependencies
  'card-back-section': function (t, opts) {
    return t.get('card', 'shared', 'dependsOn')
      .then(function (dependsOn = []) {
        if (!dependsOn || dependsOn.length === 0) {
          return;
        }
        // Build clickable links using short card IDs
        const listItems = dependsOn.map(function (id) {
          return (
            '<li>' +
              '<a href="https://trello.com/c/' + id + '" target="_blank">' +
                id +
              '</a>' +
            '</li>'
          );
        }).join('');
        return {
          title: 'Dependencies',
          icon: ICON,
          content: {
            type: 'text',
            html: '<ul>' + listItems + '</ul>'
          }
        };
      });
  }

});
