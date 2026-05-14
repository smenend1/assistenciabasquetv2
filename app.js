import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCTJQavGjQzQPtjGn1Ev6QVL78-Hs2Sr10",
  authDomain: "assistencia-basquet.firebaseapp.com",
  projectId: "assistencia-basquet",
  storageBucket: "assistencia-basquet.firebasestorage.app",
  messagingSenderId: "1047941126045",
  appId: "1:1047941126045:web:c0113a5e46a3620e3ec174"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const META_DOC_ID = "_meta";
const STORAGE_KEY = "assistenciaBasquetConfigV2";

const STATUS = {
  present: {
    label: "Present",
    short: "P",
    className: "present"
  },
  absent: {
    label: "Absent",
    short: "A",
    className: "absent"
  },
  justified: {
    label: "Justificat",
    short: "J",
    className: "justified"
  }
};

const state = {
  config: loadConfig(),
  entityId: "",
  teamName: "",
  teamId: "",
  date: getTodayISO(),
  locked: false,
  players: new Map(),
  unsubscribePlayers: null,
  unsubscribeAttendance: null,
  unsubscribeLock: null
};

const $ = (selector) => document.querySelector(selector);

const screenHome = $("#screen-home");
const screenAttendance = $("#screen-attendance");

const entitySelect = $("#entity-select");
const teamSelect = $("#team-select");

const newEntityInput = $("#new-entity-id");
const newTeamInput = $("#new-team-name");

const addEntityBtn = $("#add-entity-btn");
const addTeamBtn = $("#add-team-btn");
const deleteEntityBtn = $("#delete-entity-btn");
const deleteTeamBtn = $("#delete-team-btn");
const openAttendanceBtn = $("#open-attendance-btn");

const backHomeBtn = $("#back-home-btn");
const attendanceDateInput = $("#attendance-date");

const teamTitle = $("#team-title");
const contextTitle = $("#context-title");

const csvInput = $("#csv-input");
const closeDayBtn = $("#close-day-btn");
const lockedBanner = $("#locked-banner");

const playersList = $("#players-list");
const toast = $("#toast");

attendanceDateInput.value = state.date;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("No s'ha pogut registrar el Service Worker:", error);
    });
  });
}

migrateOldSingleEntityConfig();
renderHomeSelectors();

entitySelect.addEventListener("change", () => {
  state.config.selectedEntityId = entitySelect.value;
  state.config.selectedTeamIdByEntity[state.config.selectedEntityId] =
    getCurrentEntity()?.teams?.[0]?.id || "";

  saveConfig();
  renderHomeSelectors();
});

teamSelect.addEventListener("change", () => {
  const entityId = entitySelect.value;

  if (!entityId) return;

  state.config.selectedTeamIdByEntity[entityId] = teamSelect.value;
  saveConfig();
});

addEntityBtn.addEventListener("click", () => {
  const entityId = normalizeId(newEntityInput.value);

  if (!entityId) {
    showToast("Escriu un ID d’entitat vàlid.");
    return;
  }

  if (!state.config.entities.some((entity) => entity.id === entityId)) {
    state.config.entities.push({
      id: entityId,
      name: entityId,
      teams: []
    });
  }

  state.config.selectedEntityId = entityId;
  state.config.selectedTeamIdByEntity[entityId] ||= "";

  newEntityInput.value = "";

  saveConfig();
  renderHomeSelectors();

  showToast("Entitat afegida.");
});

addTeamBtn.addEventListener("click", () => {
  const entity = getCurrentEntity();

  if (!entity) {
    showToast("Primer escull o afegeix una entitat.");
    return;
  }

  const teamName = newTeamInput.value.trim();

  if (!teamName) {
    showToast("Escriu el nom de l’equip.");
    return;
  }

  const teamId = normalizeId(teamName);

  if (!entity.teams.some((team) => team.id === teamId)) {
    entity.teams.push({
      id: teamId,
      name: teamName
    });
  }

  state.config.selectedTeamIdByEntity[entity.id] = teamId;
  newTeamInput.value = "";

  saveConfig();
  renderHomeSelectors();

  showToast("Equip afegit.");
});

