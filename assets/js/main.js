"use strict";

const STORAGE_KEY = "brkalendar-open-doors-v2";

const doorsContainer = document.getElementById("doors");
const overlay = document.getElementById("surpriseOverlay");
const overlayCard = document.getElementById("surpriseCard");
const calendarElement = document.getElementById("calendar");

let activeDoor = null;
let lastFocusedDoor = null;
let overlayClosingTimeout = null;

const isMobile =
  window.matchMedia &&
  window.matchMedia("(max-width: 600px)").matches;

// -----------------------------
// Persistenz für geöffnete Türchen
// -----------------------------
const readPersistedDoors = () => {
  if (!("localStorage" in window)) return new Set();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored)
      ? new Set(stored.map((value) => String(value)))
      : new Set();
  } catch (error) {
    console.warn("Konnte gespeicherte Türchen nicht laden.", error);
    return new Set();
  }
};

const openedDoors = readPersistedDoors();

const persistOpenedDoors = () => {
  if (!("localStorage" in window)) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Array.from(openedDoors))
    );
  } catch (error) {
    console.warn("Konnte den Status der Türchen nicht speichern.", error);
  }
};

// -----------------------------
// Schneeflocken / Animation
// -----------------------------
const snowflakeChars = ["❄", "❅", "❆"];

const createSnowflake = (options = {}) => {
  const snowflake = document.createElement("div");
  snowflake.className = "snowflake";
  snowflake.textContent =
    options.char ||
    snowflakeChars[Math.floor(Math.random() * snowflakeChars.length)];

  const width = window.innerWidth || document.documentElement.clientWidth;
  const offset = Math.random() * (width + 200) - 100;
  snowflake.style.left = `${offset}px`;

  const duration = options.duration || Math.random() * 7 + 4;
  snowflake.style.animationDuration = `${duration}s`;

  const size = options.size || Math.random() * 12 + 10;
  snowflake.style.fontSize = `${size}px`;

  document.body.appendChild(snowflake);

  snowflake.addEventListener("animationend", () => {
    snowflake.classList.add("resting");
    setTimeout(() => snowflake.remove(), 8000);
  });

  setTimeout(() => {
    if (snowflake.isConnected) {
      snowflake.remove();
    }
  }, duration * 1200);
};

const startAmbientSnowfall = () => {
  const flakesPerTick = isMobile ? 2 : 5;
  const intervalMs = isMobile ? 900 : 550;

  setInterval(() => {
    for (let i = 0; i < flakesPerTick; i++) {
      createSnowflake();
    }
  }, intervalMs);
};

const spawnSnowBurst = (flakes = 260) => {
  const amount = isMobile ? Math.min(flakes, 180) : flakes;

  for (let i = 0; i < amount; i++) {
    createSnowflake({
      duration: Math.random() * 4 + 3,
      size: Math.random() * 14 + 12,
    });
  }
};

// -----------------------------
// Doors / UI-Logik
// -----------------------------
const setDoorState = (door, shouldOpen, options = {}) => {
  const { skipStorage = false } = options;
  const isOpen = door.classList.contains("open");
  if (isOpen === shouldOpen) return;

  door.classList.toggle("open", shouldOpen);
  door.setAttribute("aria-pressed", shouldOpen ? "true" : "false");

  if (!skipStorage) {
    const id = door.dataset.day;
    if (shouldOpen) {
      openedDoors.add(id);
    } else {
      openedDoors.delete(id);
    }
    persistOpenedDoors();
  }
};

const getPrimaryText = (entry) => {
  const textItem = entry.items?.find((item) => item.type === "text");
  if (textItem) return textItem.value;

  const linkItem = entry.items?.find((item) => item.type === "link");
  return linkItem ? linkItem.text : "Festliche Überraschung";
};

const createDoorPreview = (entry) => {
  const preview = document.createElement("div");
  preview.className = "door-content";
  preview.textContent = getPrimaryText(entry).slice(0, 58);

  if (entry.image) {
    preview.style.setProperty(
      "--door-content-image",
      `url("${entry.image}")`
    );
  }
  return preview;
};

// -----------------------------
// Overlay / Dialog
// -----------------------------
const renderOverlayContent = (entry, label) => {
  overlayCard.innerHTML = "";

  if (entry.image) {
    const media = document.createElement("div");
    media.className = "surprise-card__media";
    media.style.backgroundImage = `url("${entry.image}")`;
    overlayCard.appendChild(media);
  }

  const heading = document.createElement("strong");
  heading.textContent = label;
  overlayCard.appendChild(heading);

  (entry.items || []).forEach((item) => {
    if (item.type === "text") {
      const paragraph = document.createElement("p");
      paragraph.textContent = item.value;
      overlayCard.appendChild(paragraph);
    } else if (item.type === "link") {
      const link = document.createElement("a");
      link.href = item.href;
      link.textContent = item.text;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      overlayCard.appendChild(link);
    }
  });
};

const setOverlayOrigin = (door) => {
  const rect = door.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  overlay.style.setProperty("--overlay-start-x", `${originX}px`);
  overlay.style.setProperty("--overlay-start-y", `${originY}px`);
  overlay.style.setProperty(
    "--overlay-translate-x",
    `${originX - centerX}px`
  );
  overlay.style.setProperty(
    "--overlay-translate-y",
    `${originY - centerY}px`
  );
};

