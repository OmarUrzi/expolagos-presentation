const CONFIG = {
  galleryMode: "collage",
  ui: {
    cover: "PORTADA.jpeg",
    MICE: "PORTADA MICE.jpg",
    Leisure: "PORTADA LEISURE.jpg",
  },
  sections: {
    MICE: [
      { name: "ADVENTURE", prefix: "ADVENTURE MICE/" },
      { name: "BE LOCAL", prefix: "BE LOCAL MICE/" },
      { name: "FOOD", prefix: "FOOD MICE/" },
      { name: "LAKE", prefix: "LAKE MICE/" },
      { name: "MOUNTAIN", prefix: "MOUNTAIN MICE/" },
      { name: "PARTY", prefix: "PARTY MICE/" },
      { name: "TRANSPORTATION", prefix: "TRANSPORTATION MICE/" },
      { name: "WILD", prefix: "WILD MICE/" },
      { name: "WINTER", prefix: "WINTER MICE/" },
    ],
    Leisure: [
      { name: "ADVENTURE", prefix: "ADVENTURE LEISURE/" },
      { name: "BE LOCAL", prefix: "BE LOCAL LEISURE/" },
      { name: "LAKE", prefix: "LAKE LEISURE/" },
      { name: "MINI CAT", prefix: "MINI CAT LEISURE/" },
      { name: "MOUNTAIN", prefix: "MOUNTAIN LEISURE/" },
      { name: "TRANSPORTATION", prefix: "TRANSPORTATION LEISURE/" },
      { name: "WILD", prefix: "WILD LEISURE/" },
      { name: "WINTER", prefix: "WINTER LEISURE/" },
    ],
  },
};

const OFFLINE_FINGERPRINT_KEY = "expolagos-offline-fingerprint-v2";

const state = {
  section: null,
  category: null,
  images: [],
  videos: [],
  lightboxIndex: 0,
  offlinePlan: null,
};

const $ = (id) => document.getElementById(id);
const imageUrl = (key) => `/img?key=${encodeURIComponent(key)}`;

function ensureVideoSurroundStyles() {
  if (document.getElementById("video-surround-styles")) return;

  const style = document.createElement("style");
  style.id = "video-surround-styles";
  style.textContent = `
    #gallery .video-surround-layout {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }

    #gallery .video-surround-band {
      width: 100%;
      column-count: 5;
      column-gap: 7px;
    }

    #gallery .video-surround-band .gallery-card,
    #gallery .video-surround-side .gallery-card {
      break-inside: avoid;
    }

    #gallery .video-surround-center {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(420px, 1.6fr) minmax(0, 1fr);
      gap: 8px;
      align-items: start;
      width: 100%;
    }

    #gallery .video-surround-side {
      column-count: 2;
      column-gap: 7px;
    }

    #gallery .video-surround-video {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-self: start;
      min-width: 0;
    }

    #gallery .video-surround-video .gallery-video-card {
      width: 100%;
      margin: 0;
      overflow: hidden;
      border-radius: 8px;
      background: #000;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .14);
    }

    #gallery .video-surround-video .gallery-video-card video {
      display: block;
      width: 100%;
      max-height: 72vh;
      background: #000;
      object-fit: contain;
    }

    @media (max-width: 1399px) {
      #gallery .video-surround-band {
        column-count: 4;
      }

      #gallery .video-surround-center {
        grid-template-columns: minmax(0, .9fr) minmax(360px, 1.45fr) minmax(0, .9fr);
      }

      #gallery .video-surround-side {
        column-count: 1;
      }
    }

    @media (max-width: 980px) {
      #gallery .video-surround-band {
        column-count: 3;
      }

      #gallery .video-surround-center {
        grid-template-columns: 1fr;
      }

      #gallery .video-surround-video {
        order: 1;
      }

      #gallery .video-surround-side {
        column-count: 3;
      }

      #gallery .video-surround-side:first-child {
        order: 0;
      }

      #gallery .video-surround-side:last-child {
        order: 2;
      }
    }

    @media (max-width: 650px) {
      #gallery .video-surround-band,
      #gallery .video-surround-side {
        column-count: 2;
      }
    }
  `;

  document.head.appendChild(style);
}

