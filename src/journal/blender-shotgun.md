---
slug: "blender-shotgun"
date: "2026-10-02"
title: "I built the shotgun around a real hinge"
summary: "I made a low-poly side-by-side shotgun in Blender, with barrels that actually swing open for the reload."
tags: ["Weapons", "Animation", "Models"]
milestone: true
image: "/media/shotgun-open.webp"
imageAlt: "October 2 game browser capture showing the shotgun open for reload"
source: "CHANGELOG.md: 2026-10-02 Blender shotgun; art/build_shotgun.py; assets/models/shotgun.glb; commits 594cb7c and 95f4a3d"
sourceType: "record"
order: 11
---

I rebuilt the shotgun as an original low-poly side-by-side model in Blender. The barrels are a separate piece from the receiver, which means the game can swing them open and show the chambers during the reload. The existing two-shell setup now has something physical to do while all that happens.

The game loads the model as a GLB, with the old procedural gun still there as a fallback in case the file doesn't load. I checked it in Edge: the model loaded, it fired, the breech opened, and the reload finished. The image is from that October 2 check, not a reconstruction of an older build.