deleteEntityBtn.addEventListener("click", () => {
  const entity = getCurrentEntity();

  if (!entity) {
    showToast("No hi ha cap entitat seleccionada.");
    return;
  }

  const confirmed = window.confirm(
    `Vols esborrar "${entity.id}" d’aquest dispositiu? No s’esborren dades de Firebase.`
  );

  if (!confirmed) return;

  state.config.entities = state.config.entities.filter((item) => item.id !== entity.id);
  delete state.config.selectedTeamIdByEntity[entity.id];

  state.config.selectedEntityId = state.config.entities[0]?.id || "";

  saveConfig();
  renderHomeSelectors();

  showToast("Entitat esborrada d’aquest dispositiu.");
});

deleteTeamBtn.addEventListener("click", () => {
  const entity = getCurrentEntity();
  const team = getCurrentTeam();

  if (!entity || !team) {
    showToast("No hi ha cap equip seleccionat.");
    return;
  }

  const confirmed = window.confirm(
    `Vols esborrar "${team.name}" d’aquest dispositiu? No s’esborren dades de Firebase.`
  );

  if (!confirmed) return;

  entity.teams = entity.teams.filter((item) => item.id !== team.id);
  state.config.selectedTeamIdByEntity[entity.id] = entity.teams[0]?.id || "";

  saveConfig();
  renderHomeSelectors();

  showToast("Equip esborrat d’aquest dispositiu.");
});

openAttendanceBtn.addEventListener("click", () => {
  const entity = getCurrentEntity();
  const team = getCurrentTeam();

  if (!entity) {
    showToast("Afegeix o selecciona una entitat.");
    return;
  }

  if (!team) {
    showToast("Afegeix o selecciona un equip.");
    return;
  }

  state.entityId = entity.id;
  state.teamId = team.id;
  state.teamName = team.name;

  openAttendance();
});

backHomeBtn.addEventListener("click", () => {
  cleanupSubscriptions();
  showHome();
});

attendanceDateInput.addEventListener("change", () => {
  state.date = attendanceDateInput.value || getTodayISO();

  if (state.entityId && state.teamId) {
    openAttendance();
  }
});

csvInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];

  if (!file) return;

  try {
    if (state.locked) {
      showToast("No es pot importar: el dia està tancat.");
      csvInput.value = "";
      return;
    }

    const text = await readFileAsUTF8(file);
    const rows = parseCSV(text);
    const players = rowsToPlayers(rows);

    if (!players.length) {
      showToast("No s’han trobat alumnes vàlids al CSV.");
      return;
    }

    await importPlayers(players);

    showToast(`${players.length} alumne/s importats.`);
  } catch (error) {
    console.error(error);
    showToast("Error important el CSV.");
  } finally {
    csvInput.value = "";
  }
});

closeDayBtn.addEventListener("click", async () => {
  if (state.locked) {
    showToast("El dia ja està tancat.");
    return;
  }

  const confirmed = window.confirm(
    "Segur que vols tancar el dia? Després no es podrà modificar l’assistència des de l’app."
  );

  if (!confirmed) return;

  try {
    await closeDay();
    showToast("Dia tancat correctament.");
  } catch (error) {
    console.error(error);
    showToast("No s’ha pogut tancar el dia.");
  }
});

function renderHomeSelectors() {
  const entities = state.config.entities;

  entitySelect.innerHTML = "";

  if (!entities.length) {
    entitySelect.innerHTML = `<option value="">Cap entitat guardada</option>`;
  } else {
    for (const entity of entities) {
      const option = document.createElement("option");
      option.value = entity.id;
      option.textContent = entity.id;
      entitySelect.appendChild(option);
    }

    if (!entities.some((entity) => entity.id === state.config.selectedEntityId)) {
      state.config.selectedEntityId = entities[0].id;
    }

    entitySelect.value = state.config.selectedEntityId;
  }

  renderTeamSelector();
}

