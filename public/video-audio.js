(() => {
  const SOUND_CLASS = "video-sound-unlock";

  function ensureStyles() {
    if (document.getElementById("video-audio-styles")) return;

    const style = document.createElement("style");
    style.id = "video-audio-styles";
    style.textContent = `
      .gallery-video-card {
        position: relative;
      }

      .${SOUND_CLASS} {
        position: absolute;
        z-index: 8;
        left: 50%;
        bottom: 18px;
        transform: translateX(-50%);
        padding: 12px 18px;
        border: 1px solid rgba(255,255,255,.8);
        border-radius: 999px;
        background: rgba(1,22,77,.9);
        color: #fff;
        font: 700 14px/1 "Helvetica Neue", Helvetica, Arial, sans-serif;
        letter-spacing: .02em;
        box-shadow: 0 6px 20px rgba(0,0,0,.25);
        backdrop-filter: blur(8px);
        cursor: pointer;
        white-space: nowrap;
      }

      .${SOUND_CLASS}[hidden] {
        display: none !important;
      }
    `;

    document.head.appendChild(style);
  }

  function getUnlockButton(video) {
    const wrapper = video.closest(".gallery-video-card");
    if (!wrapper) return null;

    let button = wrapper.querySelector(`.${SOUND_CLASS}`);

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = SOUND_CLASS;
      button.textContent = "ACTIVAR SONIDO";
      button.hidden = true;

      button.addEventListener("click", async (event) => {
        event.stopPropagation();

        try {
          video.muted = false;
          video.defaultMuted = false;
          video.removeAttribute("muted");
          video.volume = 1;
          await video.play();
          button.hidden = true;
        } catch (error) {
          video.muted = true;
          video.defaultMuted = true;
          video.setAttribute("muted", "");
          await video.play().catch(() => {});
          button.hidden = false;
        }
      });

      wrapper.appendChild(button);
    }

    return button;
  }

  async function tryPlayWithSound(video) {
    if (video.dataset.soundConfigured === "true") return;
    video.dataset.soundConfigured = "true";

    const button = getUnlockButton(video);

    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.volume = 1;

    // Only attempt automatic playback when the video is first created.
    // After that, a manual pause is always respected.
    try {
      video.muted = false;
      video.defaultMuted = false;
      video.removeAttribute("muted");
      await video.play();
      if (button) button.hidden = true;
      return;
    } catch (error) {
      // Audible autoplay can be blocked by browser policy.
    }

    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");
    await video.play().catch(() => {});

    if (button) button.hidden = false;
  }

  function configureVideos(root = document) {
    root.querySelectorAll?.("#gallery video, .gallery-video-card video").forEach((video) => {
      tryPlayWithSound(video);
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        if (node.matches("video")) {
          tryPlayWithSound(node);
        }

        configureVideos(node);
      }
    }
  });

  ensureStyles();

  const start = () => {
    configureVideos();
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
