---
layout: page
permalink: /publications/
title: Publications
description: Papers and working notes.
nav: true
nav_order: 3
background: keys
---

{% assign pubs = site.publications | sort: "date" | reverse %}

<div class="slot-row" data-cols="1">
  {% for pub in pubs %}
    <a href="{{ pub.url | relative_url }}">
      <h3>{{ pub.title }}</h3>
      <div class="tl-meta">{{ pub.venue }} · {{ pub.date_label }}</div>
      <p>{{ pub.authors }}</p>
    </a>
  {% endfor %}
</div>
