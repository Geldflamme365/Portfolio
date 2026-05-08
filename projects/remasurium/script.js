const state = {
  results: [],
  searchSelection: null,
  searchPrints: [],
  searchFaceIndex: 0,
  collectionSelection: null,
  collectionPrints: [],
  collectionFaceIndex: 0,
  collection: loadCollection()
};

const els = {
  status: document.getElementById("status"),
  routeAddress: document.getElementById("routeAddress"),
  routeFooter: document.getElementById("routeFooter"),
  searchInput: document.getElementById("searchInput"),
  searchBtn: document.getElementById("searchBtn"),
  results: document.getElementById("results"),
  searchDetails: document.getElementById("searchDetails"),
  searchModal: document.getElementById("searchModal"),
  modalCloseBtn: document.getElementById("modalCloseBtn"),
  collectionModal: document.getElementById("collectionModal"),
  collectionModalCloseBtn: document.getElementById("collectionModalCloseBtn"),
  collection: document.getElementById("collection"),
  collectionDetails: document.getElementById("collectionDetails"),
  resultCountOutputs: document.querySelectorAll("[data-results-count]"),
  collectionCountOutputs: document.querySelectorAll("[data-collection-count]"),
  queryButtons: document.querySelectorAll("[data-query]"),
  randomButtons: document.querySelectorAll("[data-random-card]"),
  views: {
    home: document.getElementById("view-home"),
    suche: document.getElementById("view-suche"),
    collection: document.getElementById("view-collection")
  },
  navLinks: document.querySelectorAll(".nav-link")
};

function setStatus(text, type = "muted") {
  if (!els.status) {
    return;
  }

  els.status.textContent = text;
  els.status.className = `status ${type}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function loadCollection() {
  try {
    return JSON.parse(localStorage.getItem("remasurium.collection") || "[]");
  } catch {
    return [];
  }
}

function saveCollection() {
  localStorage.setItem("remasurium.collection", JSON.stringify(state.collection));
}

function normalizeRoute(hash) {
  const route = hash.replace(/^#\/?/, "").trim().toLowerCase();
  if (!route) {
    return "home";
  }
  if (route === "suche") {
    return "suche";
  }
  if (route === "collection") {
    return "collection";
  }
  return "home";
}

function setActiveNav(route) {
  for (const link of els.navLinks) {
    const target = normalizeRoute(link.getAttribute("href") || "");
    const active = route === target;
    link.classList.toggle("active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  }
}

function updateRouteChrome(route) {
  const labels = {
    home: "scry://remasurium/home",
    suche: "scry://remasurium/search",
    collection: "scry://remasurium/collection"
  };
  const label = labels[route] || labels.home;

  if (els.routeAddress) {
    els.routeAddress.textContent = label;
  }
  if (els.routeFooter) {
    els.routeFooter.textContent = label;
  }
}

function renderRoute() {
  const route = normalizeRoute(window.location.hash);

  Object.entries(els.views).forEach(([name, node]) => {
    node.classList.toggle("active", name === route);
  });

  const titleMap = {
    home: "MTG Remasurium - Home",
    suche: "MTG Remasurium - Suche",
    collection: "MTG Remasurium - Collection"
  };

  document.title = titleMap[route] || "MTG Remasurium";
  setActiveNav(route);
  updateRouteChrome(route);
  closeSearchModal();
  closeCollectionModal();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openSearchRoute() {
  if (normalizeRoute(window.location.hash) !== "suche") {
    window.location.hash = "#/suche";
  } else {
    renderRoute();
  }
}

function openSearchModal() {
  if (!els.searchModal) {
    return;
  }
  els.searchModal.classList.add("open");
  els.searchModal.setAttribute("aria-hidden", "false");
}

function closeSearchModal() {
  if (!els.searchModal) {
    return;
  }
  els.searchModal.classList.remove("open");
  els.searchModal.setAttribute("aria-hidden", "true");
}

function openCollectionModal() {
  if (!els.collectionModal) {
    return;
  }
  els.collectionModal.classList.add("open");
  els.collectionModal.setAttribute("aria-hidden", "false");
}

function closeCollectionModal() {
  if (!els.collectionModal) {
    return;
  }
  els.collectionModal.classList.remove("open");
  els.collectionModal.setAttribute("aria-hidden", "true");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchRandomCard() {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return fetchJson(`https://api.scryfall.com/cards/random?__cb=${encodeURIComponent(nonce)}`, {
    cache: "no-store"
  });
}