function renderTeamSelector() {
  const entity = getCurrentEntity();

  teamSelect.innerHTML = "";

  if (!entity) {
    teamSelect.innerHTML = `<option value="">Primer escull una entitat</option>`;
    return;
  }

  if (!entity.teams.length) {
    teamSelect.innerHTML = `<option value="">Cap equip guardat</option>`;
    return;
  }

  for (const team of entity.teams) {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = team.name;
    teamSelect.appendChild(option);
  }

  const selectedTeamId = state.config.selectedTeamIdByEntity[entity.id];

  if (!entity.teams.some((team) => team.id === selectedTeamId)) {
    state.config.selectedTeamIdByEntity[entity.id] = entity.teams[0].id;
  }

  teamSelect.value = state.config.selectedTeamIdByEntity[entity.id];
}

function getCurrentEntity() {
  const selectedId = state.config.selectedEntityId || entitySelect.value;

  return state.config.entities.find((entity) => entity.id === selectedId) || null;
}

function getCurrentTeam() {
  const entity = getCurrentEntity();

  if (!entity) return null;

  const selectedTeamId = state.config.selectedTeamIdByEntity[entity.id] || teamSelect.value;

  return entity.teams.find((team) => team.id === selectedTeamId) || null;
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {
        entities: [],
        selectedEntityId: "",
        selectedTeamIdByEntity: {}
      };
    }

    const parsed = JSON.parse(raw);

    return {
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      selectedEntityId: parsed.selectedEntityId || "",
      selectedTeamIdByEntity: parsed.selectedTeamIdByEntity || {}
    };
  } catch {
    return {
      entities: [],
      selectedEntityId: "",
      selectedTeamIdByEntity: {}
    };
  }
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
}

function migrateOldSingleEntityConfig() {
  const oldEntityId = localStorage.getItem("entityId");

  if (!oldEntityId) return;

  const normalized = normalizeId(oldEntityId);

  if (!normalized) return;

  if (!state.config.entities.some((entity) => entity.id === normalized)) {
    state.config.entities.push({
      id: normalized,
      name: normalized,
      teams: []
    });

    state.config.selectedEntityId = normalized;
    state.config.selectedTeamIdByEntity[normalized] ||= "";

    saveConfig();
  }
}

function openAttendance() {
  cleanupSubscriptions();

  state.players.clear();
  state.locked = false;

  attendanceDateInput.value = state.date;
  teamTitle.textContent = state.teamName;
  contextTitle.textContent = `${state.entityId} · ${formatDate(state.date)}`;

  renderLockState();
  renderPlayers();

  showAttendance();

  subscribeToLock();
  subscribeToPlayers();
  subscribeToAttendance();
}

function getPlayersCollectionRef() {
  return collection(db, "entitats", state.entityId, "equips", state.teamId, "jugadors");
}

function getAttendanceCollectionRef() {
  return collection(db, "assistencies", state.entityId, "dies", state.date, "registres");
}

function getLockRef() {
  return doc(db, "assistencies", state.entityId, "dies", state.date, "meta", META_DOC_ID);
}

function subscribeToLock() {
  const lockRef = getLockRef();

  state.unsubscribeLock = onSnapshot(
    lockRef,
    (snapshot) => {
      state.locked = snapshot.exists() && snapshot.data().locked === true;

      renderLockState();
      renderPlayers();
    },
    (error) => {
      console.error("Error sincronitzant bloqueig:", error);
      showToast("Error sincronitzant el bloqueig.");
    }
  );
}

function subscribeToPlayers() {
  const playersQuery = query(
    getPlayersCollectionRef(),
    orderBy("dorsalNumber", "asc")
  );

  state.unsubscribePlayers = onSnapshot(
    playersQuery,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();

        if (change.type === "removed") {
          state.players.delete(change.doc.id);
          return;
        }

        const previous = state.players.get(change.doc.id) || {};

        state.players.set(change.doc.id, {
          ...previous,
          playerId: change.doc.id,
          name: data.name,
          dorsal: data.dorsal,
          dorsalNumber: data.dorsalNumber
        });
      });

      renderPlayers();
    },
    (error) => {
      console.error("Error sincronitzant jugadors:", error);
      showToast("Error carregant jugadors.");
    }
  );
}

