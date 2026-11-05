---
layout: page
permalink: /projects/
title: Projects
description: Research code, benchmarks and experiments.
nav: true
nav_order: 4
background: tiles
---

{% assign projects = site.projects | sort: "importance" %}

<div class="slot-row">
  {% for project in projects %}
    {% if project.redirect %}
      <a href="{{ project.redirect }}">
        <h3>{{ project.title }}</h3>
        {% if project.dates %}<div class="tl-meta">{{ project.dates }}</div>{% endif %}
        <p>{{ project.description }}</p>
      </a>
    {% else %}
      <div>
        <h3>{{ project.title }}</h3>
        {% if project.dates %}<div class="tl-meta">{{ project.dates }}</div>{% endif %}
        <p>{{ project.description }}</p>
      </div>
    {% endif %}
  {% endfor %}
</div>
