---
slug: "two-shells-and-a-hinge"
date: "2026-09-30"
title: "Two shells, one blast, several moving parts"
summary: "The reload became a visible sequence: open, fetch shells, insert separately, close."
tags: ["Weapons", "Animation", "Gameplay"]
milestone: false
source: "bf4a988: main.js; 14c382556c0288670c9f73d460bb3492e8d5dcc0: README.md"
sourceType: "commit"
order: 5
---

The earliest surviving source already has a timed reload and two-shell ammunition display. By the September 30 README, the shotgun is explicitly described as spending both shells in one blast, then opening the breech and inserting replacements one at a time.

That small ritual gives a primitive weapon a lot of personality. It also gives the animation system several opportunities to be visibly wrong: the hand, shell, hinge, barrels, and ammunition count all have to agree about what happens next.

The later rigged-character work revisits weapon alignment. This entry records the earlier procedural reload; the existence of the sequence in a historical source does not mean every later model played it correctly.