function subscribeToAttendance() {
  const attendanceQuery = query(
    getAttendanceCollectionRef(),
    where("teamId", "==", state.teamId)
  );

  state.unsubscribeAttendance = onSnapshot(
    attendanceQuery,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        const existing = state.players.get(change.doc.id) || {};

        if (change.type === "removed") {
          state.players.set(change.doc.id, {
            ...existing,
            status: "absent"
          });
          return;
        }

        state.players.set(change.doc.id, {
          ...existing,
          playerId: change.doc.id,
          status: data.status || "absent"
        });
      });

      renderPlayers();
    },
    (error) => {
      console.error("Error sincronitzant assistència:", error);
      showToast("Error sincronitzant assistència.");
    }
  );
}

function renderPlayers() {
  const players = Array.from(state.players.values())
    .filter((player) => player.name)
    .sort((a, b) => {
      const aNum = Number(a.dorsalNumber);
      const bNum = Number(b.dorsalNumber);

      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return aNum - bNum;
      }

      return String(a.name).localeCompare(String(b.name), "ca");
    });

  if (!players.length) {
    playersList.innerHTML = `
      <div class="empty-state">
        Encara no hi ha jugadors. Importa un CSV per començar.
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  players.forEach((player) => {
    const status = player.status || "absent";

    const row = document.createElement("div");
    row.className = "player-row";

    row.innerHTML = `
      <div class="sticky-col">
        <div class="player-name">${escapeHTML(player.name)}</div>
        <div class="player-sub">${escapeHTML(STATUS[status]?.label || "Absent")}</div>
      </div>

      <div>
        <span class="dorsal">${escapeHTML(player.dorsal || "-")}</span>
      </div>

      ${renderStatusCell(player.playerId, "present", status)}
      ${renderStatusCell(player.playerId, "absent", status)}
      ${renderStatusCell(player.playerId, "justified", status)}
    `;

    row.querySelectorAll("[data-status]").forEach((button) => {
      button.addEventListener("click", () => {
        updatePlayerStatus(player.playerId, button.dataset.status);
      });
    });

    fragment.appendChild(row);
  });

  playersList.replaceChildren(fragment);
}

function renderStatusCell(playerId, statusKey, currentStatus) {
  const config = STATUS[statusKey];
  const active = currentStatus === statusKey ? "active" : "";

  return `
    <div>
      <button
        class="status-btn ${config.className} ${active}"
        data-player-id="${escapeHTML(playerId)}"
        data-status="${statusKey}"
        ${state.locked ? "disabled" : ""}
        aria-label="${config.label}"
        title="${config.label}"
      >
        ${config.short}
      </button>
    </div>
  `;
}

async function updatePlayerStatus(playerId, nextStatus) {
  if (state.locked) {
    showToast("Només lectura: el dia està tancat.");
    return;
  }

  if (!STATUS[nextStatus]) {
    showToast("Estat no vàlid.");
    return;
  }

  const lockRef = getLockRef();
  const attendanceRef = doc(getAttendanceCollectionRef(), playerId);

  try {
    await runTransaction(db, async (transaction) => {
      const lockSnap = await transaction.get(lockRef);

      if (lockSnap.exists() && lockSnap.data().locked === true) {
        throw new Error("DAY_LOCKED");
      }

      transaction.set(
        attendanceRef,
        {
          entityId: state.entityId,
          teamId: state.teamId,
          teamName: state.teamName,
          playerId,
          date: state.date,
          status: nextStatus,
          updatedAt: serverTimestamp(),
          updatedByClient: getClientId()
        },
        { merge: true }
      );
    });
  } catch (error) {
    if (error.message === "DAY_LOCKED") {
      showToast("No es pot modificar: el dia acaba de ser tancat.");
      return;
    }

    console.error(error);
    showToast("No s’ha pogut actualitzar.");
  }
}

async function importPlayers(players) {
  const lockSnap = await getDoc(getLockRef());

  if (lockSnap.exists() && lockSnap.data().locked === true) {
    state.locked = true;
    renderLockState();
    throw new Error("DAY_LOCKED");
  }

  const writes = [];

  for (const player of players) {
    const playerId = buildPlayerId(player);
    const playerRef = doc(getPlayersCollectionRef(), playerId);
    const attendanceRef = doc(getAttendanceCollectionRef(), playerId);

    writes.push(
      setDoc(
        playerRef,
        {
          playerId,
          entityId: state.entityId,
          teamId: state.teamId,
          teamName: state.teamName,
          name: player.name,
          dorsal: player.dorsal,
          dorsalNumber: toSortableNumber(player.dorsal),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
    );

    writes.push(
      setDoc(
        attendanceRef,
        {
          entityId: state.entityId,
          teamId: state.teamId,
          teamName: state.teamName,
          playerId,
          date: state.date,
          status: "absent",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
    );
  }

  await Promise.all(writes);
}

async function closeDay() {
  const lockRef = getLockRef();

  await runTransaction(db, async (transaction) => {
    const lockSnap = await transaction.get(lockRef);

    if (lockSnap.exists() && lockSnap.data().locked === true) {
      return;
    }

    transaction.set(
      lockRef,
      {
        locked: true,
        entityId: state.entityId,
        date: state.date,
        lockedAt: serverTimestamp(),
        lockedByClient: getClientId()
      },
      { merge: true }
    );
  });
}

function renderLockState() {
  lockedBanner.classList.toggle("hidden", !state.locked);

  closeDayBtn.disabled = state.locked;
  closeDayBtn.textContent = state.locked ? "Dia Tancat" : "Tancar Dia";

  const fileLabel = document.querySelector(".file-btn");
  if (fileLabel) {
    fileLabel.classList.toggle("disabled", state.locked);
  }
}

function parseCSV(text) {
  const cleanText = String(text || "").replace(/^\uFEFF/, "");

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const next = cleanText[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i++;
      }

      row.push(cell.trim());

      if (row.some(Boolean)) {
        rows.push(row);
      }

      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());

  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function rowsToPlayers(rows) {
  if (!rows.length) return [];

  const firstRow = rows[0].map(normalizeHeader);

  const hasHeader =
    firstRow.includes("nom") ||
    firstRow.includes("nombre") ||
    firstRow.includes("dorsal");

  let startIndex = 0;
  let nameIndex = 0;
  let dorsalIndex = 1;

  if (hasHeader) {
    startIndex = 1;

    nameIndex = firstRow.includes("nom")
      ? firstRow.indexOf("nom")
      : firstRow.indexOf("nombre");

    if (nameIndex < 0) nameIndex = 0;

    dorsalIndex = firstRow.indexOf("dorsal");
    if (dorsalIndex < 0) dorsalIndex = 1;
  }

  const seen = new Set();

  return rows
    .slice(startIndex)
    .map((row) => ({
      name: String(row[nameIndex] || "").trim(),
      dorsal: String(row[dorsalIndex] || "").trim()
    }))
    .filter((player) => {
      if (!player.name) return false;

      const key = `${player.name.toLowerCase()}-${player.dorsal}`;

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

function readFileAsUTF8(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);

    reader.readAsText(file, "UTF-8");
  });
}

function cleanupSubscriptions() {
  if (typeof state.unsubscribePlayers === "function") {
    state.unsubscribePlayers();
    state.unsubscribePlayers = null;
  }

  if (typeof state.unsubscribeAttendance === "function") {
    state.unsubscribeAttendance();
    state.unsubscribeAttendance = null;
  }

  if (typeof state.unsubscribeLock === "function") {
    state.unsubscribeLock();
    state.unsubscribeLock = null;
  }
}

function showHome() {
  screenAttendance.classList.remove("active");
  screenHome.classList.add("active");
  renderHomeSelectors();
}

function showAttendance() {
  screenHome.classList.remove("active");
  screenAttendance.classList.add("active");
}

function getTodayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offset * 60 * 1000);

  return localDate.toISOString().slice(0, 10);
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);

  return new Intl.DateTimeFormat("ca-ES", {
    dateStyle: "full"
  }).format(new Date(year, month - 1, day));
}

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function buildPlayerId(player) {
  return normalizeId(`${player.dorsal || "sd"}_${player.name}`);
}

function toSortableNumber(value) {
  const number = Number(String(value || "").replace(/[^\d.-]/g, ""));

  return Number.isFinite(number) ? number : 9999;
}

function getClientId() {
  let clientId = localStorage.getItem("clientId");

  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem("clientId", clientId);
  }

  return clientId;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");

  window.clearTimeout(showToast.timeout);

  showToast.timeout = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 2800);
}
