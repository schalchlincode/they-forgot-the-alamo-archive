---
slug: "making-the-models-work"
date: "2026-10-01"
title: "The models finally agree to load"
summary: "Loader, skinning, gun attachment, and Q transition fixes followed the ambitious character swap."
tags: ["Gameplay", "Animation", "Bug"]
milestone: false
image: "/media/current-room.webp"
imageAlt: "Current gameplay room capture with Davy"
source: "b58f6dc and 47f4c80"
sourceType: "commit"
order: 10
---

A new asset is only useful when it survives the actual game. The later October 1 commits fix the official Three.js loader path, skinned Davy and raccoon, the gun in Davy’s hand, and the Q toggle. Another pass has Davy carry the shotgun raised using aim clips.

The working room is still a prototype. It has movement, firing, reload, destruction, and the raccoon transition; it does not yet have a campaign or enemies.
