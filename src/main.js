import Lenis from "lenis";
import "lenis/dist/lenis.css";

const staticClosing = window.matchMedia("(max-width: 760px)");
const closing = document.querySelector(".closing");
const archive = document.querySelector(".archive");
const archivePoster = archive.querySelector("figure");
const footer = document.querySelector(".footer");
const closingStage = document.querySelector(".closing-sticky");
const heroImage = document.querySelector(".hero-image");
const navigation = document.querySelector(".nav");
const links = [...document.querySelectorAll(".nav-link")];
const sections = links.map((link) => document.querySelector(link.hash));
const lenis = new Lenis({
  duration: 0.85,
  smoothWheel: true,
  anchors: true,
  respectReducedMotion: false,
});
let geometry;
let geometryDirty = true;
let previousY = -1;
let previousProgress = -1;
let activeSection = -1;
let navigationOnClosing = false;

function invalidateGeometry() {
  geometryDirty = true;
}

function refreshLayout() {
  lenis.resize();
  invalidateGeometry();
}

function clampProgress(value) {
  return Math.max(0, Math.min(1, value));
}

function measureGeometry() {
  const stageHeight = closingStage.offsetHeight;
  const posterBottom =
    archivePoster.getBoundingClientRect().bottom -
    archive.getBoundingClientRect().top;
  geometry = {
    viewportHeight: window.innerHeight,
    closingTop: closing.offsetTop,
    navigationMidpoint: window.innerWidth <= 760 ? 37 : 44,
    travel: Math.max(1, closing.offsetHeight - stageHeight),
    clearingDistance: Math.max(0, posterBottom - stageHeight * 0.4),
    sections: sections.map((section) => ({
      top: section.offsetTop,
      bottom: section.offsetTop + section.offsetHeight,
    })),
  };
  geometryDirty = false;
  previousY = -1;
  previousProgress = -1;
}

function syncClosingLayout() {
  if (staticClosing.matches) {
    archive.style.transform = "";
    archive.style.filter = "";
    closing.style.setProperty("--backdrop-progress", 0);
    footer.style.setProperty("--footer-progress", 1);
  }
  refreshLayout();
}
staticClosing.addEventListener("change", syncClosingLayout);
syncClosingLayout();

const brand = document.querySelector(".brand");
brand.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  brand.focus({ preventScroll: true });
});
brand.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  lenis.scrollTo(0, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 3) });
  history.replaceState(null, "", "#top");
});

footer.addEventListener("focusin", () => {
  const top = staticClosing.matches
    ? window.scrollY + footer.getBoundingClientRect().top
    : closing.offsetTop + closing.offsetHeight - closingStage.offsetHeight;
  lenis.scrollTo(top, { immediate: true });
});

function updateNavigation(y) {
  const onClosing = y + geometry.navigationMidpoint >= geometry.closingTop;
  if (onClosing !== navigationOnClosing) {
    navigation.classList.toggle("on-closing", onClosing);
    navigationOnClosing = onClosing;
  }

  const nextSection = geometry.sections.findIndex(
    (section) => section.top <= y + 120 && section.bottom > y + 120,
  );
  if (nextSection === activeSection) return;

  links.forEach((link, index) => {
    if (index === nextSection) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  activeSection = nextSection;
}

function updateHero(y) {
  if (y >= geometry.viewportHeight * 1.3) return;
  const offset = Math.min(y, geometry.viewportHeight) * 0.08;
  heroImage.style.transform = `translate3d(0, ${offset}px, 0)`;
}

function updateClosing(y) {
  if (staticClosing.matches) return;
  const progress = clampProgress((y - geometry.closingTop) / geometry.travel);
  if (progress === previousProgress) return;

  const clearing = Math.min(1, progress / 0.35);
  const phase = clampProgress((progress - 0.12) / 0.85);
  const reveal = phase * phase * (3 - 2 * phase);
  archive.style.transform = `translate3d(0, ${-clearing * geometry.clearingDistance}px, 0)`;
  archive.style.filter = `blur(${reveal * 6}px)`;
  closing.style.setProperty("--backdrop-progress", reveal);
  footer.style.setProperty("--footer-progress", reveal);
  previousProgress = progress;
}

function tick(time) {
  if (geometryDirty) measureGeometry();
  lenis.raf(time);
  const y = window.scrollY;

  if (y !== previousY) {
    updateNavigation(y);
    updateHero(y);
    updateClosing(y);
    previousY = y;
  }
  requestAnimationFrame(tick);
}

const layoutObserver = new ResizeObserver(invalidateGeometry);
[document.body, closingStage, archivePoster, ...sections].forEach((element) =>
  layoutObserver.observe(element),
);
window.addEventListener("resize", invalidateGeometry);
window.addEventListener("load", refreshLayout);
document.fonts.ready.then(refreshLayout);
requestAnimationFrame(tick);

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.remove("reveal-pending");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 },
);
document.querySelectorAll("[data-reveal]").forEach((element) => {
  if (element.getBoundingClientRect().top >= innerHeight) {
    element.classList.add("reveal-pending");
    revealObserver.observe(element);
  }
});

const viewer = document.querySelector(".art-viewer");
const viewerArt = viewer.querySelector(".viewer-art");
const viewerTitle = viewer.querySelector("#viewer-title");
const artworks = [...document.querySelectorAll(".archive-open")];
let viewerOpener;

function renderArtwork(source) {
  const artwork = source.querySelector(".archive-art").cloneNode(true);
  artwork.loading = "eager";
  const original = new Image();
  original.src = source.href;
  original
    .decode()
    .then(() => {
      if (artwork.isConnected) artwork.src = original.src;
    })
    .catch(() => {});
  viewerArt.replaceChildren(artwork);
  viewerTitle.textContent = source.dataset.title;
}
artworks.forEach((link) =>
  link.addEventListener("click", (event) => {
    event.preventDefault();
    viewerOpener = link;
    renderArtwork(link);
    viewer.showModal();
    document.body.classList.add("viewer-open");
    lenis.stop();
  }),
);
viewer
  .querySelector(".viewer-close")
  .addEventListener("click", () => viewer.close());
viewer.addEventListener("close", () => {
  document.body.classList.remove("viewer-open");
  lenis.start();
  viewerOpener?.focus({ preventScroll: true });
});
