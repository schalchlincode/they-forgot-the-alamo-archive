---
slug: "davy-learns-to-move"
date: "2026-10-01"
title: "Davy gets a rig, and the shotgun joins the debugging"
summary: "The new rig adds named animation clips and a weapon attachment point, followed by alignment work across the walk, aim, hands, and barrel."
tags: ["Animation", "Davy", "Weapons"]
milestone: true
image: "/media/davy-b4.webp"
imageAlt: "Contact sheet of Davy B4 animation poses"
source: "8314be2 through edb5fd8"
sourceType: "commit"
order: 8
---

The B4 rig includes named animation clips and an attachment point for the shotgun. Follow-up changes address the walk, upward aiming, left-hand placement, and keeping the barrel aligned with the shot.

The character rig, weapon, camera, and controls all affect the final pose. When their alignment drifts, Davy's grip can look rather less convincing than intended.
