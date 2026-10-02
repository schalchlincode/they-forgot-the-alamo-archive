---
slug: "room-breaks-apart"
date: "2026-09-30"
title: "The room stops being scenery"
summary: "By September 30, targets and crates shattered, wall tiles left holes, and fragments could be shot again."
tags: ["Destruction", "Gameplay", "Environment"]
milestone: true
source: "14c382556c0288670c9f73d460bb3492e8d5dcc0: README.md and main.js"
sourceType: "commit"
order: 4
---

A shooting room needs something to complain when it gets hit. The September 30 README describes breakable targets and crates, removable wall tiles, and fragments that bounce and can be broken again. The environment had become part of the action.

There is a useful cheat underneath it: this is lightweight game physics, not a structural simulation. Fragments do not collide with one another, loose debris does not block walking, and the player still meets a solid room boundary even where a wall tile has gone missing. The floor and trim stay fixed. Those compromises keep the experiment focused on movement and satisfying damage.

This date means the system is documented by this snapshot. It is not a claim that every part was first implemented that day. No separately verified destruction screenshot is attached to this entry.