ensureVideoSurroundStyles();

function syncGalleryVideos(screenId) {
  document.querySelectorAll("#gallery video").forEach((video) => {
    if (screenId === "gallery") {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
  $(id).classList.add("active");
  syncGalleryVideos(id);
  window.scrollTo(0, 0);
}

$("coverImage").src = imageUrl(CONFIG.ui.cover);
$("miceCover").src = imageUrl(CONFIG.ui.MICE);
$("leisureCover").src = imageUrl(CONFIG.ui.Leisure);

$("startButton").addEventListener("click", () => showScreen("selector"));
$("selectorHomeButton").addEventListener("click", () => showScreen("cover"));

document.querySelectorAll(".choice-panel").forEach((panel) => {
  panel.addEventListener("click", () => openSection(panel.dataset.section));
});

function openSection(section) {
  state.section = section;
  state.category = null;

  $("categoriesTitle").textContent = section.toUpperCase();
  $("categoriesBackground").style.backgroundImage = `url("${imageUrl(CONFIG.ui[section])}")`;

  const grid = $("categoriesGrid");
  grid.innerHTML = "";

  CONFIG.sections[section].forEach((category) => {
    const button = document.createElement("button");
    button.className = "category-button";
    button.textContent = category.name.toUpperCase();
    button.addEventListener("click", () => openGallery(category));
    grid.appendChild(button);
  });

  showScreen("categories");
}

async function openGallery(category) {
  state.category = category;
  $("galleryTitle").textContent = `${state.section.toUpperCase()} · ${category.name.toUpperCase()}`;
  $("galleryContent").innerHTML = '<div class="loading">Cargando contenido...</div>';
  showScreen("gallery");

  try {
    const response = await fetch(`/api/list?prefix=${encodeURIComponent(category.prefix)}`);
    if (!response.ok) throw new Error("Unable to load gallery");

    const data = await response.json();
    state.images = data.images || [];
    state.videos = data.videos || [];
    renderGallery();
  } catch (error) {
    $("galleryContent").innerHTML = '<div class="error">No se pudo cargar esta galería.</div>';
  }
}

function createImageCard(image, index) {
  const card = document.createElement("button");
  card.className = "gallery-card";
  card.type = "button";
  card.setAttribute("aria-label", `Abrir imagen ${index + 1}`);

  const img = document.createElement("img");
  img.src = image.url;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";

  card.appendChild(img);
  card.addEventListener("click", () => openLightbox(index));
  return card;
}

function createVideoCard(video) {
  const wrapper = document.createElement("div");
  wrapper.className = "gallery-video-card";

  const player = document.createElement("video");
  player.src = video.url;
  player.controls = true;
  player.autoplay = true;
  player.muted = true;
  player.defaultMuted = true;
  player.loop = true;
  player.preload = "auto";
  player.playsInline = true;

  player.setAttribute("autoplay", "");
  player.setAttribute("muted", "");
  player.setAttribute("loop", "");
  player.setAttribute("playsinline", "");
  player.setAttribute("webkit-playsinline", "");

  const tryPlay = () => player.play().catch(() => {});
  player.addEventListener("loadedmetadata", tryPlay, { once: true });
  player.addEventListener("canplay", tryPlay, { once: true });

  wrapper.appendChild(player);
  requestAnimationFrame(tryPlay);
  return wrapper;
}

function appendImageRange(container, entries) {
  entries.forEach(({ image, index }) => {
    container.appendChild(createImageCard(image, index));
  });
}

function renderVideoSurroundGallery(content) {
  const indexedImages = state.images.map((image, index) => ({ image, index }));
  const total = indexedImages.length;

  let topCount = 0;
  let bottomCount = 0;

  if (total >= 4) {
    topCount = Math.min(Math.max(Math.round(total * 0.22), 2), 7);
    bottomCount = Math.min(Math.max(Math.round(total * 0.22), 2), 7);

    while (topCount + bottomCount > Math.max(2, total - 2)) {
      if (bottomCount > topCount) bottomCount -= 1;
      else topCount -= 1;
    }
  }

  const topImages = indexedImages.slice(0, topCount);
  const bottomImages = bottomCount ? indexedImages.slice(total - bottomCount) : [];
  const middleImages = indexedImages.slice(topCount, bottomCount ? total - bottomCount : total);
  const sideSplit = Math.ceil(middleImages.length / 2);
  const leftImages = middleImages.slice(0, sideSplit);
  const rightImages = middleImages.slice(sideSplit);

  const layout = document.createElement("div");
  layout.className = "video-surround-layout";

  if (topImages.length) {
    const top = document.createElement("div");
    top.className = "video-surround-band video-surround-top";
    appendImageRange(top, topImages);
    layout.appendChild(top);
  }

  const centerRow = document.createElement("div");
  centerRow.className = "video-surround-center";

  const left = document.createElement("div");
  left.className = "video-surround-side video-surround-left";
  appendImageRange(left, leftImages);

  const videoCenter = document.createElement("div");
  videoCenter.className = "video-surround-video";
  state.videos.forEach((video) => videoCenter.appendChild(createVideoCard(video)));

  const right = document.createElement("div");
  right.className = "video-surround-side video-surround-right";
  appendImageRange(right, rightImages);

  centerRow.appendChild(left);
  centerRow.appendChild(videoCenter);
  centerRow.appendChild(right);
  layout.appendChild(centerRow);

  if (bottomImages.length) {
    const bottom = document.createElement("div");
    bottom.className = "video-surround-band video-surround-bottom";
    appendImageRange(bottom, bottomImages);
    layout.appendChild(bottom);
  }

  content.appendChild(layout);
}

function renderGallery() {
  const content = $("galleryContent");
  content.innerHTML = "";

  if (!state.images.length && !state.videos.length) {
    content.innerHTML = '<div class="empty">No hay contenido en esta categoría.</div>';
    return;
  }

  if (state.videos.length) {
    renderVideoSurroundGallery(content);
    syncGalleryVideos("gallery");
    return;
  }

  const grid = document.createElement("div");
  grid.className = "gallery-grid";

  if (CONFIG.galleryMode === "selector") {
    grid.classList.add("selector-mode");
  }

  state.images.forEach((image, index) => {
    grid.appendChild(createImageCard(image, index));
  });

  content.appendChild(grid);
}

$("categoriesBack").addEventListener("click", () => showScreen("selector"));
$("galleryBack").addEventListener("click", () => openSection(state.section));

function openLightbox(index) {
  state.lightboxIndex = index;
  updateLightbox();
  $("lightbox").classList.add("active");
}

function updateLightbox() {
  const image = state.images[state.lightboxIndex];
  if (!image) return;

  $("lightboxImage").src = image.url;
  $("lightboxCounter").textContent = `${state.lightboxIndex + 1} / ${state.images.length}`;
}

function changeLightbox(direction) {
  if (!state.images.length) return;

  state.lightboxIndex =
    (state.lightboxIndex + direction + state.images.length) % state.images.length;

  updateLightbox();
}

function closeLightbox() {
  $("lightbox").classList.remove("active");
}

$("lightboxClose").addEventListener("click", closeLightbox);
$("lightboxPrev").addEventListener("click", () => changeLightbox(-1));
$("lightboxNext").addEventListener("click", () => changeLightbox(1));

document.addEventListener("keydown", (event) => {
  if (!$("lightbox").classList.contains("active")) return;
  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowLeft") changeLightbox(-1);
  if (event.key === "ArrowRight") changeLightbox(1);
});

let touchStartX = 0;

$("lightbox").addEventListener(
  "touchstart",
  (event) => {
    touchStartX = event.changedTouches[0].screenX;
  },
  { passive: true },
);

$("lightbox").addEventListener(
  "touchend",
  (event) => {
    const delta = event.changedTouches[0].screenX - touchStartX;
    if (Math.abs(delta) < 55) return;
    changeLightbox(delta < 0 ? 1 : -1);
  },
  { passive: true },
);

const allPrefixes = Object.values(CONFIG.sections)
  .flat()
  .map((category) => category.prefix);

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
}

async function hashText(value) {
  if (!window.crypto?.subtle) return value;

  const encoded = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getOfflinePlan() {
  const response = await fetch("/api/list?prefix=", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to inspect media library");

  const data = await response.json();
  const media = [...(data.media || data.images || [])].sort((a, b) => a.key.localeCompare(b.key));

  const signature = media
    .map((item) => `${item.key}|${item.size || 0}|${item.uploaded || ""}|${item.etag || ""}`)
    .join("\n");

  return {
    fingerprint: await hashText(signature),
    count: media.length,
    bytes: media.reduce((total, item) => total + (item.size || 0), 0),
  };
}

async function refreshOfflineButton() {
  const button = $("offlineButton");

  if (!("serviceWorker" in navigator)) {
    button.hidden = true;
    return;
  }

  const savedFingerprint = localStorage.getItem(OFFLINE_FINGERPRINT_KEY);

  if (!navigator.onLine) {
    button.hidden = true;
    return;
  }

  button.hidden = true;

  try {
    const plan = await getOfflinePlan();
    state.offlinePlan = plan;

    if (savedFingerprint && savedFingerprint === plan.fingerprint) {
      button.hidden = true;
      return;
    }

    button.textContent = savedFingerprint ? "ACTUALIZAR OFFLINE" : "PREPARAR OFFLINE";
    button.hidden = false;
  } catch (error) {
    button.hidden = true;
  }
}

async function prepareOffline() {
  const button = $("offlineButton");
  button.disabled = true;
  $("offlineStatus").classList.add("visible");
  $("offlineText").textContent = "Calculando contenido...";
  $("progressBar").style.width = "0%";

  try {
    if (navigator.storage?.persist) await navigator.storage.persist();

    const plan = state.offlinePlan || (await getOfflinePlan());
    state.offlinePlan = plan;

    const proceed = window.confirm(
      `Se guardarán ${plan.count} archivos (${formatBytes(plan.bytes)}) en esta tablet. ¿Continuar?`,
    );

    if (!proceed) {
      $("offlineStatus").classList.remove("visible");
      button.disabled = false;
      return;
    }

    $("offlineText").textContent = "Preparando contenido offline...";
    const registration = await navigator.serviceWorker.ready;

    registration.active.postMessage({
      type: "PREPARE_OFFLINE",
      prefixes: allPrefixes,
      uiKeys: [CONFIG.ui.cover, CONFIG.ui.MICE, CONFIG.ui.Leisure],
    });
  } catch (error) {
    $("offlineText").textContent = "No se pudo iniciar la descarga.";
    button.disabled = false;
  }
}

$("offlineButton").addEventListener("click", prepareOffline);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(() => refreshOfflineButton()).catch(() => {
    $("offlineButton").hidden = true;
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data || {};

    if (data.type === "OFFLINE_PROGRESS") {
      const percent = data.total ? Math.round((data.done / data.total) * 100) : 0;
      $("progressBar").style.width = `${percent}%`;
      $("offlineText").textContent = `Preparando contenido offline: ${data.done} / ${data.total}`;
    }

    if (data.type === "OFFLINE_DONE") {
      $("progressBar").style.width = "100%";
      $("offlineButton").disabled = false;

      if (data.failed) {
        $("offlineText").textContent = `Offline preparado parcialmente. ${data.failed} archivos no pudieron guardarse.`;
        $("offlineButton").textContent = "REINTENTAR OFFLINE";
        $("offlineButton").hidden = false;
      } else {
        if (state.offlinePlan?.fingerprint) {
          localStorage.setItem(OFFLINE_FINGERPRINT_KEY, state.offlinePlan.fingerprint);
        }

        $("offlineText").textContent = "Contenido offline listo.";
        $("offlineButton").hidden = true;
      }

      setTimeout(() => $("offlineStatus").classList.remove("visible"), 3500);
    }
  });
} else {
  $("offlineButton").hidden = true;
}

window.addEventListener("online", refreshOfflineButton);
window.addEventListener("offline", () => {
  $("offlineButton").hidden = true;
});
