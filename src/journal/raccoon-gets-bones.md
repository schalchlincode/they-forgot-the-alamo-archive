---
slug: "raccoon-gets-bones"
date: "2026-10-01"
title: "I gave the raccoon a skeleton"
summary: "The raccoon started as procedural shapes; I swapped in an animated model and kept the old version as a fallback."
tags: ["Raccoon", "Animation", "Characters"]
milestone: true
image: "/media/raccoon-room.webp"
imageAlt: "Room captured during the raccoon view regression review"
source: "b0c14c0 and 8cc2fdc"
sourceType: "commit"
order: 9
---

Pressing Q already let you leave Davy behind and wander around as a raccoon. The first one was made from simple shapes with a bit of timed movement. I replaced it with a low-poly model and twelve animation clips. Twelve! The raccoon has a better performance contract than I do.

I kept the old version around as a fallback and because it's fun to see how the idea started. The new model is loaded from a GLB and hooked into Davy's view swap. Weird little mechanics are allowed to get nicer costumes too.