async function searchCards(query) {
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=released`;
  const response = await fetch(url);
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.data || [];
}

function hasAdvancedScryfallSyntax(query) {
  return /[:<>=!()"]/u.test(query);
}

async function searchCardsWithTolerance(query) {
  const directResults = await searchCards(query);
  if (directResults.length) {
    return { cards: directResults, mode: "direct" };
  }

  if (hasAdvancedScryfallSyntax(query)) {
    return { cards: [], mode: "none" };
  }

  try {
    const fuzzyCard = await fetchJson(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(query)}`);
    return { cards: [fuzzyCard], mode: "fuzzy", correctedName: fuzzyCard.name };
  } catch {
    try {
      const auto = await fetchJson(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`);
      const suggestion = auto?.data?.[0];
      if (!suggestion) {
        return { cards: [], mode: "none" };
      }

      const exactCard = await fetchJson(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(suggestion)}`);
      return { cards: [exactCard], mode: "autocomplete", correctedName: exactCard.name };
    } catch {
      return { cards: [], mode: "none" };
    }
  }
}

async function loadPrintHistory(card) {
  if (!card || !card.prints_search_uri) {
    return [];
  }
  const data = await fetchJson(card.prints_search_uri);
  return (data.data || []).slice().sort((a, b) => new Date(a.released_at) - new Date(b.released_at));
}

function isInCollection(id) {
  return state.collection.some((item) => item.id === id);
}

function getCardPreviewUrl(card) {
  return (
    card.image_uris?.normal ||
    card.image_uris?.large ||
    card.image_uris?.small ||
    card.card_faces?.[0]?.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.large ||
    card.card_faces?.[0]?.image_uris?.small ||
    ""
  );
}

function updateResultCount() {
  const text = `${state.results.length} ${state.results.length === 1 ? "card" : "cards"}`;
  els.resultCountOutputs.forEach((node) => {
    node.textContent = text;
  });
}

function updateCollectionCount() {
  const text = `${state.collection.length}`;
  els.collectionCountOutputs.forEach((node) => {
    node.textContent = text;
  });
}

function toggleCollection(card) {
  if (!card) {
    return;
  }

  if (isInCollection(card.id)) {
    state.collection = state.collection.filter((item) => item.id !== card.id);
    setStatus(`${card.name} aus Collection entfernt.`, "ok");

    if (state.collectionSelection?.id === card.id) {
      state.collectionSelection = null;
      state.collectionPrints = [];
      closeCollectionModal();
    }
  } else {
    state.collection.unshift({
      id: card.id,
      name: card.name,
      set_name: card.set_name,
      released_at: card.released_at,
      image: getCardPreviewUrl(card)
    });
    setStatus(`${card.name} zur Collection hinzugefügt.`, "ok");
  }

  saveCollection();
  renderCollection();
  renderSearchDetails();
  renderCollectionDetails();
}

