(function () {
  "use strict";

  var REPO = "wimpysworld/sidra";
  var RELEASE_API = "https://api.github.com/repos/" + REPO + "/releases/latest";
  var CACHE_KEY = "sidra-release";
  var CACHE_MS = 60 * 60 * 1000;
  var OS_NAMES = { linux: "Linux", mac: "macOS", win: "Windows" };

  function detectOS() {
    var nav = window.navigator;
    var hint = (nav.userAgentData && nav.userAgentData.platform) || nav.platform || "";
    var text = (hint + " " + nav.userAgent).toLowerCase();
    if (/android|iphone|ipad|ipod/.test(text)) return null;
    if (/win/.test(text)) return "win";
    if (/mac/.test(text)) return "mac";
    return "linux";
  }

  var os = detectOS();

  /* Colour theme toggle. The initial value is set by the inline script in <head>. */
  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("sidra-theme", next);
      } catch (e) {
        /* Storage can be blocked; the choice then lasts for this page only. */
      }
    });
  }

  /* Point the hero button at the visitor's platform. */
  document.querySelectorAll("[data-download]").forEach(function (link) {
    if (!os) return;
    link.textContent = "Download for " + OS_NAMES[os];
    link.setAttribute("href", "download.html#" + os);
  });

  /* Tabs */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  if (tabs.length) {
    var select = function (id, focus) {
      tabs.forEach(function (tab) {
        var on = tab.dataset.tab === id;
        tab.setAttribute("aria-selected", String(on));
        tab.tabIndex = on ? 0 : -1;
        if (on && focus) tab.focus();
        document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
      });
    };
    var known = tabs.map(function (tab) {
      return tab.dataset.tab;
    });
    var fromHash = window.location.hash.replace("#", "");
    select(known.indexOf(fromHash) >= 0 ? fromHash : os && known.indexOf(os) >= 0 ? os : known[0]);

    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () {
        select(tab.dataset.tab);
        history.replaceState(null, "", "#" + tab.dataset.tab);
      });
      tab.addEventListener("keydown", function (event) {
        var step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        select(tabs[(index + step + tabs.length) % tabs.length].dataset.tab, true);
      });
    });
    window.addEventListener("hashchange", function () {
      var id = window.location.hash.replace("#", "");
      if (known.indexOf(id) >= 0) select(id);
    });
  }

  /* Copy buttons on code blocks */
  document.querySelectorAll(".code").forEach(function (block) {
    var pre = block.querySelector("pre");
    if (!pre || !navigator.clipboard) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "copy";
    button.textContent = "Copy";
    button.addEventListener("click", function () {
      navigator.clipboard.writeText(pre.textContent.trim()).then(function () {
        button.textContent = "Copied";
        setTimeout(function () {
          button.textContent = "Copy";
        }, 1600);
      });
    });
    block.appendChild(button);
  });

  /* Latest release. Static links stay in place when the request fails. */
  var wantsRelease = document.querySelector("[data-release]");
  if (!wantsRelease) return;

  function classify(name) {
    var arch = /arm64|aarch64/i.test(name) ? "arm64" : "x86_64";
    if (/\.AppImage$/i.test(name)) return { os: "linux", kind: "AppImage", arch: arch };
    if (/\.deb$/i.test(name)) return { os: "linux", kind: "deb", arch: arch };
    if (/\.rpm$/i.test(name)) return { os: "linux", kind: "rpm", arch: arch };
    if (/\.dmg$/i.test(name)) return { os: "mac", kind: "DMG", arch: arch };
    if (/\.exe$/i.test(name)) return { os: "win", kind: "Installer", arch: "x86_64" };
    return null;
  }

  function size(bytes) {
    return Math.round(bytes / (1024 * 1024)) + " MB";
  }

  function render(release) {
    var version = String(release.tag_name || "").replace(/^v/, "");
    var date = release.published_at
      ? new Date(release.published_at).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })
      : "";

    document.querySelectorAll("[data-release-version]").forEach(function (el) {
      el.textContent = "v" + version;
    });
    document.querySelectorAll("[data-release-date]").forEach(function (el) {
      el.textContent = date;
    });
    document.querySelectorAll("[data-release-line]").forEach(function (el) {
      el.textContent = "Latest release: v" + version + (date ? ", " + date : "");
    });
    document.querySelectorAll("[data-release-notes]").forEach(function (el) {
      if (/^https:\/\/github\.com\//.test(release.html_url || "")) el.href = release.html_url;
    });

    var groups = { linux: [], mac: [], win: [] };
    (release.assets || []).forEach(function (asset) {
      var info = classify(asset.name);
      var url = asset.browser_download_url || "";
      if (!info || url.indexOf("https://github.com/") !== 0) return;
      groups[info.os].push({ name: asset.name, url: url, info: info, bytes: asset.size });
    });

    document.querySelectorAll("[data-assets]").forEach(function (list) {
      var items = groups[list.dataset.assets] || [];
      if (!items.length) return;
      list.textContent = "";
      items.sort(function (a, b) {
        return a.info.kind.localeCompare(b.info.kind) || b.info.arch.localeCompare(a.info.arch);
      });
      items.forEach(function (item) {
        var row = document.createElement("li");
        var link = document.createElement("a");
        link.href = item.url;
        link.textContent = item.name;
        var meta = document.createElement("span");
        meta.textContent = item.info.kind + " · " + item.info.arch + " · " + size(item.bytes);
        row.appendChild(link);
        row.appendChild(meta);
        list.appendChild(row);
      });
    });
  }

  function load() {
    try {
      var cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.release);
    } catch (e) {
      /* Ignore an unreadable cache entry. */
    }
    return fetch(RELEASE_API, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("release lookup failed");
        return response.json();
      })
      .then(function (release) {
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release: release }));
        } catch (e) {
          /* Caching is an optimisation only. */
        }
        return release;
      });
  }

  load().then(render).catch(function () {});
})();
