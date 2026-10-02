---
slug: "two-shells-and-a-hinge"
date: "2026-09-30"
title: "Two shells, one blast, and a very fussy reload"
summary: "The reload becomes visible: crack the shotgun open, put the shells in one at a time, and shut it again."
tags: ["Weapons", "Animation", "Gameplay"]
milestone: false
source: "bf4a988: main.js; 14c382556c0288670c9f73d460bb3492e8d5dcc0: README.md"
sourceType: "commit"
order: 5
---

The oldest code shows a reload timer and two shells. In the next saved version, the shotgun fires both at once, then opens so replacement shells can be loaded one at a time.

The reload makes the two-shell capacity visible. The hands, shells, hinge, barrels, and ammo count all need to stay in sync, and earlier builds did not always line up.

The gun placement changed again when Davy received a rig and a new model. This entry describes the early reload; later versions still needed more alignment work.