function renderResults() {
  updateResultCount();

  if (!state.results.length) {
    els.results.innerHTML = `<div class="empty-state">Noch keine Treffer. Starte eine Suche oder nutze ein Beispiel.</div>`;
    return;
  }

  els.results.innerHTML = `
    <div class="search-grid">
      ${state.results
        .map((card) => {
          const preview = getCardPreviewUrl(card);
          return `
            <button
              type="button"
              class="search-tile${state.searchSelection?.id === card.id ? " active" : ""}"
              data-select="${card.id}"
              title="${escapeHtml(card.name)}"
            >
              <span class="tile-frame">
                ${
                  preview
                    ? `<img src="${escapeHtml(preview)}" alt="${escapeHtml(card.name)}" loading="lazy" />`
                    : `<span class="search-fallback">${escapeHtml(card.name)}</span>`
                }
              </span>
              <span class="tile-caption">${escapeHtml(card.name)}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;

  for (const btn of els.results.querySelectorAll("button[data-select]")) {
    btn.addEventListener("click", () => {
      const card = state.results.find((item) => item.id === btn.dataset.select);
      if (card) {
        selectSearchCard(card);
      }
    });
  }
}

function renderCollection() {
  updateCollectionCount();

  if (!state.collection.length) {
    els.collection.innerHTML = `<div class="empty-state">Noch keine Karten gespeichert.</div>`;
    return;
  }

  els.collection.innerHTML = `
    <div class="collection-grid">
      ${state.collection
        .map(
          (card) => `
            <button
              type="button"
              class="collection-tile${state.collectionSelection?.id === card.id ? " active" : ""}"
              data-pick="${card.id}"
              title="${escapeHtml(card.name)}"
            >
              <span class="tile-frame">
                ${
                  card.image
                    ? `<img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}" loading="lazy" />`
                    : `<span class="collection-fallback">${escapeHtml(card.name)}</span>`
                }
              </span>
              <span class="tile-caption">${escapeHtml(card.name)}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;

  for (const entry of els.collection.querySelectorAll("button[data-pick]")) {
    entry.addEventListener("click", async () => {
      const id = entry.dataset.pick;
      try {
        setStatus("Lade Karte aus Collection...", "muted");
        const card = await fetchJson(`https://api.scryfall.com/cards/${id}`);
        await selectCollectionCard(card);
      } catch (error) {
        setStatus(`Karte konnte nicht geladen werden: ${error.message}`, "err");
      }
    });
  }
}

function updateCollectionPreview(card) {
  const image = getCardPreviewUrl(card);
  if (!image) {
    return;
  }

  let changed = false;
  state.collection = state.collection.map((item) => {
    if (item.id === card.id && item.image !== image) {
      changed = true;
      return { ...item, image };
    }
    return item;
  });

  if (changed) {
    saveCollection();
    renderCollection();
  }
}

