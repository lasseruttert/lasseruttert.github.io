---
layout: page
permalink: /experience/
title: Experience
description: Research positions and degrees.
nav: true
nav_order: 1
background: keys
---

{% include timeline.liquid items=site.data.experience group="work" %}

<header class="post-header slot slot-lead">
  <h1 class="post-title">Education</h1>
  <p class="post-description">Degrees and theses.</p>
</header>

{% include timeline.liquid items=site.data.education group="edu" %}
