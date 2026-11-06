/*
 * Switches between the site's own pages in place instead of loading a new document.
 *
 * Browsers only allow sound on a page after the visitor has clicked or typed on it,
 * and every new document starts over. Swapping the page content keeps the document,
 * so the click on a link also counts for the page it opens. Links are fetched when
 * the pointer rests on them, so the switch is quick too.
 *
 * Only pages with a designed background or a detail page (body.has-bg) are swapped;
 * anything else, and any failure, falls back to a normal page load.
 */
(function () {
  "use strict";
  if (!window.fetch || !window.DOMParser || !window.history || !history.pushState) return;

  var cache = {};
  var shown = location.pathname + location.search;

  function target(a, e) {
    if (!a || !a.href) return null;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
    if (e && (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return null;
    var u;
    try {
      u = new URL(a.href, location.href);
    } catch (err) {
      return null;
    }
    if (u.origin !== location.origin) return null;
    if (u.pathname === location.pathname && u.search === location.search) return null; // same page, maybe an anchor
    if (/\.[a-z0-9]{2,5}$/i.test(u.pathname) && !/\.html?$/i.test(u.pathname)) return null; // files
    return u;
  }

  function get(url) {
    var key = url.split("#")[0];
    if (!cache[key]) {
      cache[key] = fetch(key, { credentials: "same-origin" }).then(function (r) {
        if (!r.ok || !/text\/html/.test(r.headers.get("content-type") || "")) throw new Error("not a page");
        return r.text();
      });
      cache[key].catch(function () {
        delete cache[key];
      });
    }
    return cache[key];
  }

  function replace(sel, doc) {
    var a = document.querySelector(sel),
      b = doc.querySelector(sel);
    if (a && b) a.parentNode.replaceChild(document.importNode(b, true), a);
    else if (a) a.parentNode.removeChild(a);
    else if (b) document.body.appendChild(document.importNode(b, true));
  }

  // returns false when the page has to be loaded normally
  function swap(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var nb = doc.body;
    if (!nb || !nb.classList.contains("has-bg") || !document.body.classList.contains("has-bg")) return false;
    var main = doc.querySelector('[role="main"]');
    if (!main || main.querySelector("script")) return false;

    if (window.__bgTeardown) window.__bgTeardown();
    if (window.__pageTeardown) window.__pageTeardown();
    var oldCanvas = document.getElementById("bg-canvas");
    if (oldCanvas) oldCanvas.parentNode.removeChild(oldCanvas);
    var newCanvas = doc.getElementById("bg-canvas");
    if (newCanvas) document.body.insertBefore(document.importNode(newCanvas, true), document.body.firstChild);

    replace("body > header", doc);
    replace('[role="main"]', doc);
    replace("body > footer", doc);
    document.title = doc.title;
    document.body.className = nb.className;
    window.scrollTo(0, 0);

    // start the new page's own scripts (its background, the About chat, ...)
    [].slice.call(document.querySelectorAll("script[data-page-script]")).forEach(function (s) {
      s.parentNode.removeChild(s);
    });
    [].slice.call(doc.querySelectorAll("script[data-page-script]")).forEach(function (src) {
      var s = document.createElement("script");
      s.setAttribute("data-page-script", "");
      s.src = src.getAttribute("src");
      document.body.appendChild(s);
    });
    if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise();
    shown = location.pathname + location.search;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    return true;
  }

  function go(u, push, y) {
    var url = u.href;
    get(url)
      .then(function (html) {
        if (push) {
          history.replaceState({ soft: 1, y: window.scrollY }, "");
          history.pushState({ soft: 1, y: 0 }, "", url);
        }
        if (!swap(html)) {
          location.reload();
          return;
        }
        if (y) window.scrollTo(0, y);
        else if (u.hash) {
          var el = document.getElementById(decodeURIComponent(u.hash.slice(1)));
          if (el) el.scrollIntoView();
        }
      })
      .catch(function () {
        if (push) location.href = url;
        else location.reload();
      });
  }

  // for page scripts that animate first and then open a link (the floppy drive)
  window.__softGo = function (href) {
    var a = document.createElement("a");
    a.href = href;
    var u = target(a);
    if (u && document.body.classList.contains("has-bg")) go(u, true);
    else location.href = href;
  };

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    var u = target(a, e);
    if (!u || !document.body.classList.contains("has-bg")) return;
    e.preventDefault();
    go(u, true);
  });

  // fetch a page as soon as the pointer rests on its link
  var hoverTimer;
  document.addEventListener("mouseover", function (e) {
    var a = e.target.closest && e.target.closest("a");
    var u = target(a);
    if (!u) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () {
      get(u.href).catch(function () {});
    }, 60);
  });

  window.addEventListener("popstate", function (e) {
    // only page entries made here; an anchor jump on the same page is left to the browser
    if (location.pathname + location.search === shown) return;
    go(new URL(location.href), false, e.state && e.state.y);
  });
})();
