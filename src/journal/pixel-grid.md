---
slug: "pixel-grid"
date: "2026-09-30"
title: "I started treating the pixels as part of the look"
summary: "I made the render resolution an actual setting so the pixel look wasn't at the mercy of the browser window."
tags: ["Graphics", "Experiment"]
milestone: true
image: "/media/pixel-grid-on.webp"
imageAlt: "Low-resolution room rendering captured during the October 1 graphics review"
source: "e2e9c61"
sourceType: "commit"
order: 3
---

I pulled the render resolution into its own setting. That let me make the 3D world crunchy on purpose while keeping the interface readable, which seemed like a decent first step toward the PlayStation look I wanted.

Turning the resolution down doesn't magically make a game look like an old PlayStation game. It just makes the pixels bigger. I kept poking at snapping, dithering, fog, and the character models after this, because apparently I enjoy finding four new ways for one setting to look weird.
