(() => {
  const galleryContent = document.getElementById("galleryContent");
  if (!galleryContent) return;

  const processed = new WeakSet();
  let currentPackery = null;
  let resizeTimer = null;

  function ensureStyles() {
    if (document.getElementById("packery-gallery-styles")) return;

    const style = document.createElement("style");
    style.id = "packery-gallery-styles";
    style.textContent = `
      #gallery .packery-gallery {
        position: relative;
        width: 100%;
        min-height: 360px;
      }

      #gallery .packery-video-stamp {
        position: absolute;
        top: 0;
        left: 27%;
        width: 46%;
        z-index: 3;
      }

      #gallery .packery-video-stamp .gallery-video-card {
        position: relative;
        width: 100%;
        margin: 0 0 8px;
        overflow: hidden;
        border-radius: 8px;
        background: #000;
        box-shadow: 0 8px 24px rgba(0, 0, 0, .14);
      }

      #gallery .packery-video-stamp video {
        display: block;
        width: 100%;
        height: auto;
        max-height: 68vh;
        object-fit: contain;
        background: #000;
      }

      #gallery .packery-item.gallery-card {
        margin: 0 !important;
        border-radius: 4px;
        overflow: hidden;
        background: #fff;
      }

      #gallery .packery-item.gallery-card img {
        display: block;
        width: 100%;
        height: auto;
        object-fit: contain;
      }

      @media (max-width: 1200px) {
        #gallery .packery-video-stamp {
          left: 25%;
          width: 50%;
        }
      }

      @media (max-width: 760px) {
        #gallery .packery-video-stamp {
          position: relative;
          left: auto;
          top: auto;
          width: 100%;
          margin-bottom: 8px;
        }

        #gallery .packery-gallery {
          display: block;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function waitForImage(img) {
    if (img.complete && img.naturalWidth) return Promise.resolve();

    return new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }

  function waitForVideo(video) {
    if (video.readyState >= 1 && video.videoWidth) return Promise.resolve();

    return new Promise((resolve) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", resolve, { once: true });
      setTimeout(resolve, 2500);
    });
  }

  function sizePhotoCard(card, containerWidth, index) {
    const img = card.querySelector("img");
    const ratio = img?.naturalWidth && img?.naturalHeight
      ? img.naturalWidth / img.naturalHeight
      : 1.33;

    let fraction;

    if (ratio >= 1.65) fraction = 0.26;
    else if (ratio >= 1.15) fraction = 0.205;
    else if (ratio <= 0.72) fraction = 0.127;
    else if (ratio <= 0.9) fraction = 0.145;
    else fraction = 0.175;

    // A tiny deterministic variation avoids repeated rigid columns while
    // keeping every item small enough to fit beside the centered video.
    const variation = [1, 0.96, 1.035, 0.985][index % 4];
    const width = Math.max(118, Math.floor(containerWidth * fraction * variation));

    card.style.width = `${width}px`;
  }

  function updateContainerFloor(container, stamp) {
    const stampBottom = stamp.offsetTop + stamp.offsetHeight;
    const currentHeight = parseFloat(container.style.height) || 0;
    container.style.minHeight = `${Math.max(stampBottom + 8, currentHeight)}px`;
  }

  async function enhanceVideoGallery(layout) {
    if (processed.has(layout) || !window.Packery) return;
    processed.add(layout);

    const imageCards = [...layout.querySelectorAll(".gallery-card")];
    const videoCards = [...layout.querySelectorAll(".gallery-video-card")];

    if (!videoCards.length) return;

    const container = document.createElement("div");
    container.className = "packery-gallery";

    const stamp = document.createElement("div");
    stamp.className = "packery-video-stamp";

    videoCards.forEach((card) => stamp.appendChild(card));
    container.appendChild(stamp);

    imageCards.forEach((card) => {
      card.classList.add("packery-item");
      container.appendChild(card);
    });

    layout.replaceWith(container);

    await Promise.all([
      ...imageCards.map((card) => waitForImage(card.querySelector("img"))),
      ...videoCards.map((card) => waitForVideo(card.querySelector("video"))),
    ]);

    const containerWidth = container.clientWidth || galleryContent.clientWidth || window.innerWidth;
    imageCards.forEach((card, index) => sizePhotoCard(card, containerWidth, index));

    if (window.innerWidth <= 760) {
      imageCards.forEach((card) => {
        const img = card.querySelector("img");
        const ratio = img?.naturalWidth && img?.naturalHeight
          ? img.naturalWidth / img.naturalHeight
          : 1.33;
        card.style.width = ratio < 0.85 ? "48%" : "calc(50% - 4px)";
      });
      return;
    }

    currentPackery?.destroy?.();

    const packery = new window.Packery(container, {
      itemSelector: ".packery-item",
      gutter: 8,
      percentPosition: false,
      transitionDuration: "0.18s",
      stamp: ".packery-video-stamp",
    });

    currentPackery = packery;

    packery.on("layoutComplete", () => updateContainerFloor(container, stamp));
    packery.layout();
    updateContainerFloor(container, stamp);

    // Video controls and metadata can alter the video's measured height shortly
    // after first paint, so give Packery two extra settling passes.
    setTimeout(() => {
      if (currentPackery === packery) {
        packery.layout();
        updateContainerFloor(container, stamp);
      }
    }, 250);

    setTimeout(() => {
      if (currentPackery === packery) {
        packery.layout();
        updateContainerFloor(container, stamp);
      }
    }, 900);
  }

  function scan() {
    galleryContent
      .querySelectorAll(".video-surround-layout, .mixed-gallery-layout")
      .forEach((layout) => enhanceVideoGallery(layout));
  }

  const observer = new MutationObserver(scan);
  observer.observe(galleryContent, { childList: true, subtree: true });

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (currentPackery) currentPackery.layout();
    }, 150);
  });

  ensureStyles();
  scan();
})();
