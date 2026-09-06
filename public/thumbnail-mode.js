(() => {
  // Easy rollback switch. Set to false to return gallery cards to original images.
  const USE_THUMBNAILS = true;
  const THUMB_WIDTH = 960;
  const MIGRATION_KEY = "expolagos-thumbnail-offline-migrated-v1";
  const OFFLINE_FINGERPRINT_KEY = "expolagos-offline-fingerprint-v2";

  if (!USE_THUMBNAILS) return;

  // Existing tablets may already have the old original-only offline package.
  // Invalidate it once so the UI offers one more "Actualizar offline" pass that
  // also stores thumbnails. After that, the normal fingerprint logic resumes.
  if (!localStorage.getItem(MIGRATION_KEY)) {
    localStorage.removeItem(OFFLINE_FINGERPRINT_KEY);
    localStorage.setItem(MIGRATION_KEY, "1");
  }

  const galleryContent = document.getElementById("galleryContent");
  if (!galleryContent) return;

  function thumbnailUrlFromOriginal(src) {
    try {
      const url = new URL(src, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname !== "/img") return null;

      const key = url.searchParams.get("key");
      if (!key) return null;

      return `/thumb?width=${THUMB_WIDTH}&key=${encodeURIComponent(key)}`;
    } catch (error) {
      return null;
    }
  }

  function optimizeImage(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (!img.closest("#gallery .gallery-card")) return;
    if (img.dataset.thumbnailMode === "true") return;

    const original = img.currentSrc || img.src;
    const thumb = thumbnailUrlFromOriginal(original);
    if (!thumb) return;

    img.dataset.originalSrc = original;
    img.dataset.thumbnailMode = "true";
    img.src = thumb;
  }

  function scan(root = galleryContent) {
    if (root instanceof HTMLImageElement) optimizeImage(root);
    root.querySelectorAll?.(".gallery-card img").forEach(optimizeImage);
  }

  // Registered before Packery so thumbnail dimensions/load completion are what
  // Packery waits for, rather than the multi-megabyte originals.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) scan(node);
      });
    }
  });

  observer.observe(galleryContent, { childList: true, subtree: true });
  scan();
})();
