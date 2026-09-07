const form = document.getElementById('filters');
const resultsEl = document.getElementById('results');
const statusEl = document.getElementById('status');
const refreshBtn = document.getElementById('refreshBtn');
const tabButtons = document.querySelectorAll('.tab-btn');

const tagInput = document.getElementById('tagInput');
const tagSuggestions = document.getElementById('tagSuggestions');
const selectedTagsEl = document.getElementById('selectedTags');

let activeTab = 'new';
let allTags = []; // string[]
let selectedTags = new Set(); // string names

async function loadTagList() {
  try {
    const res = await fetch('/api/tags');
    const data = await res.json();
    allTags = data.tags || [];
  } catch {
    // Autocomplete just won't populate; typing a tag still works via free entry.
  }
}

function addTag(name) {
  selectedTags.add(name);
  renderSelectedTags();
  tagInput.value = '';
  tagSuggestions.hidden = true;
  tagSuggestions.innerHTML = '';
  tagInput.focus();
}

function renderSelectedTags() {
  selectedTagsEl.innerHTML = '';
  for (const name of selectedTags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = name;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      selectedTags.delete(name);
      renderSelectedTags();
    });
    chip.appendChild(removeBtn);
    selectedTagsEl.appendChild(chip);
  }
}

function renderTagSuggestions(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    tagSuggestions.hidden = true;
    tagSuggestions.innerHTML = '';
    return;
  }
  const matches = allTags.filter((t) => !selectedTags.has(t) && t.toLowerCase().includes(q)).slice(0, 20);

  tagSuggestions.innerHTML = '';
  for (const tag of matches) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = tag;
    btn.addEventListener('click', () => addTag(tag));
    tagSuggestions.appendChild(btn);
  }
  tagSuggestions.hidden = matches.length === 0;
}

tagInput.addEventListener('input', () => renderTagSuggestions(tagInput.value));
tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const value = tagInput.value.trim();
    if (value) addTag(value);
  }
});
tagInput.addEventListener('blur', () => {
  setTimeout(() => {
    tagSuggestions.hidden = true;
  }, 150);
});

