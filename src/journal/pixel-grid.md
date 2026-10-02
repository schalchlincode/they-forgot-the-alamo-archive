---
slug: "pixel-grid"
date: "2026-09-30"
title: "The room goes through a pixel grid"
summary: "Render resolution became a deliberate setting instead of a side effect of the browser window."
tags: ["Graphics", "Experiment"]
milestone: true
image: "/media/pixel-grid-on.webp"
imageAlt: "Low-resolution room rendering captured during the October 1 graphics review"
source: "e2e9c61"
sourceType: "commit"
order: 3
---

A central settings file made the internal render grid explicit. That matters for the game’s PlayStation-era look: the world can become crunchy while the interface remains legible.

A low-resolution image can suggest an older machine, but it does not create a complete visual identity on its own. Vertex snapping, dithering, fog, and character silhouettes would keep changing after this point.
