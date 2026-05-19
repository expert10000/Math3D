"use strict";

const yearNode = document.getElementById("year");
if (yearNode) {
  yearNode.textContent = String(new Date().getFullYear());
}

const revealNodes = Array.from(document.querySelectorAll(".reveal"));
if (revealNodes.length) {
  const observer = new IntersectionObserver(
    (entries, current) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        current.unobserve(entry.target);
      }
    },
    { threshold: 0.18 }
  );

  for (const node of revealNodes) {
    observer.observe(node);
  }
}

const heroModeContent = {
  implicit: {
    copy: "Implicit mode focuses on field-defined surfaces and mesh extraction for complex equation-driven geometry.",
    cards: [
      { title: "200+", text: "implicit presets and geometry objects" },
      { title: "CGAL/VTK", text: "iso-surface mesh and volume workflows" },
      { title: "Curvature", text: "field probes and derivative-driven analysis" },
      { title: "Desktop + Web", text: "same implicit tooling in both runtime modes" },
    ],
  },
  parametric: {
    copy: "Parametric mode is built for controlled UV domains, surface families, and animated equation parameters.",
    cards: [
      { title: "UV Domains", text: "parameter-space controls with live refresh" },
      { title: "Surface Families", text: "Klein bottle, helicoid, and custom maps" },
      { title: "Analysis", text: "inspect normal, tangent, and mesh characteristics" },
      { title: "Workbook", text: "capture and replay parametric workflows" },
    ],
  },
  topology: {
    copy: "Topology mode emphasizes educational realizations and stage-based views for non-trivial manifolds.",
    cards: [
      { title: "Topology Lab", text: "torus, Mobius strip, and Klein bottle studies" },
      { title: "Stage Views", text: "switch geometric realizations across steps" },
      { title: "Inspector", text: "compare properties and structures side-by-side" },
      { title: "Classroom Ready", text: "export scenes for demos and teaching notes" },
    ],
  },
};

const modeButtons = Array.from(document.querySelectorAll(".chip-btn[data-mode]"));
const modeCopy = document.querySelector("[data-mode-copy]");
const cardTitleNodes = Array.from(document.querySelectorAll("[data-mode-title]"));
const cardTextNodes = Array.from(document.querySelectorAll("[data-mode-text]"));

function applyHeroMode(mode) {
  const content = heroModeContent[mode];
  if (!content) return;

  if (modeCopy) modeCopy.textContent = content.copy;

  for (let idx = 0; idx < content.cards.length; idx += 1) {
    if (cardTitleNodes[idx]) cardTitleNodes[idx].textContent = content.cards[idx].title;
    if (cardTextNodes[idx]) cardTextNodes[idx].textContent = content.cards[idx].text;
  }

  for (const button of modeButtons) {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  }
}

if (modeButtons.length) {
  for (const button of modeButtons) {
    button.addEventListener("click", () => applyHeroMode(button.dataset.mode || ""));
  }
}

const fullResImages = Array.from(document.querySelectorAll(".hero-shot img, .shot-grid img"));
for (const imageNode of fullResImages) {
  if (!(imageNode instanceof HTMLImageElement)) continue;
  if (imageNode.parentElement && imageNode.parentElement.tagName === "A") continue;

  const linkNode = document.createElement("a");
  linkNode.className = "shot-link";
  linkNode.href = imageNode.currentSrc || imageNode.src;
  linkNode.target = "_blank";
  linkNode.rel = "noopener noreferrer";
  linkNode.setAttribute("aria-label", `Open full resolution image: ${imageNode.alt || "Math3D screenshot"}`);

  const parentNode = imageNode.parentNode;
  if (!parentNode) continue;
  parentNode.insertBefore(linkNode, imageNode);
  linkNode.appendChild(imageNode);
}
