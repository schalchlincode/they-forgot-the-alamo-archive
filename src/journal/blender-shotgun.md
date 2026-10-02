---
slug: "blender-shotgun"
date: "2026-10-02"
title: "A Blender shotgun with a working hinge"
summary: "This build adds a low-poly side-by-side shotgun whose barrels swing open during the reload."
tags: ["Weapons", "Animation", "Models"]
milestone: true
image: "/media/shotgun-open.webp"
imageAlt: "October 2 game browser capture showing the shotgun open for reload"
source: "CHANGELOG.md: 2026-10-02 Blender shotgun; art/build_shotgun.py; assets/models/shotgun.glb; commits 594cb7c and 95f4a3d"
sourceType: "record"
order: 11
---

This version adds an original low-poly side-by-side shotgun modeled in Blender. Its barrels are separate from the receiver, so the game can swing them open and show the chambers during the reload. The existing two-shell setup now has a visible reload to go with it.

The game loads the model as a GLB and keeps the procedural gun as a fallback if the file fails to load. A live Edge check confirmed that the model loaded, fired, opened at the breech, and completed a reload. This image is from the October 2 check, not a reconstruction of an older build.