function renderVersionList(prints, context) {
  if (!prints.length) {
    return `<p class="small-note">Keine Versionsdaten vorhanden.</p>`;
  }

  return `
    <div class="versions">
      ${prints
        .map(
          (print) => `
            <div class="entry">
              <div>
                <strong>${escapeHtml(print.set_name || "Unbekanntes Set")}</strong><br />
                <small>${escapeHtml(print.collector_number || "?")} - ${escapeHtml(print.released_at || "?")}</small>
              </div>
              <button type="button" data-print="${print.id}" data-context="${context}">Öffnen</button>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function createDetailsHtml(card, prints, context) {
  if (!card) {
    return context === "search"
      ? `<p class="small-note">Noch keine Karte ausgewählt.</p>`
      : `<p class="small-note">Noch keine Karte aus der Collection geöffnet.</p>`;
  }

  const activeFaceIndex = context === "search" ? state.searchFaceIndex : state.collectionFaceIndex;
  const hasFaces = Array.isArray(card.card_faces) && card.card_faces.length > 1;
  const safeFaceIndex = hasFaces ? Math.max(0, Math.min(activeFaceIndex, card.card_faces.length - 1)) : 0;
  const face = hasFaces ? card.card_faces[safeFaceIndex] : null;
  const img = face?.image_uris?.normal || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "";
  const oracleText =
    face?.oracle_text ||
    card.oracle_text ||
    card.card_faces?.map((entry) => entry.oracle_text || "").filter(Boolean).join("\n\n") ||
    "Kein Oracle Text vorhanden.";
  const cardName = face?.name || card.name;
  const typeLine = face?.type_line || card.type_line || "Unbekannter Typ";
  const canFlip =
    hasFaces &&
    card.card_faces.every((entry) => Boolean(entry.image_uris?.normal || entry.image_uris?.large || entry.image_uris?.small));

  return `
    <div class="details-grid">
      <div class="preview-wrap">
        ${img ? `<img class="preview" src="${escapeHtml(img)}" alt="${escapeHtml(cardName)}" />` : `<p class="small-note">Kein Bild vorhanden.</p>`}
        ${
          canFlip
            ? `<button type="button" class="flip-btn" data-flip-face="1" data-context="${context}" aria-label="Kartenseite wechseln" title="Kartenseite wechseln">↻</button>`
            : ""
        }
        <div class="details-actions">
          <button type="button" data-toggle-collection="${card.id}">
            ${isInCollection(card.id) ? "Aus Collection entfernen" : "In Collection speichern"}
          </button>
        </div>
      </div>

      <div class="meta">
        <div>
          <h3>${escapeHtml(cardName)}</h3>
          <p class="small-note">${escapeHtml(typeLine)}</p>
          <div class="pill-row details-pills">
            <span class="pill">Set: ${escapeHtml(card.set_name || "?")}</span>
            <span class="pill">Release: ${escapeHtml(card.released_at || "?")}</span>
            <span class="pill">Rarity: ${escapeHtml(card.rarity || "?")}</span>
          </div>
        </div>

        <div class="analysis">
          <h3>Oracle Text</h3>
          <div class="raw">${escapeHtml(oracleText)}</div>
        </div>

        <div>
          <h3>Vergangene Versionen</h3>
          ${renderVersionList(prints, context)}
        </div>
      </div>
    </div>
  `;
}

function bindDetailsEvents(container, context) {
  const toggleBtn = container.querySelector("button[data-toggle-collection]");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const card = context === "search" ? state.searchSelection : state.collectionSelection;
      toggleCollection(card);
    });
  }

  for (const btn of container.querySelectorAll("button[data-print]")) {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.print;
      const targetContext = btn.dataset.context;

      try {
        setStatus("Lade Version...", "muted");
        const selectedPrint = await fetchJson(`https://api.scryfall.com/cards/${id}`);
        if (targetContext === "search") {
          await selectSearchCard(selectedPrint);
        } else {
          await selectCollectionCard(selectedPrint);
        }
      } catch (error) {
        setStatus(`Version konnte nicht geladen werden: ${error.message}`, "err");
      }
    });
  }

  const flipBtn = container.querySelector("button[data-flip-face]");
  if (flipBtn) {
    flipBtn.addEventListener("click", () => {
      if (context === "search") {
        const faces = state.searchSelection?.card_faces || [];
        if (faces.length > 1) {
          state.searchFaceIndex = state.searchFaceIndex === 0 ? 1 : 0;
          renderSearchDetails();
        }
      } else {
        const faces = state.collectionSelection?.card_faces || [];
        if (faces.length > 1) {
          state.collectionFaceIndex = state.collectionFaceIndex === 0 ? 1 : 0;
          renderCollectionDetails();
        }
      }
    });
  }
}

function renderSearchDetails() {
  els.searchDetails.innerHTML = createDetailsHtml(state.searchSelection, state.searchPrints, "search");
  bindDetailsEvents(els.searchDetails, "search");
}

function renderCollectionDetails() {
  els.collectionDetails.innerHTML = createDetailsHtml(state.collectionSelection, state.collectionPrints, "collection");
  bindDetailsEvents(els.collectionDetails, "collection");
}

