---
slug: "blender-shotgun"
date: "2026-10-02"
title: "A shotgun with a real hinge"
summary: "An original Blender model replaced the blockier game prop, with separate hinged barrels for the visible reload."
tags: ["Weapons", "Animation", "Models"]
milestone: true
image: "/media/shotgun-open.webp"
imageAlt: "October 2 game browser capture showing the shotgun open for reload"
source: "CHANGELOG.md: 2026-10-02 Blender shotgun; art/build_shotgun.py; assets/models/shotgun.glb; commits 594cb7c and 95f4a3d"
sourceType: "record"
order: 11
---

The shotgun was rebuilt as an original low-poly side-by-side model in Blender. Its barrel assembly is separate from the receiver, so the break-open reload can visibly expose the chambers. The existing two-shell firing and reload sequence drives that moving piece in the game.

The model loads as a GLB. The procedural weapon remains as a fallback if loading fails. An October 2 Edge interaction test recorded model loading, firing, the open breech, and a completed reload. The image is a review capture from that day, not a render of an earlier version.
