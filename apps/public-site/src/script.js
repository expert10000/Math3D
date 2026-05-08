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
