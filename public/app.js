const CONFIG = {
  ui: {
    cover: "PORTADA.jpeg",
    MICE: "PORTADA MICE.jpg",
    Leisure: "PORTADA LEISURE.jpg",
  },
  sections: {
    MICE: [
      { name: "Adventure", prefix: "ADVENTURE MICE/" },
      { name: "Be Local", prefix: "BE LOCAL MICE/" },
      { name: "Food", prefix: "FOOD MICE/" },
      { name: "Lake", prefix: "LAKE MICE/" },
      { name: "Mountain", prefix: "MOUNTAIN MICE/" },
      { name: "Party", prefix: "PARTY MICE/" },
      { name: "Transportation", prefix: "TRANSPORTATION MICE/" },
      { name: "Wild", prefix: "WILD MICE/" },
      { name: "Winter", prefix: "WINTER MICE/" },
    ],
    Leisure: [
      { name: "Adventure", prefix: "ADVENTURE LEISURE/" },
      { name: "Be Local", prefix: "BE LOCAL LEISURE/" },
      { name: "Lake", prefix: "LAKE LEISURE/" },
      { name: "Mini Cat", prefix: "MINI CAT LEISURE/" },
      { name: "Mountain", prefix: "MOUNTAIN LEISURE/" },
      { name: "Transportation", prefix: "TRANSPORTATION LEISURE/" },
      { name: "Wild", prefix: "WILD LEISURE/" },
      { name: "Winter", prefix: "WINTER LEISURE/" },
    ],
  },
};

const state = {
  section: null,
  category: null,
  images: [],
  lightboxIndex: 0,
};

const $ = (id) => document.getElementById(id);
const imageUrl = (key) => `/img?key=${encodeURIComponent(key)}`;

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo(0, 0);
}

$("coverImage").src = imageUrl(CONFIG.ui.cover);
$("miceCover").src = imageUrl(CONFIG.ui.MICE);
$("leisureCover").src = imageUrl(CONFIG.ui.Leisure);

$("startButton").addEventListener("click", () => showScreen("selector"));

document.querySelectorAll(".choice-panel").forEach((panel) => {
  panel.addEventListener("click", () => openSection(panel.dataset.section));
});

function openSection(section) {
  state.section = section;
  state.category = null;

  $("categoriesTitle").textContent = section;
  $("categoriesBackground").style.backgroundImage = `url("${imageUrl(CONFIG.ui[section])}")`;

  const grid = $("categoriesGrid");
  grid.innerHTML = "";

  CONFIG.sections[section].forEach((category) => {
    const button = document.createElement("button");
    button.className = "category-button";
    button.textContent = category.name;
    button.addEventListener("click", () => openGallery(category));
    grid.appendChild(button);
  });

  showScreen("categories");
}

async function openGallery(category) {
  state.category = category;
  $("galleryTitle").textContent = `${state.section} · ${category.name}`;
  $("galleryContent").innerHTML = '<div class="loading">Cargando imágenes...</div>';
  showScreen("gallery");

  try {
    const response = await fetch(`/api/list?prefix=${encodeURIComponent(category.prefix)}`);
    if (!response.ok) throw new Error("Unable to load gallery");

    const data = await response.json();
    state.images = data.images || [];
    renderGallery();
  } catch (error) {
    $("galleryContent").innerHTML = '<div class="error">No se pudo cargar esta galería.</div>';
  }
}

function renderGallery() {
  const content = $("galleryContent");
  content.innerHTML = "";

  if (!state.images.length) {
    content.innerHTML = '<div class="empty">No hay imágenes en esta categoría.</div>';
    return;
  }

  const grid = document.createElement("div");
  grid.className = "gallery-grid";

  state.images.forEach((image, index) => {
    const card = document.createElement("button");
    card.className = "gallery-card";

    const img = document.createElement("img");
    img.src = image.url;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";

    card.appendChild(img);
    card.addEventListener("click", () => openLightbox(index));
    grid.appendChild(card);
  });

  content.appendChild(grid);
}

$("categoriesBack").addEventListener("click", () => showScreen("selector"));
$("galleryBack").addEventListener("click", () => openSection(state.section));

document.querySelectorAll(".home-button").forEach((button) => {
  button.addEventListener("click", () => showScreen("cover"));
});

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
$("lightbox").addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0].screenX;
}, { passive: true });

$("lightbox").addEventListener("touchend", (event) => {
  const delta = event.changedTouches[0].screenX - touchStartX;
  if (Math.abs(delta) < 55) return;
  changeLightbox(delta < 0 ? 1 : -1);
}, { passive: true });

const allPrefixes = Object.values(CONFIG.sections)
  .flat()
  .map((category) => category.prefix);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
} else {
  $("offlineButton").style.display = "none";
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
}

async function estimateOfflineSize() {
  let bytes = 0;
  let count = 0;

  for (const prefix of allPrefixes) {
    try {
      const response = await fetch(`/api/list?prefix=${encodeURIComponent(prefix)}`);
      const data = await response.json();
      (data.images || []).forEach((image) => {
        bytes += image.size || 0;
        count += 1;
      });
    } catch (error) {}
  }

  return { bytes, count };
}

$("offlineButton").addEventListener("click", async () => {
  const button = $("offlineButton");
  button.disabled = true;
  $("offlineStatus").classList.add("visible");
  $("offlineText").textContent = "Calculando contenido...";
  $("progressBar").style.width = "0%";

  try {
    if (navigator.storage?.persist) await navigator.storage.persist();

    const plan = await estimateOfflineSize();
    const proceed = window.confirm(
      `Se guardarán ${plan.count} imágenes (${formatBytes(plan.bytes)}) en esta tablet. ¿Continuar?`,
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
});

navigator.serviceWorker?.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "OFFLINE_PROGRESS") {
    const percent = data.total ? Math.round((data.done / data.total) * 100) : 0;
    $("progressBar").style.width = `${percent}%`;
    $("offlineText").textContent = `Preparando contenido offline: ${data.done} / ${data.total}`;
  }

  if (data.type === "OFFLINE_DONE") {
    $("progressBar").style.width = "100%";
    $("offlineText").textContent = data.failed
      ? `Offline preparado. ${data.failed} imágenes no pudieron guardarse.`
      : "Contenido offline listo.";

    $("offlineButton").textContent = "Offline listo";
    $("offlineButton").disabled = false;

    setTimeout(() => $("offlineStatus").classList.remove("visible"), 3500);
  }
});