async function selectSearchCard(card) {
  state.searchSelection = card;
  state.searchFaceIndex = 0;
  renderResults();
  renderSearchDetails();
  openSearchModal();
  setStatus(`Lade Versionshistorie für ${card.name}...`, "muted");

  try {
    state.searchPrints = await loadPrintHistory(card);
    renderSearchDetails();
    setStatus(`Karte geladen: ${card.name}`, "ok");
  } catch (error) {
    state.searchPrints = [];
    renderSearchDetails();
    setStatus(`Versionshistorie konnte nicht geladen werden: ${error.message}`, "err");
  }
}

async function selectCollectionCard(card) {
  state.collectionSelection = card;
  state.collectionFaceIndex = 0;
  updateCollectionPreview(card);
  renderCollection();
  renderCollectionDetails();
  openCollectionModal();
  setStatus(`Lade Versionshistorie für ${card.name}...`, "muted");

  try {
    state.collectionPrints = await loadPrintHistory(card);
    renderCollectionDetails();
    setStatus(`Collection-Karte geladen: ${card.name}`, "ok");
  } catch (error) {
    state.collectionPrints = [];
    renderCollectionDetails();
    setStatus(`Versionshistorie konnte nicht geladen werden: ${error.message}`, "err");
  }
}

async function runSearch() {
  const query = els.searchInput.value.trim();
  if (!query) {
    setStatus("Bitte einen Suchbegriff eingeben.", "err");
    return;
  }

  setStatus(`Suche nach ${query}...`, "muted");
  try {
    const result = await searchCardsWithTolerance(query);
    state.results = result.cards;
    renderResults();

    if (state.results.length) {
      if (result.mode === "fuzzy" || result.mode === "autocomplete") {
        setStatus(`Kein exakter Treffer. Zeige ähnlichen Treffer: ${result.correctedName}`, "ok");
      } else {
        setStatus(`${state.results.length} Treffer gefunden.`, "ok");
      }
    } else {
      state.searchSelection = null;
      state.searchPrints = [];
      renderSearchDetails();
      setStatus("Keine Treffer gefunden.", "err");
    }
  } catch (error) {
    state.results = [];
    state.searchSelection = null;
    state.searchPrints = [];
    renderResults();
    renderSearchDetails();
    setStatus(`Fehler bei der Suche: ${error.message}`, "err");
  }
}

async function loadRandomCard() {
  openSearchRoute();
  setStatus("Ziehe Zufallskarte...", "muted");

  try {
    const card = await fetchRandomCard();
    state.results = [card];
    renderResults();
    await selectSearchCard(card);
    setStatus(`Zufallskarte geladen: ${card.name}`, "ok");
  } catch (error) {
    setStatus(`Zufallskarte konnte nicht geladen werden: ${error.message}`, "err");
  }
}

function bindQueryButtons() {
  els.queryButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const query = button.dataset.query || "";
      els.searchInput.value = query;
      openSearchRoute();

      if (button.dataset.autorun === "true") {
        await runSearch();
      }
    });
  });
}

function bindRandomButtons() {
  els.randomButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      await loadRandomCard();
    });
  });
}

els.searchBtn.addEventListener("click", runSearch);
els.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    runSearch();
  }
});

window.addEventListener("hashchange", renderRoute);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSearchModal();
    closeCollectionModal();
  }
});

if (els.modalCloseBtn) {
  els.modalCloseBtn.addEventListener("click", closeSearchModal);
}

if (els.searchModal) {
  els.searchModal.addEventListener("click", (event) => {
    if (event.target === els.searchModal) {
      closeSearchModal();
    }
  });
}

if (els.collectionModalCloseBtn) {
  els.collectionModalCloseBtn.addEventListener("click", closeCollectionModal);
}

if (els.collectionModal) {
  els.collectionModal.addEventListener("click", (event) => {
    if (event.target === els.collectionModal) {
      closeCollectionModal();
    }
  });
}

bindQueryButtons();
bindRandomButtons();
renderResults();
renderSearchDetails();
renderCollection();
renderCollectionDetails();
renderRoute();
setStatus("Bereit. Gib einen Suchbegriff ein.", "muted");
