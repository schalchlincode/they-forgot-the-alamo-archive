---
slug: "room-breaks-apart"
date: "2026-09-30"
title: "The room starts breaking when you shoot it"
summary: "Targets and crates started coming apart, wall tiles left holes, and the flying bits could be shot too."
tags: ["Destruction", "Gameplay", "Environment"]
milestone: true
source: "14c382556c0288670c9f73d460bb3492e8d5dcc0: README.md and main.js"
sourceType: "commit"
order: 4
---

Targets and crates break apart, wall tiles can disappear, and the flying chunks can be shot too. The room now reacts to gunfire instead of stopping at bullet holes.

The destruction uses simplified physics: debris does not collide with other debris or obstruct movement, and wall openings do not let the player leave the room. The floor and trim remain in place.

The old README shows this was in by September 30; it doesn't prove that's the day the feature was first added. There isn't a clean, verified destruction shot for this entry yet, so the gallery leaves it out for now.
