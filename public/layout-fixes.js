const galleryContent = document.getElementById("galleryContent");

function normalizeVideoGallery(layout) {
  if (!layout || layout.dataset.videoLayoutNormalized === "true") return;

  const center = layout.querySelector(":scope > .video-surround-center");
  const top = layout.querySelector(":scope > .video-surround-top");
  const bottom = layout.querySelector(":scope > .video-surround-bottom");

  if (!center) return;

  // The video row must always be the first visual block.
  layout.prepend(center);

  // Merge every photo that used to sit above the video into one collage below it.
  if (top || bottom) {
    const mergedBottom = document.createElement("div");
    mergedBottom.className = "video-surround-band video-surround-bottom";

    if (top) {
      while (top.firstChild) mergedBottom.appendChild(top.firstChild);
      top.remove();
    }

    if (bottom) {
      while (bottom.firstChild) mergedBottom.appendChild(bottom.firstChild);
      bottom.remove();
    }

    if (mergedBottom.childElementCount) {
      layout.appendChild(mergedBottom);
    }
  }

  layout.dataset.videoLayoutNormalized = "true";
}

function normalizeCurrentVideoGalleries() {
  document
    .querySelectorAll("#gallery .video-surround-layout")
    .forEach(normalizeVideoGallery);
}

if (galleryContent) {
  const observer = new MutationObserver(normalizeCurrentVideoGalleries);

  observer.observe(galleryContent, {
    childList: true,
    subtree: true,
  });

  normalizeCurrentVideoGalleries();
}
