---
slug: "making-the-models-work"
date: "2026-10-01"
title: "The new models enter the game"
summary: "Davy and the raccoon load as animated models, with fixes for the loader, view toggle, and shotgun attachment."
tags: ["Gameplay", "Animation", "Bug"]
milestone: false
image: "/media/current-room.webp"
imageAlt: "Current gameplay room capture with Davy"
source: "b58f6dc and 47f4c80"
sourceType: "commit"
order: 10
---

The models also need to load, animate, hold the shotgun, and work with the view toggle. These changes update the Three.js loader, add the skinned Davy and raccoon to the room, fix the Q toggle, and adjust the weapon attachment. One pass has Davy raise the shotgun with his aim animations.

The result is still a one-room prototype. Movement, shooting, reloading, destructible objects, and the raccoon view are present; there is no campaign or enemy combat yet.
