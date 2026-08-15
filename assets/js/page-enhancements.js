(function () {
  "use strict";

  var PhoenixUI = window.PhoenixUI = window.PhoenixUI || { initializers: {} };
  PhoenixUI.initializers = PhoenixUI.initializers || {};

  function normalizePath(path) {
    var value = String(path || "");
    value = value.replace(/[?#].*$/, "");
    value = value.replace(/\/+$/, "");
    return value || "/";
  }

  function parseCssPixels(value) {
    var parsed = parseFloat(String(value || "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function readLocalStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeLocalStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      // Ignore storage write failures.
    }
  }

  function removeLocalStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      // Ignore storage write failures.
    }
  }

  function prefersReducedMotion() {
    try {
      return Boolean(
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (err) {
      return false;
    }
  }

  function stripGeneratedTitleSuffix(value) {
    var text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return "";
    }
    var parts = text.split(" ");
    var trimCount = 0;
    var sawDigit = false;
    var sawLongToken = false;
    for (var i = parts.length - 1; i >= 0; i -= 1) {
      var token = String(parts[i] || "").replace(/[^A-Za-z0-9]/g, "");
      if (!token || !/^[0-9A-Fa-f]{1,6}$/.test(token)) {
        break;
      }
      trimCount += 1;
      sawDigit = sawDigit || /\d/.test(token);
      sawLongToken = sawLongToken || token.length >= 4;
    }
    if (trimCount >= 2 && (sawDigit || sawLongToken) && trimCount < parts.length) {
      return parts.slice(0, parts.length - trimCount).join(" ").trim();
    }
    return text;
  }

  function cleanGeneratedTopicLabels() {
    var nodes = document.querySelectorAll(
      ".article-branch-section a, .article-branch-link-short, .sidebar-link, .sidebar-toggle"
    );
    Array.prototype.forEach.call(nodes, function (node) {
      var original = String(node.textContent || "").replace(/\s+/g, " ").trim();
      var cleaned = stripGeneratedTitleSuffix(original);
      if (cleaned && cleaned !== original && node.childElementCount === 0) {
        node.textContent = cleaned;
      }
      ["title", "aria-label", "data-sidebar-search"].forEach(function (attr) {
        if (!node.hasAttribute || !node.hasAttribute(attr)) {
          return;
        }
        var attrValue = node.getAttribute(attr);
        var cleanedAttr = stripGeneratedTitleSuffix(attrValue);
        if (cleanedAttr && cleanedAttr !== attrValue) {
          node.setAttribute(attr, cleanedAttr);
        }
      });
    });
  }

  function isContentPageScrollResetEligible() {
    var body = document.body;
    if (!body || body.classList.contains("page-home")) {
      return false;
    }
    if (String(window.location.hash || "").trim()) {
      return false;
    }
    if (getSearchHighlightQueryFromUrl()) {
      return false;
    }
    return body.classList.contains("page-article") || Boolean(document.querySelector(".article-body"));
  }

  function initContentPageScrollReset() {
    if (!isContentPageScrollResetEligible()) {
      return;
    }
    // Fresh navigations naturally start at the top; forcing it here can
    // interrupt readers after slow-loading assets or bfcache restores.
  }

  function affiliateMerchantFromUrl(rawUrl) {
    var hostname = "";
    try {
      hostname = String(new URL(String(rawUrl || ""), window.location.href).hostname || "").toLowerCase();
    } catch (err) {
      return "";
    }
    if (hostname.indexOf("amazon.") !== -1 || hostname === "amzn.to") {
      return "amazon";
    }
    if (hostname.indexOf("ebay.") !== -1) {
      return "ebay";
    }
    if (hostname.indexOf("etsy.") !== -1) {
      return "etsy";
    }
    if (hostname.indexOf("temu.") !== -1) {
      return "temu";
    }
    return "";
  }

  function affiliatePlacementForLink(link) {
    if (!link || typeof link.closest !== "function") {
      return "unknown";
    }
    if (link.getAttribute("data-affiliate-placement")) {
      return String(link.getAttribute("data-affiliate-placement"));
    }
    if (link.closest("[data-ebay-listing-card]")) {
      return "listing_card";
    }
    if (link.closest(".fr-book-card")) {
      return "book_card";
    }
    if (link.closest(".merchant-card, .affiliate-card, [data-ebay-item-id]")) {
      return "marketplace_card";
    }
    if (link.closest(".further-reading-section")) {
      return "further_reading";
    }
    return "page_link";
  }

  function initAffiliateClickTracking() {
    document.addEventListener("click", function(event) {
      var target = event.target;
      var link = target && typeof target.closest === "function" ? target.closest("a[href]") : null;
      if (!link) {
        return;
      }
      var merchant = String(link.getAttribute("data-affiliate-merchant") || affiliateMerchantFromUrl(link.href));
      if (!merchant) {
        return;
      }
      var destination = null;
      try {
        destination = new URL(String(link.href || ""), window.location.href);
      } catch (err) {
        destination = null;
      }
      var section = link.closest("[data-ebay-experiment]");
      var detail = {
        affiliate_merchant: merchant,
        affiliate_placement: affiliatePlacementForLink(link),
        destination_host: destination ? String(destination.hostname || "") : "",
        destination_path: destination ? String(destination.pathname || "").slice(0, 160) : "",
        link_text: String(link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        ebay_card_kind: String(link.getAttribute("data-ebay-card-kind") || ""),
        ebay_card_position: String(link.getAttribute("data-ebay-card-position") || ""),
        experiment: section ? String(section.getAttribute("data-ebay-experiment") || "") : "",
        experiment_variant: section ? String(section.getAttribute("data-ebay-experiment-variant") || "") : ""
      };
      document.dispatchEvent(new CustomEvent("phoenix:affiliate-click", { detail: detail }));
      if (typeof window.gtag !== "function") {
        return;
      }
      window.gtag("event", "affiliate_click", Object.assign({}, detail, {
        transport_type: "beacon"
      }));
    });
  }

  function getArticleDrawerMediaQuery() {
    var body = document.body;
    return body && body.classList.contains("page-article")
      ? "(max-width: 1120px)"
      : "(max-width: 980px)";
  }

  function emitReaderEngagement(eventName, detail) {
    var payload = Object.assign({
      page_path: String(window.location.pathname || ""),
      device_class: window.matchMedia && window.matchMedia("(max-width: 720px)").matches
        ? "mobile"
        : "desktop"
    }, detail || {});
    document.dispatchEvent(new CustomEvent("phoenix:reader-engagement", {
      detail: Object.assign({ event_name: eventName }, payload)
    }));
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, Object.assign({}, payload, {
        transport_type: "beacon"
      }));
    }
  }

  function initReaderEngagementTracking() {
    var sent = Object.create(null);

    function emitOnce(key, eventName, detail) {
      if (sent[key]) {
        return;
      }
      sent[key] = true;
      emitReaderEngagement(eventName, detail);
    }

    function recordScrollDepth() {
      var doc = document.documentElement;
      var body = document.body;
      var documentHeight = Math.max(
        doc ? doc.scrollHeight : 0,
        body ? body.scrollHeight : 0
      );
      var viewportHeight = window.innerHeight || (doc ? doc.clientHeight : 0) || 0;
      var scrollable = Math.max(1, documentHeight - viewportHeight);
      var depth = Math.min(100, Math.round((Math.max(0, window.scrollY || 0) / scrollable) * 100));
      [25, 50, 75, 90].forEach(function(threshold) {
        if (depth >= threshold) {
          emitOnce("scroll_" + threshold, "phx_scroll_depth", {
            scroll_percent: threshold
          });
        }
      });
    }

    var scrollQueued = false;
    window.addEventListener("scroll", function() {
      if (scrollQueued) {
        return;
      }
      scrollQueued = true;
      window.requestAnimationFrame(function() {
        scrollQueued = false;
        recordScrollDepth();
      });
    }, { passive: true });
    window.setTimeout(recordScrollDepth, 800);

    document.addEventListener("click", function(event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") {
        return;
      }
      if (target.closest("[data-site-search-open]")) {
        emitOnce("search_open", "phx_search_open", {});
      }
      if (target.closest("[data-mobile-sidebar-open], [data-sidebar-restore=\"right\"]")) {
        emitOnce("contents_open", "phx_contents_open", {});
      }
      if (target.closest("[data-mobile-page-tools-toggle], [data-sidebar-restore=\"left\"]")) {
        emitOnce("outline_open", "phx_outline_open", {});
      }
      var relatedLink = target.closest(".related-reports a[href]");
      if (relatedLink) {
        emitReaderEngagement("phx_related_report_click", {
          destination_path: String(relatedLink.pathname || "").slice(0, 160)
        });
      }
      if (target.closest("[data-interactive-map-item], [data-uap-country], [data-interactive-map-continent-focus], [data-uap-world-map-region-focus]")) {
        emitOnce("map_interaction", "phx_map_interaction", {});
      }
      if (target.closest(".youtube-embed-container, .youtube-embed-card")) {
        emitOnce("video_start", "phx_video_start", {});
      }
    }, true);
  }

  function getUiString(name, fallback) {
    var attrName = "data-ui-" + String(name || "").replace(/_/g, "-");
    var body = document.body;
    var root = document.documentElement;
    var value = "";
    if (body && typeof body.getAttribute === "function") {
      value = String(body.getAttribute(attrName) || "").trim();
    }
    if (!value && root && typeof root.getAttribute === "function") {
      value = String(root.getAttribute(attrName) || "").trim();
    }
    return value || String(fallback || "");
  }

  function formatUiString(templateName, fallback, replacements) {
    var template = getUiString(templateName, fallback);
    return String(template || "").replace(/\{([a-z_]+)\}/gi, function (match, token) {
      if (!replacements || !Object.prototype.hasOwnProperty.call(replacements, token)) {
        return match;
      }
      return String(replacements[token] || "");
    });
  }

  function getAnchorOffsetPixels() {
    var root = document.documentElement;
    if (!root || !window.getComputedStyle) {
      return 0;
    }
    return parseCssPixels(window.getComputedStyle(root).getPropertyValue("--anchor-offset"));
  }

  function syncAnchorOffset() {
    var root = document.documentElement;
    var header = document.querySelector(".site-header");
    if (!root) {
      return 0;
    }
    if (!header || !window.getComputedStyle) {
      root.style.setProperty("--anchor-offset", "1rem");
      return 16;
    }

    var headerStyle = window.getComputedStyle(header);
    var isOverlayHeader = headerStyle && (headerStyle.position === "sticky" || headerStyle.position === "fixed");
    var headerHeight = Math.ceil(header.getBoundingClientRect().height || 0);
    var offsetPx = isOverlayHeader ? (headerHeight + 14) : 16;
    if (!Number.isFinite(offsetPx) || offsetPx < 16) {
      offsetPx = 16;
    }
    root.style.setProperty("--anchor-offset", String(offsetPx) + "px");
    return offsetPx;
  }

  function initAnchorOffsetSync() {
    syncAnchorOffset();
    window.addEventListener("resize", syncAnchorOffset);
    window.addEventListener("orientationchange", syncAnchorOffset);
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
      document.fonts.ready.then(function () {
        syncAnchorOffset();
      }).catch(function () {
        // Ignore font load observer failures.
      });
    }
  }

  function markActiveSidebarLink() {
    var currentPath = normalizePath(window.location.pathname);
    var links = document.querySelectorAll(".sidebar-link, .sidebar-item a");
    Array.prototype.forEach.call(links, function (link) {
      var href = link.getAttribute("href");
      if (!href) {
        return;
      }
      var resolvedPath = "";
      try {
        resolvedPath = normalizePath(new URL(href, window.location.origin).pathname);
      } catch (err) {
        resolvedPath = normalizePath(href);
      }
      if (resolvedPath === currentPath) {
        link.classList.add("is-current");
        link.setAttribute("aria-current", "page");
      }
    });
  }

  function setSidebarItemExpanded(item, expanded) {
    if (!item || !item.classList || !item.classList.contains("has-children")) {
      return;
    }
    var findSidebarDirectChild = function (className) {
      if (!item || !item.children) {
        return null;
      }
      for (var childIndex = 0; childIndex < item.children.length; childIndex += 1) {
        var child = item.children[childIndex];
        if (child && child.classList && child.classList.contains(className)) {
          return child;
        }
      }
      return null;
    };
    var isLockedOpen = item.hasAttribute("data-sidebar-lock-open");
    var toggle = findSidebarDirectChild("sidebar-toggle");
    var link = findSidebarDirectChild("sidebar-link");
    var label = String((link && (link.getAttribute("title") || link.textContent)) || "section").trim();
    var isExpanded = isLockedOpen ? true : Boolean(expanded);
    item.classList.toggle("is-collapsed", !isExpanded);
    item.classList.toggle("is-expanded", isExpanded);
    if (toggle) {
      toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      toggle.textContent = isExpanded ? "-" : "+";
      toggle.setAttribute("title", isExpanded ? getUiString("collapse-section", "Collapse section") : getUiString("expand-section", "Expand section"));
      toggle.setAttribute("aria-label", (isExpanded ? getUiString("collapse-section", "Collapse section") : getUiString("expand-section", "Expand section")) + ": " + label);
    }
  }

  function getRootSidebarNavs() {
    var navs = document.querySelectorAll("[data-sidebar-nav]");
    return Array.prototype.filter.call(navs, function (nav) {
      return !nav.parentElement || !nav.parentElement.closest("[data-sidebar-nav]");
    });
  }

  function initSidebarCollapsingForNav(nav) {
    if (!nav) {
      return;
    }
    var sidebarRoot = nav.closest(".sidebar") || nav.parentElement || document;

    /* Auto-collapse sidebar L3+ when tree has >20 items */
    var allSidebarItems = nav.querySelectorAll(".sidebar-item[data-sidebar-level]");
    if (allSidebarItems.length > 20) {
      for (var si = 0; si < allSidebarItems.length; si++) {
        var lvl = parseInt(allSidebarItems[si].getAttribute("data-sidebar-level") || "1", 10);
        if (lvl >= 3 && allSidebarItems[si].classList.contains("is-expanded")) {
          setSidebarItemExpanded(allSidebarItems[si], false);
        }
      }
    }

    var items = nav.querySelectorAll(".sidebar-item.has-children");
    var pathParts = normalizePath(window.location.pathname).split("/").filter(Boolean);
    var siteScope = pathParts.length ? pathParts[0] : "root";
    var storageKey = "phoenix-sidebar-expanded-v2-" + siteScope;
    var persistedState = {};
    try {
      var rawPersisted = String(readLocalStorage(storageKey) || "").trim();
      if (rawPersisted) {
        var parsedPersisted = JSON.parse(rawPersisted);
        if (parsedPersisted && typeof parsedPersisted === "object") {
          persistedState = parsedPersisted;
        }
      }
    } catch (err) {
      persistedState = {};
    }

    var getItemStorageKey = function (item) {
      if (!item) {
        return "";
      }
      var link = null;
      if (item.children) {
        for (var childIndex = 0; childIndex < item.children.length; childIndex += 1) {
          var child = item.children[childIndex];
          if (child && child.classList && child.classList.contains("sidebar-link")) {
            link = child;
            break;
          }
        }
      }
      var href = String((link && link.getAttribute("href")) || "").trim();
      if (href) {
        try {
          return normalizePath(new URL(href, window.location.origin).pathname);
        } catch (err) {
          return normalizePath(href);
        }
      }
      var label = String((link && (link.getAttribute("title") || link.textContent)) || "").trim().toLowerCase();
      if (label) {
        return "label:" + label.replace(/\s+/g, " ");
      }
      return "";
    };

    var savePersistedState = function () {
      try {
        writeLocalStorage(storageKey, JSON.stringify(persistedState));
      } catch (err) {
        // Ignore serialization/storage failures.
      }
    };

    var setExpandedWithPersistence = function (item, expanded, persistChoice) {
      setSidebarItemExpanded(item, expanded);
      if (!persistChoice) {
        return;
      }
      if (item && item.hasAttribute && item.hasAttribute("data-sidebar-lock-open")) {
        return;
      }
      var key = getItemStorageKey(item);
      if (!key) {
        return;
      }
      persistedState[key] = expanded ? 1 : 0;
      savePersistedState();
    };

    var setAllExpandedWithPersistence = function (expanded, persistChoice) {
      Array.prototype.forEach.call(items, function (item) {
        setExpandedWithPersistence(item, expanded, persistChoice);
      });
      updateBulkActionState();
    };

    var controlsRoot = nav.parentElement || sidebarRoot;
    var bulkActionTopThreshold = 10;
    var actionsRoots = controlsRoot.querySelectorAll(".sidebar-tree-actions");
    var expandAllButtons = controlsRoot.querySelectorAll("[data-sidebar-expand-all]");
    var collapseAllButtons = controlsRoot.querySelectorAll("[data-sidebar-collapse-all]");
    var showTopBulkActions = nav.querySelectorAll(".sidebar-link").length > bulkActionTopThreshold;
    var actionableItems = Array.prototype.filter.call(items, function (item) {
      return !(item && item.hasAttribute && item.hasAttribute("data-sidebar-lock-open"));
    });
    var hasFlexibleExpansion = actionableItems.length > 0;
    var updateBulkActionButtons = function (buttons, isActive) {
      if (!buttons || !buttons.length) {
        return;
      }
      Array.prototype.forEach.call(buttons, function (button) {
        if (!button) {
          return;
        }
        button.classList.toggle("is-active", Boolean(isActive));
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    };
    var updateBulkActionState = function () {
      if (!hasFlexibleExpansion) {
        return;
      }
      var allExpanded = actionableItems.every(function (item) {
        return item && !item.classList.contains("is-collapsed");
      });
      var allCollapsed = actionableItems.every(function (item) {
        return item && item.classList.contains("is-collapsed");
      });
      updateBulkActionButtons(expandAllButtons, allExpanded);
      updateBulkActionButtons(collapseAllButtons, allCollapsed);
    };

    var getSidebarLevel = function (item) {
      var parsed = parseInt(String((item && item.getAttribute("data-sidebar-level")) || "1"), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    };

    var expandCurrentBranch = function (currentLink) {
      if (!currentLink) {
        return;
      }
      var currentItem = currentLink.closest(".sidebar-item");
      while (currentItem) {
        if (currentItem.classList.contains("has-children")) {
          setExpandedWithPersistence(currentItem, true, false);
        }
        var parentList = currentItem.parentElement;
        currentItem = parentList ? parentList.closest(".sidebar-item") : null;
      }
    };

    var scrollSidebarToCurrent = function (currentLink) {
      if (!currentLink || !currentLink.getBoundingClientRect) {
        return;
      }
      var scrollHost = currentLink.closest(".sidebar-scroll-region") || nav.closest(".sidebar");
      if (!scrollHost || !scrollHost.getBoundingClientRect) {
        return;
      }
      var hostRect = scrollHost.getBoundingClientRect();
      var linkRect = currentLink.getBoundingClientRect();
      var pad = Math.max(24, Math.round(scrollHost.clientHeight * 0.16));
      var upperBound = hostRect.top + pad;
      var lowerBound = hostRect.bottom - pad;
      if (linkRect.top >= upperBound && linkRect.bottom <= lowerBound) {
        return;
      }
      var delta = (linkRect.top - hostRect.top) - Math.round(scrollHost.clientHeight * 0.32);
      scrollHost.scrollTop = Math.max(0, scrollHost.scrollTop + delta);
      if (typeof currentLink.scrollIntoView === "function") {
        try {
          currentLink.scrollIntoView({ block: "center", inline: "nearest" });
        } catch (err) {
          // Ignore unsupported scrollIntoView options.
        }
      }
    };

    var expandLevelTwoWhenTopLevelSparse = function () {
      var topLevelVisible = nav.querySelectorAll('.sidebar-item[data-sidebar-level="1"]:not(.is-filtered-out)');
      if (topLevelVisible.length >= 3) {
        return;
      }
      Array.prototype.forEach.call(items, function (item) {
        if (getSidebarLevel(item) === 1) {
          setExpandedWithPersistence(item, true, false);
        }
      });
    };

    Array.prototype.forEach.call(items, function (item) {
      var key = getItemStorageKey(item);
      var storedToken = key ? persistedState[key] : null;
      var hasStoredState = storedToken === 0 || storedToken === 1 || storedToken === true || storedToken === false;
      var initialExpanded = item.hasAttribute("data-sidebar-lock-open")
        ? true
        : (hasStoredState ? (storedToken === 1 || storedToken === true) : !item.classList.contains("is-collapsed"));
      setSidebarItemExpanded(item, initialExpanded);
      var toggle = null;
      if (item.children) {
        for (var childIndex = 0; childIndex < item.children.length; childIndex += 1) {
          var child = item.children[childIndex];
          if (child && child.classList && child.classList.contains("sidebar-toggle")) {
            toggle = child;
            break;
          }
        }
      }
      if (!toggle) {
        return;
      }
      toggle.addEventListener("click", function (event) {
        event.preventDefault();
        var shouldExpand = item.classList.contains("is-collapsed");
        setExpandedWithPersistence(item, shouldExpand, true);
        updateBulkActionState();
      });
    });

    var currentLink = nav.querySelector(".sidebar-link.is-current");
    if (currentLink) {
      expandCurrentBranch(currentLink);
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(function () {
          scrollSidebarToCurrent(currentLink);
          window.setTimeout(function () {
            scrollSidebarToCurrent(currentLink);
          }, 120);
        });
      } else {
        scrollSidebarToCurrent(currentLink);
      }
    }

    Array.prototype.forEach.call(actionsRoots, function (actionsRoot) {
      var isTopActions = actionsRoot && actionsRoot.hasAttribute("data-sidebar-tree-actions-top");
      actionsRoot.hidden = !hasFlexibleExpansion || (isTopActions && !showTopBulkActions);
    });
    Array.prototype.forEach.call(expandAllButtons, function (button) {
      button.hidden = !hasFlexibleExpansion;
      button.disabled = !hasFlexibleExpansion;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", function () {
        setAllExpandedWithPersistence(true, true);
      });
    });

    Array.prototype.forEach.call(collapseAllButtons, function (button) {
      button.hidden = !hasFlexibleExpansion;
      button.disabled = !hasFlexibleExpansion;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", function () {
        setAllExpandedWithPersistence(false, true);
      });
    });
    updateBulkActionState();
  }

  function initSidebarCollapsing() {
    var navs = getRootSidebarNavs();
    if (!navs.length) {
      return;
    }
    Array.prototype.forEach.call(navs, function (nav) {
      initSidebarCollapsingForNav(nav);
    });
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function getSearchTokens(value) {
    var normalized = normalizeSearchText(value);
    return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
  }

  function matchesNormalizedSearchQuery(normalizedQuery, normalizedHaystack, haystackTokens) {
    if (!normalizedQuery) {
      return true;
    }
    if (!normalizedHaystack) {
      return false;
    }
    if (normalizedHaystack.indexOf(normalizedQuery) !== -1) {
      return true;
    }

    var queryTokens = getSearchTokens(normalizedQuery);
    var targetTokens = haystackTokens && haystackTokens.length ? haystackTokens : getSearchTokens(normalizedHaystack);
    if (!queryTokens.length || !targetTokens.length) {
      return false;
    }

    return queryTokens.every(function (queryToken) {
      return targetTokens.some(function (haystackToken) {
        if (haystackToken === queryToken || haystackToken.indexOf(queryToken) === 0) {
          return true;
        }
        if (queryToken.length >= 4 && haystackToken.indexOf(queryToken) !== -1) {
          return true;
        }
        if (haystackToken.length >= 4 && queryToken.indexOf(haystackToken) === 0) {
          return true;
        }
        return false;
      });
    });
  }

  function matchesSearchQuery(query, haystack) {
    return matchesNormalizedSearchQuery(normalizeSearchText(query), normalizeSearchText(haystack), null);
  }

  var liveSearchRenderDelayMs = 180;
  var searchPageResultRenderLimit = 60;
  var searchPageBackToTopThreshold = 24;

  function createSearchRenderScheduler(renderNow, options) {
    var settings = options || {};
    var delayMs = Number(settings.delayMs || liveSearchRenderDelayMs) || liveSearchRenderDelayMs;
    var pendingTimer = 0;
    var cancel = function () {
      if (pendingTimer) {
        window.clearTimeout(pendingTimer);
        pendingTimer = 0;
      }
    };
    return {
      schedule: function (renderOptions) {
        cancel();
        if (settings.shouldRenderImmediately && settings.shouldRenderImmediately(renderOptions)) {
          renderNow(renderOptions || {});
          return;
        }
        if (settings.onPending) {
          settings.onPending(renderOptions || {});
        }
        pendingTimer = window.setTimeout(function () {
          pendingTimer = 0;
          renderNow(settings.getDelayedOptions ? settings.getDelayedOptions(renderOptions || {}) : (renderOptions || {}));
        }, delayMs);
      },
      flush: function (renderOptions) {
        cancel();
        renderNow(renderOptions || {});
      },
      cancel: cancel
    };
  }

  function initSidebarFilterForNav(nav) {
    if (!nav) {
      return;
    }
    var sidebarRoot = nav.closest(".sidebar") || nav.parentElement || document;
    var input = sidebarRoot.querySelector("[data-sidebar-filter]");
    var status = sidebarRoot.querySelector("[data-sidebar-filter-status]");
    var clearButton = sidebarRoot.querySelector("[data-sidebar-filter-clear]");
    var resultsContainer = sidebarRoot.querySelector("[data-sidebar-filter-results]");
    var tabs = sidebarRoot.querySelector("[data-sidebar-search-tabs]");
    if (!input) {
      return;
    }
    var activeSearchMode = "all";
    var preparedPages = null;
    var preparedPagesIsFallback = false;
    var currentPageSections = null;
    var latestRanked = [];
    var hasThisPageSearch = !!document.querySelector(".article-body") && !(document.body && document.body.classList.contains("page-home"));
    var refreshAllPageResultsAfterIndexLoad = function (queryAtRequestTime) {
      if (activeSearchMode === "page") {
        return;
      }
      loadSiteSearchIndex().then(function () {
        preparedPages = null;
        preparedPagesIsFallback = false;
        if (String(input.value || "").trim() === String(queryAtRequestTime || "").trim()) {
          applyFilter();
        }
      }).catch(function () {
        // Keep using the local fallback records when the full index is unavailable.
      });
    };
    var syncSidebarSearchTabs = function () {
      if (!tabs) {
        return;
      }
      tabs.setAttribute("data-single-tab", hasThisPageSearch ? "false" : "true");
      Array.prototype.forEach.call(tabs.querySelectorAll("[data-sidebar-search-tab]"), function (tab) {
        var mode = tab.getAttribute("data-sidebar-search-tab") === "page" ? "page" : "all";
        var isAvailable = mode !== "page" || hasThisPageSearch;
        var selected = mode === activeSearchMode && isAvailable;
        tab.hidden = !isAvailable;
        tab.classList.toggle("is-active", selected);
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.setAttribute("tabindex", selected ? "0" : "-1");
      });
    };
    var syncSidebarSearchPlaceholder = function () {
      if (!input) {
        return;
      }
      input.setAttribute("placeholder", activeSearchMode === "page"
        ? (getUiString("search-this-page", "Search this page") + "...")
        : getUiString("search-site-placeholder", "Search title, summary, or page text..."));
    };
    var renderSidebarSearchResult = function (record, query, mode, hitCount) {
      var href = buildUrlWithSearchHighlight(record.url || "#", query);
      var title = mode === "page" ? (record.sectionTitle || getUiString("overview", "Overview")) : record.title;
      var kicker = mode === "page"
        ? [record.sectionNumber ? ("Section " + record.sectionNumber) : "", record.sectionTitle || ""].filter(Boolean).join(" - ")
        : (record.breadcrumb || getUiString("search-kind-page-location", "Page"));
      var snippetSource = mode === "page"
        ? [record.sectionTitle, record.text].filter(Boolean).join(" ")
        : [record.title, record.description, record.text, record.breadcrumb].filter(Boolean).join(" ");
      var numericHitCount = Math.max(0, Number(hitCount || 0) || 0);
      var hitCountPill = mode !== "page" && numericHitCount > 0
        ? '<span class="sidebar-filter-result-hit-count">' + escapeHtml(numericHitCount === 1 ? "1 hit" : String(numericHitCount) + " hits") + "</span>"
        : "";
      return ''
        + '<a class="sidebar-filter-result-item" href="' + escapeHtml(href) + '">'
        + '<span class="sidebar-filter-result-kicker">' + escapeHtml(kicker || getUiString("overview", "Overview")) + "</span>"
        + '<span class="sidebar-filter-result-title">' + escapeHtml(title || getUiString("overview", "Overview")) + "</span>"
        + hitCountPill
        + '<span class="sidebar-filter-result-excerpt">' + buildHighlightedSnippet(snippetSource, query, 140) + "</span>"
        + "</a>";
    };
    var renderResults = function (ranked, query) {
      if (!resultsContainer) {
        return;
      }
      if (!query) {
        resultsContainer.hidden = true;
        resultsContainer.innerHTML = "";
        return;
      }
      resultsContainer.hidden = false;
      if (!ranked.length) {
        var emptyResult = activeSearchMode === "page"
          ? getUiString("no-search-this-page-results", "No sections on this page match this search.")
          : getUiString("no-search-results", "No pages match this search.");
        resultsContainer.innerHTML = '<p class="sidebar-filter-empty">' + escapeHtml(emptyResult) + "</p>";
        return;
      }
      resultsContainer.innerHTML = ranked.slice(0, 8).map(function (item) {
        return renderSidebarSearchResult(item.page, query, activeSearchMode, item.hitCount);
      }).join("");
    };
    var applyFilter = function () {
      if (activeSearchMode === "page" && !hasThisPageSearch) {
        activeSearchMode = "all";
      }
      syncSidebarSearchTabs();
      syncSidebarSearchPlaceholder();
      var query = String(input.value || "").trim();
      if (!query) {
        latestRanked = [];
        renderResults([], "");
        if (status) {
          status.setAttribute("data-state", "default");
          status.textContent = "";
        }
        if (clearButton) {
          clearButton.hidden = true;
        }
        return;
      }
      if (activeSearchMode !== "page" && (!preparedPages || (preparedPagesIsFallback && isSiteSearchIndexLoaded()))) {
        preparedPages = prepareSiteSearchPages();
        preparedPagesIsFallback = !isSiteSearchIndexLoaded();
      }
      if (activeSearchMode !== "page" && preparedPagesIsFallback) {
        refreshAllPageResultsAfterIndexLoad(query);
      }
      if (!preparedPages) {
        preparedPages = prepareSiteSearchPages();
        preparedPagesIsFallback = !isSiteSearchIndexLoaded();
      }
      if (!currentPageSections) {
        currentPageSections = getCurrentPageSearchSections();
      }
      var source = activeSearchMode === "page" ? currentPageSections : preparedPages;
      var ranked = rankSearchRecords(source, query, activeSearchMode);
      latestRanked = ranked;
      renderResults(ranked, query);
      if (status) {
        if (!ranked.length) {
          status.setAttribute("data-state", "empty");
          status.textContent = activeSearchMode === "page"
            ? getUiString("no-search-this-page-results", "No sections on this page match this search.")
            : getUiString("no-search-results", "No pages match this search.");
        } else {
          status.setAttribute("data-state", "active");
          status.textContent = formatUiString("search-results-count-template", "{count} results", {
            count: String(ranked.length)
          });
        }
      }
      if (clearButton) {
        clearButton.hidden = false;
      }
    };
    var scheduledApplyFilter = createSearchRenderScheduler(applyFilter, {
      shouldRenderImmediately: function () {
        return !String(input.value || "").trim();
      },
      onPending: function () {
        if (status && String(input.value || "").trim()) {
          status.setAttribute("data-state", "active");
          status.textContent = "Searching...";
        }
      }
    });
    input.addEventListener("focus", function () {
      if (activeSearchMode !== "page" && !isSiteSearchIndexLoaded()) {
        refreshAllPageResultsAfterIndexLoad(input.value);
      }
    });
    input.addEventListener("input", function () {
      scheduledApplyFilter.schedule();
    });
    input.addEventListener("keydown", function (event) {
      var key = String(event.key || "");
      if (key === "Enter" && String(input.value || "").trim()) {
        event.preventDefault();
        scheduledApplyFilter.flush();
        if (activeSearchMode === "page" && latestRanked.length) {
          window.location.href = buildUrlWithSearchHighlight(latestRanked[0].page.url || window.location.href, input.value);
        } else {
          navigateToSearchResultsPage(input.value);
        }
        return;
      }
      if (key === "Escape" && String(input.value || "").trim()) {
        input.value = "";
        scheduledApplyFilter.flush();
        input.focus();
      }
    });
    if (clearButton) {
      clearButton.addEventListener("click", function () {
        input.value = "";
        scheduledApplyFilter.flush();
        input.focus();
      });
    }
    if (tabs) {
      tabs.addEventListener("click", function (event) {
        var tab = event.target && event.target.closest ? event.target.closest("[data-sidebar-search-tab]") : null;
        if (!tab || tab.hidden) {
          return;
        }
        activeSearchMode = tab.getAttribute("data-sidebar-search-tab") === "page" ? "page" : "all";
        if (activeSearchMode !== "page" && !isSiteSearchIndexLoaded()) {
          refreshAllPageResultsAfterIndexLoad(input.value);
        }
        scheduledApplyFilter.flush();
        input.focus();
      });
    }
    applyFilter();
  }

  function initSidebarFilter() {
    var navs = getRootSidebarNavs();
    if (!navs.length) {
      return;
    }
    Array.prototype.forEach.call(navs, function (nav) {
      initSidebarFilterForNav(nav);
    });
  }

  function initMobileSidebarMode() {
    var root = document.documentElement;
    var sidebar = document.querySelector("[data-mobile-sidebar-panel]");
    var openButtons = document.querySelectorAll("[data-mobile-sidebar-open]");
    var closeButtons = document.querySelectorAll("[data-mobile-sidebar-close]");
    if (!root || !sidebar || !openButtons.length) {
      return;
    }

    var sidebarMode = String(root.getAttribute("data-mobile-sidebar") || "static").toLowerCase();
    if (sidebarMode !== "collapsible") {
      return;
    }

    var defaultState = String(root.getAttribute("data-mobile-sidebar-default") || "closed").toLowerCase();
    var isOpen = defaultState === "open";
    var presentationMode = "contents";
    var activeTrigger = null;
    var titleNodes = sidebar.querySelectorAll(".mobile-sidebar-title, .sidebar-section-title");
    var presentationCloseButtons = sidebar.querySelectorAll("[data-mobile-sidebar-close], [data-sidebar-hide='right']");
    var focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");

    sidebar.setAttribute("role", "dialog");
    sidebar.setAttribute("aria-modal", "true");
    sidebar.setAttribute("tabindex", "-1");

    var getFocusableNodes = function () {
      return Array.prototype.filter.call(sidebar.querySelectorAll(focusableSelector), function (node) {
        return !node.hidden && node.getAttribute("aria-hidden") !== "true" && node.getClientRects().length > 0;
      });
    };

    var getPresentationTitle = function (mode) {
      if (mode === "search") {
        return getUiString("search-panel-title", getUiString("search", "Search"));
      }
      return getUiString("website-contents", getUiString("contents", "Contents"));
    };

    var getTriggerLabel = function (mode) {
      if (mode === "search") {
        return getUiString("search", "Search");
      }
      return getUiString("contents", "Contents");
    };

    var getOpenLabel = function (mode) {
      if (mode === "search") {
        return getUiString("open-search", "Open search");
      }
      return getUiString("open-contents", "Open contents");
    };

    var getCloseLabel = function (mode) {
      if (mode === "search") {
        return getUiString("close-search", "Close search");
      }
      return getUiString("close-contents", "Close contents");
    };

    var applyPresentation = function (mode) {
      presentationMode = mode === "search" ? "search" : "contents";
      sidebar.setAttribute("data-mobile-sidebar-view", presentationMode);
      sidebar.setAttribute("aria-label", getPresentationTitle(presentationMode));
      Array.prototype.forEach.call(titleNodes, function (node) {
        node.textContent = getPresentationTitle(presentationMode);
      });
      Array.prototype.forEach.call(presentationCloseButtons, function (button) {
        button.setAttribute("aria-label", getCloseLabel(presentationMode));
      });
    };

    Array.prototype.forEach.call(openButtons, function (button) {
      if (!button.hasAttribute("data-mobile-sidebar-label")) {
        button.setAttribute(
          "data-mobile-sidebar-label",
          String(button.textContent || "").trim() || getUiString("contents", "Contents")
        );
      }
    });

    var applyState = function (nextOpen, restoreFocus) {
      isOpen = Boolean(nextOpen);
      if (isOpen && !activeTrigger && document.activeElement && document.activeElement !== document.body) {
        activeTrigger = document.activeElement;
      }
      if (!isOpen) {
        applyPresentation("contents");
      }
      document.body.classList.toggle("mobile-sidebar-open", isOpen);
      sidebar.setAttribute("aria-hidden", isOpen ? "false" : "true");
      Array.prototype.forEach.call(openButtons, function (button) {
        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        button.setAttribute("aria-label", isOpen ? getCloseLabel(presentationMode) : getOpenLabel(presentationMode));
        button.textContent = isOpen
          ? getTriggerLabel(presentationMode)
          : (button.getAttribute("data-mobile-sidebar-label") || getUiString("contents", "Contents"));
      });
      if (isOpen) {
        window.requestAnimationFrame(function () {
          var focusTarget = presentationMode === "search"
            ? sidebar.querySelector("[data-sidebar-filter]")
            : null;
          focusTarget = focusTarget || sidebar.querySelector("[data-mobile-sidebar-close]") || getFocusableNodes()[0];
          if (focusTarget && typeof focusTarget.focus === "function") {
            focusTarget.focus();
          }
        });
      } else if (restoreFocus !== false && activeTrigger && typeof activeTrigger.focus === "function") {
        activeTrigger.focus();
        activeTrigger = null;
      }
    };

    Array.prototype.forEach.call(openButtons, function (button) {
      button.addEventListener("click", function () {
        if (!isOpen) {
          activeTrigger = button;
          applyPresentation("contents");
        }
        applyState(!isOpen);
      });
    });

    Array.prototype.forEach.call(closeButtons, function (button) {
      button.addEventListener("click", function () {
        applyState(false);
      });
    });

    Array.prototype.forEach.call(sidebar.querySelectorAll(".sidebar-link"), function (link) {
      link.addEventListener("click", function () {
        if (window.matchMedia && window.matchMedia(getArticleDrawerMediaQuery()).matches) {
          applyState(false, false);
        }
      });
    });

    document.addEventListener("keydown", function (event) {
      if (!isOpen) {
        return;
      }
      var key = String(event.key || "");
      if (key === "Escape") {
        event.preventDefault();
        applyState(false);
        return;
      }
      if (key !== "Tab") {
        return;
      }
      var focusableNodes = getFocusableNodes();
      if (!focusableNodes.length) {
        event.preventDefault();
        sidebar.focus();
        return;
      }
      var firstNode = focusableNodes[0];
      var lastNode = focusableNodes[focusableNodes.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    });

    document.body.__phoenixMobileSidebar = {
      isOpen: function () {
        return isOpen;
      },
      setOpen: function (nextOpen) {
        applyState(nextOpen);
      },
      setPresentation: function (mode) {
        applyPresentation(mode);
        if (isOpen) {
          applyState(true);
        }
      }
    };

    applyPresentation("contents");
    applyState(isOpen, false);
  }

  function initMobileQuickNav() {
    var quickSearchButtons = document.querySelectorAll("[data-quick-search]:not([data-site-search-open])");
    if (!quickSearchButtons.length) {
      return;
    }

    var focusSearchInput = function () {
      var sidebarFilter = document.querySelector("[data-sidebar-filter]");
      if (sidebarFilter && typeof sidebarFilter.focus === "function") {
        sidebarFilter.focus();
        if (typeof sidebarFilter.select === "function") {
          sidebarFilter.select();
        }
        return;
      }
      var homeFilter = document.querySelector("[data-home-filter]");
      if (homeFilter && typeof homeFilter.focus === "function") {
        homeFilter.focus();
      }
    };

    Array.prototype.forEach.call(quickSearchButtons, function (button) {
      button.addEventListener("click", function () {
        var sidebarController = document.body.__phoenixMobileSidebar || null;
        var openButton = document.querySelector("[data-mobile-sidebar-open]");
        var isMobile = Boolean(window.matchMedia && window.matchMedia(getArticleDrawerMediaQuery()).matches);
        var shouldOpenSidebar = Boolean(
          openButton
          && isMobile
          && (
            sidebarController
              ? !sidebarController.isOpen()
              : String(openButton.getAttribute("aria-expanded") || "false") !== "true"
          )
        );
        if (sidebarController && isMobile) {
          sidebarController.setPresentation("search");
        }
        if (shouldOpenSidebar) {
          if (sidebarController) {
            sidebarController.setOpen(true);
          } else {
            openButton.click();
          }
          window.setTimeout(focusSearchInput, 160);
          return;
        }
        focusSearchInput();
      });
    });
  }

  function getSiteBaseUrl() {
    var body = document.body;
    var root = document.documentElement;
    var rawBase = "";
    if (body && typeof body.getAttribute === "function") {
      rawBase = String(body.getAttribute("data-site-baseurl") || "").trim();
    }
    if (!rawBase && root && typeof root.getAttribute === "function") {
      rawBase = String(root.getAttribute("data-site-baseurl") || "").trim();
    }
    if (!rawBase || rawBase === "/") {
      return "";
    }
    if (rawBase.charAt(0) !== "/") {
      rawBase = "/" + rawBase;
    }
    return rawBase.replace(/\/+$/, "");
  }

  var siteSearchIndexPromise = null;

  function getUiBundleVersion() {
    var body = document.body;
    var root = document.documentElement;
    var version = "";
    if (body && typeof body.getAttribute === "function") {
      version = String(body.getAttribute("data-ui-bundle-version") || "").trim();
    }
    if (!version && root && typeof root.getAttribute === "function") {
      version = String(root.getAttribute("data-ui-bundle-version") || "").trim();
    }
    return version || "1";
  }

  function isSiteSearchIndexLoaded() {
    return Boolean(window.PhoenixSiteSearchIndex);
  }

  function loadSiteSearchIndex() {
    if (window.PhoenixSiteSearchIndex) {
      return Promise.resolve(window.PhoenixSiteSearchIndex);
    }
    if (siteSearchIndexPromise) {
      return siteSearchIndexPromise;
    }
    siteSearchIndexPromise = new Promise(function (resolve, reject) {
      var existingScript = document.querySelector('script[data-site-search-index-loader="true"]');
      if (existingScript) {
        existingScript.parentNode.removeChild(existingScript);
      }
      var script = document.createElement("script");
      script.async = true;
      script.setAttribute("data-site-search-index-loader", "true");
      script.src = getSiteBaseUrl() + "/assets/js/search-index.js?v=" + encodeURIComponent(getUiBundleVersion());
      script.onload = function () {
        if (window.PhoenixSiteSearchIndex) {
          resolve(window.PhoenixSiteSearchIndex);
          return;
        }
        siteSearchIndexPromise = null;
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        reject(new Error("PhoenixSiteSearchIndex failed to populate."));
      };
      script.onerror = function () {
        siteSearchIndexPromise = null;
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        reject(new Error("Unable to load search index."));
      };
      document.head.appendChild(script);
    });
    return siteSearchIndexPromise;
  }

  function resolveSiteSearchUrl(rawUrl) {
    var url = String(rawUrl || "").trim();
    if (!url) {
      return "#";
    }
    if (/^(?:https?:)?\/\//i.test(url) || /^(?:mailto|tel):/i.test(url)) {
      return url;
    }
    if (url.charAt(0) !== "/") {
      return url;
    }
    var baseUrl = getSiteBaseUrl();
    if (baseUrl && url !== baseUrl && url.indexOf(baseUrl + "/") !== 0) {
      return baseUrl + url;
    }
    return url;
  }

  function getSearchResultsPageUrl(query) {
    var baseUrl = getSiteBaseUrl();
    var path = (baseUrl || "") + "/search/";
    var trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
      return path;
    }
    return path + "?q=" + encodeURIComponent(trimmedQuery);
  }

  function getSearchHighlightQueryFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      return String(params.get("search_highlight") || "").trim();
    } catch (err) {
      return "";
    }
  }

  function buildUrlWithSearchHighlight(rawUrl, query) {
    var trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
      return rawUrl || "#";
    }
    try {
      var parsed = new URL(String(rawUrl || "#"), window.location.href);
      parsed.searchParams.set("search_highlight", trimmedQuery);
      if (parsed.origin === window.location.origin) {
        return parsed.pathname + parsed.search + parsed.hash;
      }
      return parsed.href;
    } catch (err) {
      var joiner = String(rawUrl || "").indexOf("?") === -1 ? "?" : "&";
      return String(rawUrl || "#") + joiner + "search_highlight=" + encodeURIComponent(trimmedQuery);
    }
  }

  function navigateToSearchResultsPage(query) {
    var trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
      return false;
    }
    window.location.href = getSearchResultsPageUrl(trimmedQuery);
    return true;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function collapseSearchText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function trimSearchText(value, maxChars) {
    var text = collapseSearchText(value);
    var limit = Math.max(20, Number(maxChars || 180));
    if (text.length <= limit) {
      return text;
    }
    return text.slice(0, limit - 1).replace(/\s+\S*$/, "") + "...";
  }

  function findFirstSearchMatch(text, query) {
    var normalizedText = String(text || "").toLowerCase();
    var tokens = getSearchTokens(query);
    var best = null;
    Array.prototype.forEach.call(tokens, function (token) {
      if (!token || token.length < 2) {
        return;
      }
      var index = normalizedText.indexOf(token);
      if (index !== -1 && (!best || index < best.index)) {
        best = { index: index, length: token.length };
      }
    });
    return best;
  }

  function buildHighlightedSnippet(text, query, maxChars) {
    var source = collapseSearchText(text);
    if (!source) {
      return "";
    }
    var match = findFirstSearchMatch(source, query);
    var limit = Math.max(80, Number(maxChars || 220));
    var snippet = source;
    var offset = 0;
    if (match) {
      var start = Math.max(0, match.index - 72);
      var end = Math.min(source.length, match.index + 150);
      snippet = source.slice(start, end).trim();
      offset = match.index - start;
      if (start > 0) {
        snippet = "... " + snippet;
        offset += 4;
      }
      if (end < source.length) {
        snippet += " ...";
      }
    }
    snippet = trimSearchText(snippet, limit);
    if (!match || offset < 0 || offset >= snippet.length) {
      return escapeHtml(snippet);
    }
    var matchedText = snippet.slice(offset, offset + match.length);
    return escapeHtml(snippet.slice(0, offset))
      + '<mark class="site-search-highlight">' + escapeHtml(matchedText) + "</mark>"
      + escapeHtml(snippet.slice(offset + match.length));
  }

  function getSearchMatchKind(record, query) {
    var normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery || !record) {
      return getUiString("search-kind-relevant-snippet", "Relevant snippet");
    }
    var fields = [
      ["title", getUiString("search-kind-page-title", "Page title")],
      ["description", getUiString("search-kind-page-summary", "Summary of page")],
      ["breadcrumb", getUiString("search-kind-page-location", "Page location")],
      ["sectionTitle", getUiString("search-kind-section-title", "Section title")],
      ["text", getUiString("search-kind-relevant-snippet", "Relevant snippet")]
    ];
    for (var i = 0; i < fields.length; i += 1) {
      if (normalizeSearchText(record[fields[i][0]] || "").indexOf(normalizedQuery) !== -1) {
        return fields[i][1];
      }
    }
    return getUiString("search-kind-relevant-snippet", "Relevant snippet");
  }

  function getSiteSearchIndexPages() {
    var payload = window.PhoenixSiteSearchIndex || null;
    if (Array.isArray(payload)) {
      return payload;
    }
    if (payload && Array.isArray(payload.pages)) {
      return payload.pages;
    }
    return [];
  }

  function collectSiteSearchFallbackPages() {
    var pages = [];
    var seen = Object.create(null);
    var links = document.querySelectorAll("a.sidebar-link, a.topics-menu-link, .topic-card a[href]");
    Array.prototype.forEach.call(links, function (link) {
      var href = String(link.getAttribute("href") || "").trim();
      if (!href || href.charAt(0) === "#" || /^javascript:/i.test(href)) {
        return;
      }
      var title = collapseSearchText(link.getAttribute("title") || link.textContent || "");
      if (!title) {
        return;
      }
      var normalizedUrl = href;
      try {
        var parsed = new URL(href, window.location.href);
        normalizedUrl = parsed.origin === window.location.origin
          ? (parsed.pathname + parsed.search + parsed.hash)
          : parsed.href;
      } catch (err) {
        normalizedUrl = href;
      }
      var key = normalizePath(normalizedUrl);
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      var card = link.closest ? link.closest(".topic-card") : null;
      var descriptionNode = card ? card.querySelector(".topic-card-summary, .home-cluster-node-summary") : null;
      pages.push({
        title: title,
        url: normalizedUrl,
        description: collapseSearchText(descriptionNode ? descriptionNode.textContent : ""),
        breadcrumb: "",
        text: collapseSearchText((card && card.getAttribute("data-card-search")) || title)
      });
    });
    return pages;
  }

  function prepareSiteSearchPages(sourcePages) {
    sourcePages = sourcePages || getSiteSearchIndexPages();
    if (!sourcePages.length) {
      sourcePages = collectSiteSearchFallbackPages();
    }
    var seen = Object.create(null);
    var prepared = [];
    Array.prototype.forEach.call(sourcePages, function (page, index) {
      if (!page || typeof page !== "object") {
        return;
      }
      var title = collapseSearchText(page.title || page.display_title || page.nav_title || "");
      var url = resolveSiteSearchUrl(page.url || page.permalink || "");
      if (!title || !url || url === "#") {
        return;
      }
      var key = normalizePath(url);
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      var description = trimSearchText(page.description || page.summary || page.hero_summary || "", 260);
      var breadcrumb = collapseSearchText(page.breadcrumb || page.section || page.parent_title || "");
      var text = collapseSearchText(page.text || page.search_text || page.body || "");
      var searchBlob = collapseSearchText([title, breadcrumb, description, text].join(" "));
      var normalizedSearchBlob = normalizeSearchText(searchBlob);
      prepared.push({
        title: title,
        url: url,
        description: description,
        breadcrumb: breadcrumb,
        text: text,
        level: Number(page.level || 0) || 0,
        _index: index,
        _searchBlob: searchBlob,
        _searchBlobNormalized: normalizedSearchBlob,
        _searchTokens: normalizedSearchBlob ? normalizedSearchBlob.split(/\s+/).filter(Boolean) : [],
        _searchTitle: normalizeSearchText(title),
        _searchDescription: normalizeSearchText(description),
        _searchBreadcrumb: normalizeSearchText(breadcrumb),
        _searchText: normalizeSearchText(text)
      });
    });
    return prepared;
  }

  function scoreSiteSearchPage(page, query) {
    if (!page) {
      return 0;
    }
    var normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return Math.max(1, 20 - Math.max(0, Number(page.level || 0))) - (page._index || 0) / 1000;
    }
    if (!matchesNormalizedSearchQuery(normalizedQuery, page._searchBlobNormalized || normalizeSearchText(page._searchBlob || ""), page._searchTokens)) {
      return 0;
    }
    var title = page._searchTitle || normalizeSearchText(page.title);
    var description = page._searchDescription || normalizeSearchText(page.description);
    var breadcrumb = page._searchBreadcrumb || normalizeSearchText(page.breadcrumb);
    var body = page._searchText || normalizeSearchText(page.text);
    var score = 1;
    if (title === normalizedQuery) {
      score += 100;
    } else if (title.indexOf(normalizedQuery) !== -1) {
      score += 70;
    }
    if (description.indexOf(normalizedQuery) !== -1) {
      score += 28;
    }
    if (breadcrumb.indexOf(normalizedQuery) !== -1) {
      score += 18;
    }
    if (body.indexOf(normalizedQuery) !== -1) {
      score += 10;
    }
    Array.prototype.forEach.call(getSearchTokens(normalizedQuery), function (token) {
      if (!token) {
        return;
      }
      if (title.indexOf(token) !== -1) {
        score += 12;
      }
      if (description.indexOf(token) !== -1) {
        score += 5;
      }
      if (breadcrumb.indexOf(token) !== -1) {
        score += 4;
      }
      if (body.indexOf(token) !== -1) {
        score += 1;
      }
    });
    score += Math.max(0, 8 - Math.max(0, Number(page.level || 0)));
    score -= (page._index || 0) / 10000;
    return score;
  }

  function countSearchPageHits(page, query) {
    if (!page) {
      return 0;
    }
    var normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return 0;
    }
    var normalizedBlob = page._searchBlobNormalized || normalizeSearchText(page._searchBlob || "");
    if (!normalizedBlob) {
      return 0;
    }
    var tokens = getSearchTokens(normalizedQuery);
    if (!tokens.length) {
      return 0;
    }
    if (tokens.length > 1 && normalizedBlob.indexOf(normalizedQuery) !== -1) {
      var phraseCount = 0;
      var searchFrom = 0;
      var phraseIndex = normalizedBlob.indexOf(normalizedQuery, searchFrom);
      while (phraseIndex !== -1) {
        phraseCount += 1;
        searchFrom = phraseIndex + normalizedQuery.length;
        phraseIndex = normalizedBlob.indexOf(normalizedQuery, searchFrom);
      }
      return phraseCount;
    }
    var searchTokens = page._searchTokens && page._searchTokens.length
      ? page._searchTokens
      : normalizedBlob.split(/\s+/).filter(Boolean);
    var seenQueryTokens = Object.create(null);
    var total = 0;
    Array.prototype.forEach.call(tokens, function (queryToken) {
      if (!queryToken || seenQueryTokens[queryToken]) {
        return;
      }
      seenQueryTokens[queryToken] = true;
      Array.prototype.forEach.call(searchTokens, function (searchToken) {
        if (searchToken === queryToken) {
          total += 1;
        }
      });
    });
    return total;
  }

  function getSearchHitCountBoost(hitCount) {
    var cappedHitCount = Math.min(10, Math.max(0, Number(hitCount || 0) || 0));
    return cappedHitCount * 2;
  }

  function getSiteSearchExcerpt(page, query) {
    var fallback = page && (page.description || page.text || page.breadcrumb || "") || "";
    var text = collapseSearchText((page && (page.description || page.text)) || "");
    if (!text) {
      return trimSearchText(fallback, 190);
    }
    var tokens = getSearchTokens(query);
    var lower = text.toLowerCase();
    var matchIndex = -1;
    for (var i = 0; i < tokens.length; i += 1) {
      if (tokens[i].length < 2) {
        continue;
      }
      matchIndex = lower.indexOf(tokens[i]);
      if (matchIndex !== -1) {
        break;
      }
    }
    if (matchIndex === -1) {
      return trimSearchText(text, 190);
    }
    var start = Math.max(0, matchIndex - 72);
    var end = Math.min(text.length, matchIndex + 150);
    var snippet = text.slice(start, end).trim();
    if (start > 0) {
      snippet = "... " + snippet;
    }
    if (end < text.length) {
      snippet += " ...";
    }
    return trimSearchText(snippet, 220);
  }

  function getCurrentPageSearchSections() {
    var article = document.querySelector(".article-body");
    if (!article || !document.body || document.body.classList.contains("page-home")) {
      return [];
    }
    var nodes = Array.prototype.slice.call(article.querySelectorAll("h2, h3, h4, p, li, blockquote"));
    var current = null;
    var sections = [];
    var untitledCount = 0;
    var pushCurrent = function () {
      if (!current || !collapseSearchText(current.text)) {
        return;
      }
      current.text = collapseSearchText(current.text);
      current._searchBlob = collapseSearchText([current.sectionNumber, current.sectionTitle, current.text].join(" "));
      sections.push(current);
    };
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.closest && node.closest(".related-reports, .article-branch-nav, .further-reading-section, [data-page-search-exclude]")) {
        return;
      }
      var tagName = String(node.tagName || "").toLowerCase();
      var text = collapseSearchText(node.textContent || "");
      if (!text) {
        return;
      }
      if (/^h[2-4]$/.test(tagName)) {
        pushCurrent();
        var numberMatch = text.match(/^(\d+(?:\.\d+)*)[\).:-]?\s+(.+)$/);
        current = {
          sectionNumber: numberMatch ? numberMatch[1] : "",
          sectionTitle: numberMatch ? numberMatch[2] : text,
          text: "",
          url: node.id ? ("#" + encodeURIComponent(node.id)) : window.location.href,
          _index: sections.length
        };
        return;
      }
      if (!current) {
        untitledCount += 1;
        current = {
          sectionNumber: "",
          sectionTitle: document.title || getUiString("overview", "Overview"),
          text: "",
          url: window.location.href,
          _index: untitledCount
        };
      }
      current.text += " " + text;
    });
    pushCurrent();
    return sections;
  }

  function scoreCurrentPageSection(section, query) {
    if (!section || !matchesSearchQuery(query, section._searchBlob || "")) {
      return 0;
    }
    var normalizedQuery = normalizeSearchText(query);
    var title = normalizeSearchText(section.sectionTitle);
    var bodyText = normalizeSearchText(section.text);
    var score = 1;
    if (title.indexOf(normalizedQuery) !== -1) {
      score += 40;
    }
    if (bodyText.indexOf(normalizedQuery) !== -1) {
      score += 18;
    }
    Array.prototype.forEach.call(getSearchTokens(normalizedQuery), function (token) {
      if (title.indexOf(token) !== -1) {
        score += 8;
      }
      if (bodyText.indexOf(token) !== -1) {
        score += 2;
      }
    });
    score -= (section._index || 0) / 10000;
    return score;
  }

  function rankSearchRecords(source, query, mode) {
    var searchMode = mode === "page" ? "page" : "all";
    return (source || []).map(function (record) {
      var hitCount = searchMode === "page" ? 0 : countSearchPageHits(record, query);
      var score = searchMode === "page" ? scoreCurrentPageSection(record, query) : scoreSiteSearchPage(record, query);
      return {
        page: record,
        score: score > 0 ? score + getSearchHitCountBoost(hitCount) : score,
        hitCount: hitCount
      };
    }).filter(function (record) {
      return record.score > 0;
    }).sort(function (left, right) {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.hitCount !== left.hitCount) {
        return right.hitCount - left.hitCount;
      }
      return String(left.page && left.page.title || "").localeCompare(String(right.page && right.page.title || ""));
    });
  }

  function renderSiteSearchResultRecord(record, query, mode, hitCount) {
    var href = buildUrlWithSearchHighlight(record.url || "#", query);
    var title = mode === "page" ? (record.sectionTitle || getUiString("overview", "Overview")) : record.title;
    var kicker = mode === "page"
      ? [record.sectionNumber ? ("Section " + record.sectionNumber) : "", record.sectionTitle || ""].filter(Boolean).join(" - ")
      : (record.breadcrumb || getUiString("overview", "Overview"));
    var snippetSource = mode === "page"
      ? [record.sectionTitle, record.text].filter(Boolean).join(" ")
      : [record.title, record.description, record.text, record.breadcrumb].filter(Boolean).join(" ");
    var numericHitCount = Math.max(0, Number(hitCount || 0) || 0);
    var hitLabel = numericHitCount === 1 ? "1 hit" : String(numericHitCount) + " hits";
    var hitCountPill = numericHitCount > 0
      ? '<span class="site-search-result-hit-count">' + escapeHtml(hitLabel) + "</span>"
      : "";
    return ""
      + '<a class="site-search-result" href="' + escapeHtml(href) + '">'
      + '<span class="site-search-result-kicker">' + escapeHtml(kicker || getUiString("overview", "Overview")) + "</span>"
      + '<span class="site-search-result-title">' + escapeHtml(title || getUiString("overview", "Overview")) + "</span>"
      + '<span class="site-search-result-meta-row">'
      + '<span class="site-search-result-meta">' + escapeHtml(getSearchMatchKind(record, query)) + "</span>"
      + hitCountPill
      + "</span>"
      + '<span class="site-search-result-excerpt">' + buildHighlightedSnippet(snippetSource, query, 230) + "</span>"
      + "</a>";
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getSearchHighlightPattern(query) {
    var tokens = getSearchTokens(query).filter(function (token) {
      return token && token.length >= 2;
    });
    var seen = Object.create(null);
    tokens = tokens.filter(function (token) {
      if (seen[token]) {
        return false;
      }
      seen[token] = true;
      return true;
    }).sort(function (left, right) {
      return right.length - left.length;
    });
    if (!tokens.length) {
      return null;
    }
    return new RegExp("(" + tokens.map(escapeRegExp).join("|") + ")", "ig");
  }

  function isSearchHighlightTextNode(node, root) {
    if (!node || !node.nodeValue || !root) {
      return false;
    }
    var parent = node.parentElement;
    if (!parent || parent.closest("script, style, noscript, textarea, input, select, option, mark, .site-search-page-highlight")) {
      return false;
    }
    return root.contains(parent);
  }

  function highlightSearchTermOnPage() {
    var query = getSearchHighlightQueryFromUrl();
    if (!query) {
      return;
    }
    var pattern = getSearchHighlightPattern(query);
    if (!pattern) {
      return;
    }
    var root = document.querySelector(".main-content") || document.querySelector(".article-body");
    if (!root || !document.createTreeWalker) {
      return;
    }
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        pattern.lastIndex = 0;
        return isSearchHighlightTextNode(node, root) && pattern.test(node.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [];
    var current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    var firstMark = null;
    Array.prototype.forEach.call(nodes, function (node) {
      pattern.lastIndex = 0;
      var text = node.nodeValue;
      var fragment = document.createDocumentFragment();
      var lastIndex = 0;
      var match = pattern.exec(text);
      while (match) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        var mark = document.createElement("mark");
        mark.className = "site-search-highlight site-search-page-highlight";
        mark.textContent = match[0];
        fragment.appendChild(mark);
        if (!firstMark) {
          firstMark = mark;
        }
        lastIndex = match.index + match[0].length;
        match = pattern.exec(text);
      }
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      if (node.parentNode) {
        node.parentNode.replaceChild(fragment, node);
      }
    });
    if (!firstMark || typeof firstMark.scrollIntoView !== "function") {
      return;
    }
    var scrollToFirstMark = function () {
      try {
        syncAnchorOffset();
        firstMark.scrollIntoView({ block: "center", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      } catch (err) {
        firstMark.scrollIntoView();
      }
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(function () {
        window.setTimeout(scrollToFirstMark, 80);
      });
    } else {
      window.setTimeout(scrollToFirstMark, 80);
    }
  }

  function initSiteSearch() {
    var triggers = document.querySelectorAll("[data-site-search-open]");
    var body = document.body;
    if (!triggers.length || !body) {
      return;
    }

    var overlay = null;
    var input = null;
    var status = null;
    var results = null;
    var tabs = null;
    var preparedPages = null;
    var preparedPagesIsFallback = false;
    var currentPageSections = null;
    var activeSearchMode = "all";
    var lastActiveElement = null;
    var hasThisPageSearch = !!document.querySelector(".article-body") && !(document.body && document.body.classList.contains("page-home"));
    var focusableSearchSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])'
    ].join(",");

    var refreshModalResultsAfterIndexLoad = function (queryAtRequestTime) {
      loadSiteSearchIndex().then(function () {
        preparedPages = null;
        preparedPagesIsFallback = false;
        if (activeSearchMode !== "page" && (!input || String(input.value || "").trim() === String(queryAtRequestTime || "").trim())) {
          if (scheduledRenderResults) {
            scheduledRenderResults.flush();
          } else {
            renderResults();
          }
        }
      }).catch(function () {
        // Search remains usable with local fallback records if the full index cannot be fetched.
      });
    };

    var setTriggerState = function (expanded) {
      Array.prototype.forEach.call(triggers, function (trigger) {
        trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
      });
    };

    var syncSearchTabs = function () {
      if (!tabs) {
        return;
      }
      Array.prototype.forEach.call(tabs.querySelectorAll("[data-site-search-tab]"), function (tab) {
        var selected = tab.getAttribute("data-site-search-tab") === activeSearchMode;
        tab.classList.toggle("is-active", selected);
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.setAttribute("tabindex", selected ? "0" : "-1");
      });
    };

    var renderResults = function () {
      if (!input || !status || !results) {
        return;
      }
      var query = String(input.value || "").trim();
      if (activeSearchMode !== "page" && (!preparedPages || (preparedPagesIsFallback && isSiteSearchIndexLoaded()))) {
        preparedPages = prepareSiteSearchPages();
        preparedPagesIsFallback = !isSiteSearchIndexLoaded();
      }
      if (activeSearchMode !== "page" && preparedPagesIsFallback) {
        refreshModalResultsAfterIndexLoad(query);
      }
      if (!preparedPages) {
        preparedPages = prepareSiteSearchPages();
        preparedPagesIsFallback = !isSiteSearchIndexLoaded();
      }
      if (!currentPageSections) {
        currentPageSections = getCurrentPageSearchSections();
      }
      syncSearchTabs();
      if (!query) {
        var emptyHint = activeSearchMode === "page"
          ? getUiString("search-this-page-empty-hint", "Type to search this page.")
          : getUiString("search-empty-hint", "Type to search every page on this site.");
        status.textContent = "";
        results.innerHTML = '<p class="site-search-empty">' + escapeHtml(emptyHint) + "</p>";
        return;
      }
      var source = activeSearchMode === "page" ? currentPageSections : preparedPages;
      var ranked = rankSearchRecords(source, query, activeSearchMode);

      if (!ranked.length) {
        var emptyResult = activeSearchMode === "page"
          ? getUiString("no-search-this-page-results", "No sections on this page match this search.")
          : getUiString("no-search-results", "No pages match this search.");
        status.textContent = emptyResult;
        results.innerHTML = '<p class="site-search-empty">' + escapeHtml(emptyResult) + "</p>";
        return;
      }

      status.textContent = formatUiString("search-results-count-template", "{count} results", {
        count: String(ranked.length)
      });
      results.innerHTML = ranked.slice(0, 24).map(function (record) {
        return renderSiteSearchResultRecord(record.page, query, activeSearchMode === "page" ? "page" : "all", record.hitCount);
      }).join("");
    };

    var scheduledRenderResults = createSearchRenderScheduler(renderResults, {
      shouldRenderImmediately: function () {
        return !input || !String(input.value || "").trim();
      },
      onPending: function () {
        if (status && String(input.value || "").trim()) {
          status.textContent = "Searching...";
        }
      }
    });

    var closeSearch = function () {
      if (!overlay || overlay.hidden) {
        return;
      }
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      body.classList.remove("site-search-open");
      setTriggerState(false);
      if (lastActiveElement && typeof lastActiveElement.focus === "function") {
        try {
          lastActiveElement.focus();
        } catch (err) {
          // Ignore focus restoration failures.
        }
      }
      lastActiveElement = null;
    };

    var getSearchDialogFocusable = function () {
      if (!overlay || overlay.hidden) {
        return [];
      }
      return Array.prototype.filter.call(overlay.querySelectorAll(focusableSearchSelector), function (node) {
        if (!node || typeof node.focus !== "function") {
          return false;
        }
        if (node.disabled || node.getAttribute("aria-hidden") === "true") {
          return false;
        }
        var style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        if (style && (style.display === "none" || style.visibility === "hidden")) {
          return false;
        }
        return !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
      });
    };

    var handleSearchDialogKeydown = function (event) {
      if (!overlay || overlay.hidden) {
        return;
      }
      var key = String(event.key || "");
      if (key === "Escape" || key === "Esc") {
        event.preventDefault();
        closeSearch();
        return;
      }
      if (key !== "Tab") {
        return;
      }
      var focusable = getSearchDialogFocusable();
      if (!focusable.length) {
        event.preventDefault();
        if (input && typeof input.focus === "function") {
          input.focus();
        }
        return;
      }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      var active = document.activeElement;
      if (event.shiftKey && (!active || active === first || !overlay.contains(active))) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && (!active || active === last || !overlay.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    var ensureDialog = function () {
      if (overlay) {
        return;
      }
      overlay = document.createElement("div");
      overlay.className = "site-search-overlay";
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = ""
        + '<div class="site-search-backdrop" data-site-search-close></div>'
        + '<section class="site-search-dialog" role="dialog" aria-modal="true" aria-labelledby="site-search-title">'
        + '<div class="site-search-head">'
        + '<h2 class="site-search-title" id="site-search-title">' + escapeHtml(getUiString("search", "Search")) + "</h2>"
        + '<button class="site-search-close" type="button" data-site-search-close aria-label="' + escapeHtml(getUiString("close-search", "Close search")) + '">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>'
        + "</button>"
        + "</div>"
        + '<div class="site-search-tabs" role="tablist" aria-label="' + escapeHtml(getUiString("search", "Search")) + '" data-site-search-tabs>'
        + '<button class="site-search-tab is-active" type="button" role="tab" aria-selected="true" data-site-search-tab="all">' + escapeHtml(getUiString("search-all-pages", "Search all pages")) + "</button>"
        + (hasThisPageSearch ? '<button class="site-search-tab" type="button" role="tab" aria-selected="false" tabindex="-1" data-site-search-tab="page">' + escapeHtml(getUiString("search-this-page", "Search this page")) + "</button>" : "")
        + "</div>"
        + '<form class="site-search-form" role="search" data-site-search-form>'
        + '<label class="visually-hidden" for="site-search-input">' + escapeHtml(getUiString("search-all-pages", "Search all pages")) + "</label>"
        + '<input id="site-search-input" class="site-search-field" type="search" autocomplete="off" spellcheck="false" data-site-search-input placeholder="' + escapeHtml(getUiString("search-site-placeholder", "Search title, summary, or page text...")) + '">'
        + '<p class="site-search-status" data-site-search-status aria-live="polite"></p>'
        + "</form>"
        + '<div class="site-search-results" data-site-search-results></div>'
        + "</section>";
      document.body.appendChild(overlay);

      input = overlay.querySelector("[data-site-search-input]");
      status = overlay.querySelector("[data-site-search-status]");
      results = overlay.querySelector("[data-site-search-results]");
      tabs = overlay.querySelector("[data-site-search-tabs]");

      Array.prototype.forEach.call(overlay.querySelectorAll("[data-site-search-close]"), function (button) {
        button.addEventListener("click", closeSearch);
      });
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          closeSearch();
        }
      });
      overlay.addEventListener("keydown", handleSearchDialogKeydown);
      document.addEventListener("keydown", handleSearchDialogKeydown, true);
      var form = overlay.querySelector("[data-site-search-form]");
      if (form) {
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          scheduledRenderResults.cancel();
          if (navigateToSearchResultsPage(input ? input.value : "")) {
            closeSearch();
          }
        });
      }
      if (input) {
        input.addEventListener("input", function () {
          scheduledRenderResults.schedule();
        });
        input.addEventListener("keydown", function (event) {
          if (String(event.key || "") === "Escape") {
            event.preventDefault();
            scheduledRenderResults.cancel();
            closeSearch();
          }
        });
      }
      if (tabs) {
        tabs.addEventListener("click", function (event) {
          var tab = event.target && event.target.closest ? event.target.closest("[data-site-search-tab]") : null;
          if (!tab) {
            return;
          }
          activeSearchMode = tab.getAttribute("data-site-search-tab") === "page" ? "page" : "all";
          if (activeSearchMode !== "page" && !isSiteSearchIndexLoaded()) {
            refreshModalResultsAfterIndexLoad(input ? input.value : "");
          }
          scheduledRenderResults.flush();
          if (input && typeof input.focus === "function") {
            input.focus();
          }
        });
      }
      if (results) {
        results.addEventListener("click", function (event) {
          var resultLink = event.target && event.target.closest ? event.target.closest(".site-search-result") : null;
          if (resultLink) {
            closeSearch();
          }
        });
      }
    };

    var openSearch = function (event) {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      ensureDialog();
      preparedPages = prepareSiteSearchPages();
      preparedPagesIsFallback = !isSiteSearchIndexLoaded();
      if (!isSiteSearchIndexLoaded()) {
        refreshModalResultsAfterIndexLoad(input ? input.value : "");
      }
      lastActiveElement = document.activeElement;
      Array.prototype.forEach.call(document.querySelectorAll(".topics-menu"), function (menu) {
        if (menu && menu.open) {
          menu.open = false;
        }
      });
      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");
      body.classList.add("site-search-open");
      setTriggerState(true);
      scheduledRenderResults.flush();
      window.setTimeout(function () {
        if (input && typeof input.focus === "function") {
          input.focus();
          if (typeof input.select === "function") {
            input.select();
          }
        }
      }, 40);
    };

    Array.prototype.forEach.call(triggers, function (trigger) {
      trigger.addEventListener("click", openSearch);
    });

    document.addEventListener("keydown", function (event) {
      var key = String(event.key || "").toLowerCase();
      if (key === "escape") {
        closeSearch();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "k") {
        var active = document.activeElement;
        var tagName = String((active && active.tagName) || "").toLowerCase();
        if (tagName === "input" || tagName === "textarea" || (active && active.isContentEditable)) {
          return;
        }
        openSearch(event);
      }
    });
  }

  function initSearchResultsPage() {
    var root = document.querySelector("[data-search-page]");
    if (!root) {
      return;
    }
    var input = root.querySelector("[data-search-page-input]");
    var status = root.querySelector("[data-search-page-status]");
    var results = root.querySelector("[data-search-page-results]");
    var form = root.querySelector("[data-search-page-form]");
    var backToTopButton = root.querySelector("[data-search-page-back-to-top]");
    if (!input || !status || !results) {
      return;
    }
    var preparedPages = prepareSiteSearchPages();
    var preparedPagesIsFallback = !isSiteSearchIndexLoaded();
    var latestSearchPageQuery = "";
    var latestSearchPageRanked = [];
    var visibleSearchPageResultLimit = searchPageResultRenderLimit;

    var setUrlQuery = function (query) {
      if (!window.history || typeof window.history.replaceState !== "function") {
        return;
      }
      var nextUrl = getSearchResultsPageUrl(query);
      try {
        window.history.replaceState({}, "", nextUrl);
      } catch (err) {
        // Ignore history update failures.
      }
    };

    var renderSearchPageResultBatch = function (ranked, query) {
      var visibleLimit = Math.min(visibleSearchPageResultLimit, ranked.length);
      status.setAttribute("data-state", "active");
      status.textContent = ranked.length > visibleLimit
        ? "Showing first " + String(visibleLimit) + " of " + String(ranked.length) + "."
        : "Showing " + String(ranked.length) + " of " + String(ranked.length) + ".";
      results.innerHTML = ranked.slice(0, visibleLimit).map(function (record) {
        return renderSiteSearchResultRecord(record.page, query, "all", record.hitCount);
      }).join("") + (ranked.length > visibleLimit
        ? '<button class="site-search-more-button" type="button" data-search-page-show-more>Show more</button>'
        : "");
      if (backToTopButton) {
        backToTopButton.hidden = ranked.length <= searchPageBackToTopThreshold;
      }
    };

    var renderSearchPageResults = function (options) {
      var settings = options || {};
      var query = String(input.value || "").trim();
      if (settings.syncUrl) {
        setUrlQuery(query);
      }
      if (!query) {
        status.setAttribute("data-state", "default");
        status.textContent = getUiString("search-empty-hint", "Type to search every page on this site.");
        results.innerHTML = "";
        if (backToTopButton) {
          backToTopButton.hidden = true;
        }
        latestSearchPageQuery = "";
        latestSearchPageRanked = [];
        visibleSearchPageResultLimit = searchPageResultRenderLimit;
        return;
      }

      if (query !== latestSearchPageQuery) {
        visibleSearchPageResultLimit = searchPageResultRenderLimit;
      }
      var ranked = rankSearchRecords(preparedPages, query, "all");
      latestSearchPageQuery = query;
      latestSearchPageRanked = ranked;

      if (!ranked.length) {
        var emptyResult = getUiString("no-search-results", "No pages match this search.");
        status.setAttribute("data-state", "empty");
        status.textContent = emptyResult;
        results.innerHTML = '<p class="site-search-empty">' + escapeHtml(emptyResult) + "</p>";
        if (backToTopButton) {
          backToTopButton.hidden = true;
        }
        visibleSearchPageResultLimit = searchPageResultRenderLimit;
        return;
      }

      renderSearchPageResultBatch(ranked, query);
    };

    var scheduledSearchPageResults = createSearchRenderScheduler(renderSearchPageResults, {
      shouldRenderImmediately: function () {
        return !String(input.value || "").trim();
      },
      onPending: function (options) {
        var query = String(input.value || "").trim();
        if (options && options.syncUrl) {
          setUrlQuery(query);
        }
        if (query) {
          status.setAttribute("data-state", "active");
          status.textContent = "Searching...";
        }
      },
      getDelayedOptions: function () {
        return { syncUrl: false };
      }
    });

    try {
      var params = new URLSearchParams(window.location.search || "");
      input.value = String(params.get("q") || params.get("query") || "").trim();
    } catch (err) {
      input.value = "";
    }

    var loadFullSearchPageIndex = function () {
      if (!preparedPagesIsFallback) {
        return;
      }
      loadSiteSearchIndex().then(function () {
        preparedPages = prepareSiteSearchPages();
        preparedPagesIsFallback = false;
        scheduledSearchPageResults.schedule({ syncUrl: false });
      }).catch(function () {
        renderSearchPageResults({ syncUrl: false });
        status.setAttribute("data-state", "empty");
        status.textContent = String(status.textContent || "") + " Full search index could not be loaded; showing local results.";
      });
    };

    input.addEventListener("input", function () {
      scheduledSearchPageResults.schedule({ syncUrl: true });
    });
    results.addEventListener("click", function (event) {
      var button = event.target && event.target.closest ? event.target.closest("[data-search-page-show-more]") : null;
      if (!button || !results.contains(button) || !latestSearchPageRanked.length) {
        return;
      }
      visibleSearchPageResultLimit = Math.min(
        latestSearchPageRanked.length,
        visibleSearchPageResultLimit + searchPageResultRenderLimit
      );
      renderSearchPageResultBatch(latestSearchPageRanked, latestSearchPageQuery);
    });
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        scheduledSearchPageResults.flush({ syncUrl: true });
      });
    }
    if (String(input.value || "").trim() && preparedPagesIsFallback) {
      status.setAttribute("data-state", "active");
      status.textContent = "Loading search index...";
      results.innerHTML = '<p class="site-search-empty">Loading search index...</p>';
    } else {
      renderSearchPageResults({ syncUrl: false });
    }
    loadFullSearchPageIndex();
  }

  function initHeaderTopicsMenu() {
    var menus = document.querySelectorAll(".topics-menu");
    var body = document.body;
    if (!menus.length || !body) {
      return;
    }

    var mediaQuery = window.matchMedia ? window.matchMedia("(max-width: 980px)") : null;
    var isMobile = function () {
      return !!(mediaQuery && mediaQuery.matches);
    };

    var closeMenu = function (menu) {
      if (menu && menu.open) {
        menu.open = false;
      }
    };

    var syncBodyState = function () {
      var hasOpenMenu = Array.prototype.some.call(menus, function (menu) {
        return !!(menu && menu.open && isMobile());
      });
      body.classList.toggle("topics-menu-open", hasOpenMenu);
    };

    Array.prototype.forEach.call(menus, function (menu) {
      menu.addEventListener("toggle", function () {
        if (menu.open) {
          Array.prototype.forEach.call(menus, function (otherMenu) {
            if (otherMenu !== menu) {
              closeMenu(otherMenu);
            }
          });
        }
        syncBodyState();
      });

      var interactiveItems = menu.querySelectorAll(".topics-menu-panel a, .topics-menu-panel button");
      Array.prototype.forEach.call(interactiveItems, function (item) {
        item.addEventListener("click", function () {
          if (item.tagName && item.tagName.toLowerCase() === "button") {
            return;
          }
          closeMenu(menu);
          syncBodyState();
        });
      });
    });

    document.addEventListener("click", function (event) {
      var target = event && event.target;
      if (!target) {
        return;
      }
      var clickedInsideMenu = Array.prototype.some.call(menus, function (menu) {
        return !!(menu && typeof menu.contains === "function" && menu.contains(target));
      });
      if (!clickedInsideMenu) {
        Array.prototype.forEach.call(menus, closeMenu);
        syncBodyState();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (String(event && event.key || "") !== "Escape") {
        return;
      }
      var hadOpenMenu = false;
      Array.prototype.forEach.call(menus, function (menu) {
        if (menu && menu.open) {
          hadOpenMenu = true;
          closeMenu(menu);
        }
      });
      syncBodyState();
      if (hadOpenMenu) {
        var summary = document.querySelector(".topics-menu > summary");
        if (summary && typeof summary.focus === "function") {
          summary.focus();
        }
      }
    });

    if (mediaQuery) {
      var handleViewportChange = function () {
        if (!isMobile()) {
          body.classList.remove("topics-menu-open");
        } else {
          syncBodyState();
        }
      };
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleViewportChange);
      } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(handleViewportChange);
      }
    }

    syncBodyState();
  }

  function initMobilePageTools() {
    var panel = document.querySelector("[data-mobile-page-tools]");
    var toc = document.querySelector("[data-mobile-page-toc]");
    var toggleButtons = document.querySelectorAll("[data-mobile-page-tools-toggle]");
    var closeButtons = document.querySelectorAll("[data-mobile-page-tools-close]");
    if (!panel || !toc) {
      return;
    }

    var mediaQuery = window.matchMedia ? window.matchMedia(getArticleDrawerMediaQuery()) : null;
    var activeToggleButton = null;

    var syncState = function () {
      var hasToc = Boolean(toc.children.length);
      var isMobile = !mediaQuery || mediaQuery.matches;
      var isAvailable = hasToc && isMobile;
      panel.hidden = !isAvailable;
      if (!isAvailable) {
        panel.open = false;
      }
      Array.prototype.forEach.call(toggleButtons, function (button) {
        button.hidden = !isAvailable;
        button.setAttribute("aria-expanded", isAvailable && panel.open ? "true" : "false");
      });
    };

    Array.prototype.forEach.call(toggleButtons, function (button) {
      button.addEventListener("click", function () {
        syncState();
        if (panel.hidden) {
          return;
        }
        activeToggleButton = button;
        panel.open = !panel.open;
        button.setAttribute("aria-expanded", panel.open ? "true" : "false");
        if (panel.open && typeof panel.scrollIntoView === "function") {
          panel.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
        }
      });
    });

    Array.prototype.forEach.call(closeButtons, function (button) {
      button.addEventListener("click", function () {
        panel.open = false;
        Array.prototype.forEach.call(toggleButtons, function (toggleButton) {
          toggleButton.setAttribute("aria-expanded", "false");
        });
        if (activeToggleButton && typeof activeToggleButton.focus === "function") {
          activeToggleButton.focus();
        }
      });
    });

    panel.addEventListener("keydown", function (event) {
      if (String(event.key || "") !== "Escape" || !panel.open) {
        return;
      }
      event.preventDefault();
      panel.open = false;
      if (activeToggleButton && typeof activeToggleButton.focus === "function") {
        activeToggleButton.focus();
      }
    });

    panel.addEventListener("toggle", function () {
      Array.prototype.forEach.call(toggleButtons, function (button) {
        button.setAttribute("aria-expanded", panel.open ? "true" : "false");
      });
    });

    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", syncState);
      } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(syncState);
      }
    }

    document.addEventListener("phoenix-page-toc-built", syncState);
    syncState();
  }

  function initSidebarDocking() {
    var body = document.body;
    var root = document.documentElement;
    if (!body || !root) {
      return;
    }

    var sidePresent = {
      left: Boolean(document.querySelector("[data-page-tools]")),
      right: Boolean(document.querySelector("[data-mobile-sidebar-panel]"))
    };
    if (!sidePresent.left && !sidePresent.right) {
      return;
    }

    var sides = ["left", "right"];
    var classBySide = {
      left: "left-sidebar-collapsed",
      right: "right-sidebar-collapsed"
    };
    var storageBySide = {
      left: "phoenix-sidebar-left-collapsed",
      right: "phoenix-sidebar-right-collapsed"
    };
    var toastTimers = {
      left: null,
      right: null
    };
    var toastMs = parseInt(root.getAttribute("data-appearance-toast-ms"), 10);
    if (!Number.isFinite(toastMs) || toastMs < 1000) {
      toastMs = 5000;
    }

    function readStorage(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (err) {
        return null;
      }
    }

    function writeStorage(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (err) {
        // Ignore storage write failures.
      }
    }

    function hasStoredCollapsed(side) {
      return String(readStorage(storageBySide[side]) || "").trim() !== "";
    }

    function getDock(side) {
      return document.querySelector('[data-sidebar-dock="' + side + '"]');
    }

    function getDockToggle(side) {
      return document.querySelector('[data-sidebar-dock-toggle="' + side + '"]');
    }

    function getDockMenu(side) {
      return document.querySelector('[data-sidebar-dock-menu="' + side + '"]');
    }

    function getDockToast(side) {
      return document.querySelector('[data-sidebar-dock-toast="' + side + '"]');
    }

    function closeDockMenu(side) {
      var menu = getDockMenu(side);
      var toggle = getDockToggle(side);
      if (menu) {
        menu.hidden = true;
      }
      if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
      }
    }

    function hideDockToast(side) {
      var toast = getDockToast(side);
      if (toast) {
        toast.hidden = true;
      }
      if (toastTimers[side]) {
        window.clearTimeout(toastTimers[side]);
        toastTimers[side] = null;
      }
    }

    function showDockToast(side) {
      var toast = getDockToast(side);
      if (!toast) {
        return;
      }
      hideDockToast(side);
      toast.hidden = false;
      toastTimers[side] = window.setTimeout(function () {
        toast.hidden = true;
        toastTimers[side] = null;
      }, toastMs);
    }

    function readCollapsed(side) {
      var token = String(readStorage(storageBySide[side]) || "").trim().toLowerCase();
      return token === "1" || token === "true" || token === "yes" || token === "on";
    }

    function getDefaultCollapsed(side) {
      if (!body.classList.contains("page-article")) {
        return false;
      }
      var isDesktop = !(window.matchMedia && window.matchMedia("(max-width: 980px)").matches);
      if (!isDesktop) {
        return false;
      }
      return false;
    }

    function setCollapsed(side, shouldCollapse, options) {
      var opts = options || {};
      var className = classBySide[side];
      if (!className) {
        return;
      }
      var collapsed = Boolean(shouldCollapse && sidePresent[side]);
      body.classList.toggle(className, collapsed);
      var dock = getDock(side);
      if (dock) {
        dock.hidden = !collapsed;
      }
      if (!collapsed) {
        closeDockMenu(side);
        hideDockToast(side);
      } else if (opts.showToast) {
        showDockToast(side);
      }

      if (opts.persist) {
        writeStorage(storageBySide[side], collapsed ? "1" : "0");
      }
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-sidebar-hide]"), function (button) {
      var side = String(button.getAttribute("data-sidebar-hide") || "").trim().toLowerCase();
      if (!classBySide[side] || !sidePresent[side]) {
        button.hidden = true;
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-sidebar-restore]"), function (button) {
      var side = String(button.getAttribute("data-sidebar-restore") || "").trim().toLowerCase();
      if (!classBySide[side] || !sidePresent[side]) {
        button.hidden = true;
      }
    });

    document.addEventListener("click", function (event) {
      var hideButton = event.target && event.target.closest ? event.target.closest("[data-sidebar-hide]") : null;
      if (hideButton) {
        var hideSide = String(hideButton.getAttribute("data-sidebar-hide") || "").trim().toLowerCase();
        if (classBySide[hideSide] && sidePresent[hideSide]) {
          event.preventDefault();
          event.stopPropagation();
          setCollapsed(hideSide, true, { persist: true, showToast: true });
        }
        return;
      }

      var restoreButton = event.target && event.target.closest ? event.target.closest("[data-sidebar-restore]") : null;
      if (restoreButton) {
        var restoreSide = String(restoreButton.getAttribute("data-sidebar-restore") || "").trim().toLowerCase();
        if (classBySide[restoreSide] && sidePresent[restoreSide]) {
          event.preventDefault();
          event.stopPropagation();
          setCollapsed(restoreSide, false, { persist: true });
        }
        return;
      }

      var dockToggleButton = event.target && event.target.closest ? event.target.closest("[data-sidebar-dock-toggle]") : null;
      if (dockToggleButton) {
        var dockSide = String(dockToggleButton.getAttribute("data-sidebar-dock-toggle") || "").trim().toLowerCase();
        if (classBySide[dockSide] && sidePresent[dockSide]) {
          event.preventDefault();
          event.stopPropagation();
          hideDockToast(dockSide);
          closeDockMenu(dockSide);
          setCollapsed(dockSide, false, { persist: true });
        }
        return;
      }
    });

    document.addEventListener("click", function (event) {
      var target = event.target;
      if (target && target.closest && target.closest("[data-sidebar-dock]")) {
        return;
      }
      Array.prototype.forEach.call(sides, function (side) {
        closeDockMenu(side);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (String(event.key || "") !== "Escape") {
        return;
      }
      Array.prototype.forEach.call(sides, function (side) {
        closeDockMenu(side);
      });
    });

    Array.prototype.forEach.call(sides, function (side) {
      var collapsed = hasStoredCollapsed(side) ? readCollapsed(side) : getDefaultCollapsed(side);
      setCollapsed(side, collapsed, { persist: false, showToast: false });
    });
  }

  function slugify(text) {
    var slug = String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\\s-]/g, "")
      .replace(/\\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return slug || "section";
  }

  function initBackToTop() {
    var buttons = document.querySelectorAll("[data-back-to-top], [data-mobile-back-to-top], [data-footer-back-to-top], [data-search-page-back-to-top]");
    if (!buttons.length) {
      return;
    }
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      });
    });
  }

  function initScrollAnimations() {
    if (prefersReducedMotion()) {
      return;
    }
    var animElements = document.querySelectorAll(
      ".topic-card, .home-featured, .home-hero, .home-hierarchy-band, .home-detailed-catalog, .article-hero, .article-branch-map, .article-body > figure, .article-body > .page-media-action-shell-direct, .article-body > .youtube-embed-container, .article-body > .svg-gallery, .site-footer"
    );
    var revealFallback = function() {
      for (var i = 0; i < animElements.length; i++) {
        animElements[i].classList.add("is-visible");
      }
    };
    if (!animElements.length || !("IntersectionObserver" in window)) {
      revealFallback();
      return;
    }
    var revealFailsafeTimer = window.setTimeout(revealFallback, 1400);
    var observer = new IntersectionObserver(function(entries, obs) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
      if (document.querySelectorAll(".animate-on-scroll:not(.is-visible)").length === 0) {
        window.clearTimeout(revealFailsafeTimer);
      }
    }, {
      root: null,
      rootMargin: "0px",
      threshold: 0
    });

    var activeCount = 0;
    Array.prototype.forEach.call(animElements, function(el, index) {
      el.style.setProperty("--reveal-delay", String(Math.min(index * 36, 220)) + "ms");
      var rect = el.getBoundingClientRect();
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      if (rect.top < viewportHeight && rect.bottom > 0) {
        el.classList.add("animate-on-scroll");
        el.classList.add("is-visible");
      } else {
        el.classList.add("animate-on-scroll");
        observer.observe(el);
        activeCount++;
      }
    });
    if (activeCount === 0) {
      window.clearTimeout(revealFailsafeTimer);
    }
  }

  PhoenixUI.normalizePath = normalizePath;
  PhoenixUI.readLocalStorage = readLocalStorage;
  PhoenixUI.writeLocalStorage = writeLocalStorage;
  PhoenixUI.removeLocalStorage = removeLocalStorage;
  PhoenixUI.getUiString = getUiString;
  PhoenixUI.formatUiString = formatUiString;
  PhoenixUI.isSiteSearchIndexLoaded = isSiteSearchIndexLoaded;
  PhoenixUI.loadSiteSearchIndex = loadSiteSearchIndex;
  PhoenixUI.navigateToSearchResultsPage = navigateToSearchResultsPage;
  PhoenixUI.escapeHtml = escapeHtml;
  PhoenixUI.collapseSearchText = collapseSearchText;
  PhoenixUI.buildHighlightedSnippet = buildHighlightedSnippet;
  PhoenixUI.getSearchMatchKind = getSearchMatchKind;
  PhoenixUI.prepareSiteSearchPages = prepareSiteSearchPages;
  PhoenixUI.rankSearchRecords = rankSearchRecords;
  PhoenixUI.createSearchRenderScheduler = createSearchRenderScheduler;
  PhoenixUI.buildUrlWithSearchHighlight = buildUrlWithSearchHighlight;
  PhoenixUI.slugify = slugify;
  PhoenixUI.searchPageResultRenderLimit = searchPageResultRenderLimit;
  PhoenixUI.getAnchorOffsetPixels = getAnchorOffsetPixels;
  PhoenixUI.prefersReducedMotion = prefersReducedMotion;

  function init() {
    initContentPageScrollReset();
    cleanGeneratedTopicLabels();
    initAffiliateClickTracking();
    initReaderEngagementTracking();
    initScrollAnimations();
    initAnchorOffsetSync();
    highlightSearchTermOnPage();
    markActiveSidebarLink();
    if (typeof PhoenixUI.initializers.articleToc === "function") {
      PhoenixUI.initializers.articleToc();
    }
    initMobilePageTools();
    initSidebarCollapsing();
    initSidebarFilter();
    initMobileSidebarMode();
    initMobileQuickNav();
    initSiteSearch();
    initSearchResultsPage();
    initHeaderTopicsMenu();
    initSidebarDocking();
    if (typeof PhoenixUI.initializers.homeResponsiveDisclosures === "function") {
      PhoenixUI.initializers.homeResponsiveDisclosures();
    }
    if (typeof PhoenixUI.initializers.homeModeSwitcher === "function") {
      PhoenixUI.initializers.homeModeSwitcher();
    }
    if (typeof PhoenixUI.initializers.homeVerticalView === "function") {
      PhoenixUI.initializers.homeVerticalView();
    }
    if (typeof PhoenixUI.initializers.map === "function") {
      PhoenixUI.initializers.map();
    }
    if (typeof PhoenixUI.initializers.homeFilter === "function") {
      PhoenixUI.initializers.homeFilter();
    }
    if (typeof PhoenixUI.initializers.homeCardNavigation === "function") {
      PhoenixUI.initializers.homeCardNavigation();
    }
    if (typeof PhoenixUI.initializers.hierarchyGraphs === "function") {
      PhoenixUI.initializers.hierarchyGraphs();
    }
    if (typeof PhoenixUI.initializers.articleEndnotes === "function") {
      PhoenixUI.initializers.articleEndnotes();
    }
    if (typeof PhoenixUI.initializers.articleActions === "function") {
      PhoenixUI.initializers.articleActions();
    }
    initBackToTop();
    if (typeof PhoenixUI.initializers.articleLightbox === "function") {
      PhoenixUI.initializers.articleLightbox();
    }
  }

  // Deferred feature bundles execute after this file while the document is
  // usually already interactive. Wait for DOMContentLoaded so they can
  // register before the single ordered boot sequence runs.
  if (document.readyState !== "complete") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

