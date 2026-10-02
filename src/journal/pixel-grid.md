---
slug: "pixel-grid"
date: "2026-09-30"
title: "Render resolution becomes a setting"
summary: "The world render resolution can be adjusted separately from the interface, which stays readable."
tags: ["Graphics", "Experiment"]
milestone: true
image: "/media/pixel-grid-on.webp"
imageAlt: "Low-resolution room rendering captured during the October 1 graphics review"
source: "e2e9c61"
sourceType: "commit"
order: 3
---

The 3D render resolution is now a separate setting from the interface. Lowering it makes the world render in larger pixels while the interface remains readable.

Lower resolution alone does not recreate an old PlayStation look; it makes the pixels larger. Later experiments also compare snapping, dithering, fog, and character models.