const finalizeOverlayHide = (shouldCloseDoor) => {
  overlay.classList.remove("is-visible", "is-closing");
  overlay.setAttribute("aria-hidden", "true");
  overlayCard.innerHTML = "";

  if (
    shouldCloseDoor &&
    activeDoor &&
    activeDoor.classList.contains("open")
  ) {
    setDoorState(activeDoor, false);
  }

  if (lastFocusedDoor && lastFocusedDoor instanceof HTMLElement) {
    lastFocusedDoor.focus();
  }

  activeDoor = null;
  lastFocusedDoor = null;
  overlayClosingTimeout = null;
};

const showOverlay = (entry, door, label) => {
  activeDoor = door;
  lastFocusedDoor = door;
  renderOverlayContent(entry, label);
  setOverlayOrigin(door);

  if (overlayClosingTimeout) {
    clearTimeout(overlayClosingTimeout);
    overlayClosingTimeout = null;
  }

  overlay.classList.remove("is-closing");
  overlay.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    overlay.classList.add("is-visible");
    overlayCard.focus();
  });
};

const hideOverlay = (shouldCloseDoor = false) => {
  if (
    !overlay.classList.contains("is-visible") ||
    overlay.classList.contains("is-closing")
  ) {
    if (
      shouldCloseDoor &&
      activeDoor &&
      activeDoor.classList.contains("open")
    ) {
      setDoorState(activeDoor, false);
    }
    activeDoor = shouldCloseDoor ? null : activeDoor;
    return;
  }

  if (activeDoor) {
    setOverlayOrigin(activeDoor);
  }

  overlay.classList.add("is-closing");

  const handleTransitionEnd = (event) => {
    if (event.target !== overlayCard) return;
    overlayCard.removeEventListener("transitionend", handleTransitionEnd);
    finalizeOverlayHide(shouldCloseDoor);
  };

  overlayCard.addEventListener("transitionend", handleTransitionEnd);

  overlayClosingTimeout = window.setTimeout(() => {
    overlayCard.removeEventListener("transitionend", handleTransitionEnd);
    finalizeOverlayHide(shouldCloseDoor);
  }, 400);
};

const toggleDoor = (door, surprise, label) => {
  const shouldOpen = !door.classList.contains("open");

  if (shouldOpen) {
    setDoorState(door, true);
    // Mehr Schnee beim Öffnen
    spawnSnowBurst(260);
    showOverlay(surprise, door, label);
  } else if (
    activeDoor === door &&
    overlay.classList.contains("is-visible")
  ) {
    hideOverlay(true);
  } else {
    setDoorState(door, false);
  }
};

// -----------------------------
// Hilfsfunktion: Array shufflen (Fisher-Yates)
// -----------------------------
const shuffleArray = (array) => {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// -----------------------------
// Initialisierung des Kalenders
// Türen werden zufällig angeordnet
// -----------------------------
const initCalendar = (doorSurprises) => {
  const totalDoors = doorSurprises.length;

  // Array [1, 2, ..., totalDoors] erstellen und shufflen
  const dayOrder = shuffleArray(
    Array.from({ length: totalDoors }, (_, i) => i + 1)
  );

  for (const day of dayOrder) {
    const door = document.createElement("button");
    door.type = "button";
    door.className = "door";
    door.dataset.day = String(day);
    door.setAttribute("aria-pressed", "false");

    const formattedDay = String(day).padStart(2, "0");
    const label = `Türchen ${formattedDay}`;
    door.setAttribute("aria-label", label);

    door.innerHTML = `
      <span class="door-number">${formattedDay}</span>
      <span class="door-gift">&#9733;</span>
    `;

    // Inhalt: direkt aus dem passenden Index (day-1)
    const surprise = doorSurprises[day - 1] || doorSurprises[0];

    const preview = createDoorPreview(surprise);

    if (surprise.image) {
      door.classList.add("has-image");
      door.style.setProperty(
        "--door-photo",
        `url("${surprise.image}")`
      );
    }

    door.appendChild(preview);

    const curtain = document.createElement("div");
    curtain.className = "door-curtain";
    curtain.innerHTML = `
      <span class="door-curtain-panel left"></span>
      <span class="door-curtain-panel right"></span>
    `;
    door.appendChild(curtain);

    door.addEventListener("click", () =>
      toggleDoor(door, surprise, label)
    );

    doorsContainer.appendChild(door);

    // Öffnungsstatus wiederherstellen – unabhängig von der Position
    if (openedDoors.has(String(day))) {
      setDoorState(door, true, { skipStorage: true });
    }
  }

  startAmbientSnowfall();
};

// -----------------------------
// Globale Event-Listener
// -----------------------------
overlay.addEventListener("click", () => hideOverlay());
overlayCard.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    event.stopPropagation();
    return;
  }
  event.stopPropagation();
  hideOverlay();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideOverlay();
  }
});

// -----------------------------
// Daten aus doors.json laden
// -----------------------------
const loadDoors = async () => {
  try {
    const response = await fetch("assets/data/doors.json", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`HTTP-Fehler: ${response.status}`);
    }
    const data = await response.json();
    const doorSurprises = Array.isArray(data.doors) ? data.doors : [];
    if (!doorSurprises.length) {
      doorsContainer.textContent =
        "Keine Türchen-Daten gefunden. Bitte später erneut versuchen.";
      return;
    }
    initCalendar(doorSurprises);
  } catch (error) {
    console.error("Fehler beim Laden der Türchen-Daten:", error);
    doorsContainer.textContent =
      "Der Kalender konnte nicht geladen werden. Bitte die Seite neu laden oder später erneut versuchen.";
  }
};

loadDoors();
