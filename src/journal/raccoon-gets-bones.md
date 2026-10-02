---
slug: "raccoon-gets-bones"
date: "2026-10-01"
title: "The raccoon gets an animated model"
summary: "The procedural raccoon is joined by a low-poly model with twelve animation clips; the old version remains as a fallback."
tags: ["Raccoon", "Animation", "Characters"]
milestone: true
image: "/media/raccoon-room.webp"
imageAlt: "Room captured during the raccoon view regression review"
source: "b0c14c0 and 8cc2fdc"
sourceType: "commit"
order: 9
---

Pressing Q switches from Davy to the raccoon's view. The earlier raccoon used simple shapes and timed movement; this version adds a low-poly animated model with twelve clips. Twelve clips for a raccoon is a fairly serious little résumé.

The old version remains available as a fallback. The new model loads from a GLB and connects to the existing view toggle.