function timeAgo(isoString) {
  if (!isoString) return '';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function postStatus(appid, status) {
  const res = await fetch(`/api/games/${appid}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update game status');
  }
}

function actionsForStatus(game) {
  const wrap = document.createElement('div');
  wrap.className = 'actions';

  if (game.status !== 'shortlisted') {
    const shortlistBtn = document.createElement('button');
    shortlistBtn.className = 'shortlist-btn';
    shortlistBtn.textContent = '★ Shortlist';
    shortlistBtn.addEventListener('click', async () => {
      shortlistBtn.disabled = true;
      try {
        await postStatus(game.appid, 'shortlisted');
        loadTab(activeTab);
      } catch (err) {
        alert(err.message);
        shortlistBtn.disabled = false;
      }
    });
    wrap.appendChild(shortlistBtn);
  }

  if (game.status !== 'dismissed') {
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'dismiss-btn';
    dismissBtn.textContent = '✕ Dismiss';
    dismissBtn.addEventListener('click', async () => {
      dismissBtn.disabled = true;
      try {
        await postStatus(game.appid, 'dismissed');
        loadTab(activeTab);
      } catch (err) {
        alert(err.message);
        dismissBtn.disabled = false;
      }
    });
    wrap.appendChild(dismissBtn);
  }

  if (game.status !== 'new') {
    const restoreBtn = document.createElement('button');
    restoreBtn.textContent = '↩ Move to New';
    restoreBtn.addEventListener('click', async () => {
      restoreBtn.disabled = true;
      try {
        await postStatus(game.appid, 'new');
        loadTab(activeTab);
      } catch (err) {
        alert(err.message);
        restoreBtn.disabled = false;
      }
    });
    wrap.appendChild(restoreBtn);
  }

  const steamLink = document.createElement('a');
  steamLink.href = game.url;
  steamLink.target = '_blank';
  steamLink.rel = 'noopener noreferrer';
  steamLink.textContent = 'View on Steam';
  wrap.appendChild(steamLink);

  return wrap;
}

// Builds a simple prev/next/dots carousel cycling through the trailer(s)
// (if any) followed by full-size screenshots. Falls back to a single
// static header image when neither is available yet.
function buildMediaCarousel(game) {
  const slides = [];

  for (const movie of game.movies || []) {
    if (movie.mp4) slides.push({ type: 'video', poster: movie.thumbnail, src: movie.mp4 });
  }
  for (const shot of game.screenshots || []) {
    slides.push({ type: 'image', src: shot.full || shot.thumbnail });
  }
  if (slides.length === 0 && game.headerImage) {
    slides.push({ type: 'image', src: game.headerImage });
  }

  const container = document.createElement('div');
  container.className = 'media-carousel';

  const viewport = document.createElement('div');
  viewport.className = 'carousel-viewport';
  container.appendChild(viewport);

  if (slides.length === 0) return container;

  const slideEls = slides.map((slide, i) => {
    let el;
    if (slide.type === 'video') {
      el = document.createElement('video');
      el.controls = true;
      el.preload = 'none';
      if (slide.poster) el.poster = slide.poster;
      const source = document.createElement('source');
      source.src = slide.src;
      source.type = 'video/mp4';
      el.appendChild(source);
    } else {
      el = document.createElement('img');
      el.src = slide.src;
      el.loading = 'lazy';
      el.alt = `${game.name} media ${i + 1}`;
    }
    el.className = 'carousel-slide';
    el.hidden = i !== 0;
    viewport.appendChild(el);
    return el;
  });

  let current = 0;
  const dots = [];

  function show(index) {
    const prevEl = slideEls[current];
    if (prevEl.tagName === 'VIDEO') prevEl.pause();
    prevEl.hidden = true;
    current = (index + slides.length) % slides.length;
    slideEls[current].hidden = false;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  if (slides.length > 1) {
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'carousel-nav prev';
    prevBtn.textContent = '‹';
    prevBtn.addEventListener('click', () => show(current - 1));

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'carousel-nav next';
    nextBtn.textContent = '›';
    nextBtn.addEventListener('click', () => show(current + 1));

    container.appendChild(prevBtn);
    container.appendChild(nextBtn);

    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'carousel-dots';
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', () => show(i));
      dotsWrap.appendChild(dot);
      dots.push(dot);
    });
    container.appendChild(dotsWrap);
  }

  return container;
}

function renderCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card';

  card.appendChild(buildMediaCarousel(game));

  const body = document.createElement('div');
  body.className = 'card-body';

  const titleRow = document.createElement('div');
  titleRow.className = 'title-row';
  const nameLink = document.createElement('a');
  nameLink.className = 'name';
  nameLink.href = game.url;
  nameLink.target = '_blank';
  nameLink.rel = 'noopener noreferrer';
  nameLink.textContent = game.name;
  titleRow.appendChild(nameLink);

  const seen = document.createElement('span');
  seen.className = 'first-seen';
  seen.textContent = game.viewedAt
    ? `${game.status} ${timeAgo(game.viewedAt)}`
    : `First seen ${timeAgo(game.firstSeenAt)}`;
  titleRow.appendChild(seen);
  body.appendChild(titleRow);

  const devpub = document.createElement('div');
  devpub.className = 'devpub';
  const devs = game.developers && game.developers.length ? game.developers.join(', ') : 'Unknown developer';
  const pubs = game.publishers && game.publishers.length ? game.publishers.join(', ') : 'Unknown publisher';
  devpub.textContent = `Developer: ${devs}  ·  Publisher: ${pubs}`;
  body.appendChild(devpub);

  if (game.shortDescription) {
    const desc = document.createElement('p');
    desc.className = 'description';
    desc.textContent = game.shortDescription;
    body.appendChild(desc);
  }

  if (game.tags && game.tags.length > 0) {
    const chips = document.createElement('div');
    chips.className = 'tag-chips readonly';
    for (const tag of game.tags.slice(0, 8)) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = tag;
      chips.appendChild(chip);
    }
    body.appendChild(chips);
  }

  const metaRow = document.createElement('div');
  metaRow.className = 'meta-row';

  const released = document.createElement('span');
  released.textContent = `Release: ${game.releaseDate || 'TBD'}`;
  metaRow.appendChild(released);

  const priceEl = document.createElement('span');
  priceEl.className = 'price';
  priceEl.textContent = game.price.isFree ? 'Free to Play' : game.price.priceText || 'TBD';
  metaRow.appendChild(priceEl);

  if (game.status && game.status !== 'new') {
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${game.status}`;
    statusBadge.textContent = game.status;
    metaRow.appendChild(statusBadge);
  }

  body.appendChild(metaRow);
  body.appendChild(actionsForStatus(game));

  card.appendChild(body);
  return card;
}

function renderGames(games, emptyMessage) {
  resultsEl.innerHTML = '';
  if (games.length === 0) {
    resultsEl.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
    return;
  }
  for (const game of games) {
    resultsEl.appendChild(renderCard(game));
  }
}

async function fetchWithTimeout(url, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadNew() {
  const params = new URLSearchParams({
    term: document.getElementById('term').value || '',
  });
  if (selectedTags.size > 0) params.set('tags', [...selectedTags].join(','));

  statusEl.textContent = 'Loading...';
  refreshBtn.disabled = true;
  resultsEl.innerHTML = '';

  try {
    const res = await fetchWithTimeout(`/api/games?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');

    if (data.bootstrap) {
      resultsEl.innerHTML = `<div class="empty-state">${data.message}</div>`;
      statusEl.textContent = 'Baseline seeded.';
      return;
    }

    renderGames(data.games, 'No new unreleased pages match these filters in the last 3 days.');
    const queueNote = data.queueRemaining > 0
      ? ` ${data.queueRemaining} newly-spotted app id(s) still being checked - refresh again shortly.`
      : '';
    statusEl.textContent = `${data.count} new page(s) found (first seen within 3 days, not yet actioned).${queueNote} Last refreshed ${new Date().toLocaleTimeString()}.`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    resultsEl.innerHTML = '<div class="empty-state">Could not load results. Try refreshing.</div>';
  } finally {
    refreshBtn.disabled = false;
  }
}

async function loadListTab(endpoint, emptyMessage) {
  statusEl.textContent = 'Loading...';
  refreshBtn.disabled = true;
  resultsEl.innerHTML = '';

  try {
    const res = await fetchWithTimeout(endpoint);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    renderGames(data.games, emptyMessage);
    statusEl.textContent = `${data.games.length} game(s).`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    refreshBtn.disabled = false;
  }
}

function loadTab(tab) {
  if (tab === 'new') return loadNew();
  if (tab === 'shortlist') return loadListTab('/api/shortlist', 'No shortlisted games yet.');
  if (tab === 'history') return loadListTab('/api/history', 'No games have been reviewed yet.');
}

for (const btn of tabButtons) {
  btn.addEventListener('click', () => {
    for (const b of tabButtons) b.classList.remove('active');
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    form.hidden = activeTab !== 'new';
    loadTab(activeTab);
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  loadTab('new');
});

loadTagList();
renderSelectedTags();
loadTab(activeTab);
