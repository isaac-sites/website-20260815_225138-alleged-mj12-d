(function() {
  "use strict";

  var PhoenixUI = window.PhoenixUI = window.PhoenixUI || { initializers: {} };
  PhoenixUI.initializers = PhoenixUI.initializers || {};
  var normalizePath = PhoenixUI.normalizePath;
  var readLocalStorage = PhoenixUI.readLocalStorage;
  var writeLocalStorage = PhoenixUI.writeLocalStorage;
  var removeLocalStorage = PhoenixUI.removeLocalStorage;
  var getUiString = PhoenixUI.getUiString;
  var isSiteSearchIndexLoaded = PhoenixUI.isSiteSearchIndexLoaded;
  var loadSiteSearchIndex = PhoenixUI.loadSiteSearchIndex;
  var navigateToSearchResultsPage = PhoenixUI.navigateToSearchResultsPage;
  var escapeHtml = PhoenixUI.escapeHtml;
  var collapseSearchText = PhoenixUI.collapseSearchText;
  var buildHighlightedSnippet = PhoenixUI.buildHighlightedSnippet;
  var getSearchMatchKind = PhoenixUI.getSearchMatchKind;
  var prepareSiteSearchPages = PhoenixUI.prepareSiteSearchPages;
  var rankSearchRecords = PhoenixUI.rankSearchRecords;
  var createSearchRenderScheduler = PhoenixUI.createSearchRenderScheduler;
  var buildUrlWithSearchHighlight = PhoenixUI.buildUrlWithSearchHighlight;
  var slugify = PhoenixUI.slugify;
  var searchPageResultRenderLimit = PhoenixUI.searchPageResultRenderLimit;

  function initHomeResponsiveDisclosures() {
    var body = document.body;
    if (!body || !body.classList.contains("page-home")) {
      return;
    }

    var disclosures = document.querySelectorAll("[data-home-mobile-disclosure]");
    if (!disclosures.length) {
      return;
    }
    var hasUserInteracted = false;
    var markUserInteraction = function () {
      hasUserInteracted = true;
    };
    document.addEventListener("pointerdown", markUserInteraction, true);
    document.addEventListener("keydown", markUserInteraction, true);

    var requestCatalogMode = function () {
      try {
        document.dispatchEvent(
          new CustomEvent("phoenix-home-mode-request", {
            detail: {
              mode: "catalog",
              automatic: true,
              persist: true,
              syncUrl: true
            }
          })
        );
      } catch (err) {
        // Ignore custom event dispatch failures.
      }
    };

    var getCollapseThreshold = function (node) {
      var parsed = parseInt(String(node && node.getAttribute("data-home-mobile-collapse-threshold") || ""), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 800;
    };

    var shouldCollapseDisclosure = function (node) {
      var threshold = getCollapseThreshold(node);
      return window.innerWidth <= threshold;
    };

    var shouldForceOpenDisclosure = function (node) {
      if (!node) {
        return false;
      }
      var currentHash = String(window.location.hash || "").trim();
      if (currentHash && node.id && currentHash === "#" + node.id) {
        return true;
      }
      var searchInput = node.querySelector("[data-home-filter]");
      return !!(searchInput && String(searchInput.value || "").trim());
    };

    var syncDisclosureState = function (node, force) {
      if (!node) {
        return;
      }
      if (!force && node.__homeMobileDisclosureTouched) {
        return;
      }
      var shouldCollapse = shouldCollapseDisclosure(node);
      var shouldOpen = !shouldCollapse || shouldForceOpenDisclosure(node);
      node.__homeMobileDisclosureSyncing = true;
      if (shouldOpen) {
        node.setAttribute("open", "open");
      } else {
        node.removeAttribute("open");
      }
      node.__homeMobileDisclosureSyncing = false;
      node.__homeMobileDisclosureViewport = shouldCollapse ? "mobile" : "desktop";
    };

    var syncAllDisclosures = function (force) {
      Array.prototype.forEach.call(disclosures, function (node) {
        syncDisclosureState(node, force);
      });
    };

    Array.prototype.forEach.call(disclosures, function (node) {
      if (!node.__homeMobileDisclosureBound) {
        node.__homeMobileDisclosureBound = true;
        node.addEventListener("toggle", function (event) {
          if (node.__homeMobileDisclosureSyncing) {
            return;
          }
          var userInitiated = Boolean(event && event.isTrusted);
          if (userInitiated) {
            node.__homeMobileDisclosureTouched = true;
          }
          var searchInput = node.querySelector("[data-home-filter]");
          if (userInitiated && node.hasAttribute("open") && searchInput) {
            requestCatalogMode();
            window.setTimeout(function () {
              if (typeof searchInput.focus === "function") {
                searchInput.focus();
              }
            }, 0);
          }
        });
        var searchInput = node.querySelector("[data-home-filter]");
        if (searchInput) {
          var openDisclosure = function () {
            node.setAttribute("open", "open");
          };
          var focusCatalogSearch = function () {
            var hasSearchValue = String(searchInput.value || "").trim().length > 0;
            if (!hasSearchValue) {
              return;
            }
            openDisclosure();
            requestCatalogMode();
          };
          searchInput.addEventListener("focus", focusCatalogSearch);
          searchInput.addEventListener("input", focusCatalogSearch);
        }
      }
    });

    var lastMobileState = shouldCollapseDisclosure(disclosures[0]);
    syncAllDisclosures(false);

    var clearInitialHomeFilterFocus = function () {
      var activeElement = document.activeElement;
      var isHomeFilterFocused = Boolean(
        activeElement
        && typeof activeElement.matches === "function"
        && activeElement.matches("[data-home-filter]")
      );
      if (!isHomeFilterFocused) {
        return;
      }
      if (String(activeElement.value || "").trim() || String(window.location.hash || "").trim()) {
        return;
      }
      if (typeof activeElement.blur === "function") {
        activeElement.blur();
      }
      if (window.scrollY > 0 && typeof window.scrollTo === "function") {
        window.scrollTo(0, 0);
      }
    };
    window.setTimeout(clearInitialHomeFilterFocus, 0);
    window.setTimeout(clearInitialHomeFilterFocus, 180);

    window.addEventListener("hashchange", function () {
      Array.prototype.forEach.call(disclosures, function (node) {
        if (shouldForceOpenDisclosure(node)) {
          node.setAttribute("open", "open");
        }
      });
    });

    window.addEventListener("resize", function () {
      var currentMobileState = shouldCollapseDisclosure(disclosures[0]);
      if (currentMobileState === lastMobileState) {
        return;
      }
      lastMobileState = currentMobileState;
      syncAllDisclosures(false);
    });
  }

  function initHomeModeSwitcher() {
    var body = document.body;
    if (!body || !body.classList.contains("page-home")) {
      return;
    }

    var switcher = document.querySelector("[data-home-mode-switcher]");
    var panels = document.querySelectorAll("[data-home-mode-panel]");
    if (!switcher || !panels.length) {
      return;
    }

    var normalizeRawMode = function (value) {
      var token = String(value || "").trim().toLowerCase();
      return (token === "cluster" || token === "vertical" || token === "catalog") ? token : "";
    };

    var normalizePanelMode = function (value) {
      var token = String(value || "").trim().toLowerCase();
      return (token === "cluster" || token === "vertical" || token === "catalog") ? token : "";
    };

    var modeLabels = {
      cluster: "Tree view",
      vertical: "Topic view",
      catalog: "Catalog"
    };
    Array.prototype.forEach.call(panels, function (panel) {
      var panelMode = normalizePanelMode(panel.getAttribute("data-home-mode-panel"));
      var panelLabel = String(panel.getAttribute("data-home-mode-label") || "").trim();
      if (panelMode && panelLabel) {
        modeLabels[panelMode] = panelLabel;
      }
    });

    var configuredMode = normalizeRawMode(switcher.getAttribute("data-home-initial-mode")) || "catalog";
    var selectedMode = normalizePanelMode(switcher.getAttribute("data-home-selected-mode")) || "catalog";
    var buttons = switcher.querySelectorAll("[data-home-mode-btn]");
    var cycleButton = switcher.querySelector("[data-home-mode-cycle]");
    var summaryCurrentNodes = switcher.querySelectorAll("[data-home-mode-summary-current], [data-home-mode-summary-current-visual]");
    var pathParts = normalizePath(window.location.pathname).split("/").filter(Boolean);
    var siteScope = pathParts.length ? pathParts[0] : "root";
    var legacyStorageKeys = [
      "phoenix-home-mode-v2-" + siteScope,
      "phoenix-home-mode-v1-" + siteScope
    ];
    var clusterMinWidth = parseInt(String(switcher.getAttribute("data-home-cluster-min-width") || "980"), 10);
    if (!Number.isFinite(clusterMinWidth) || clusterMinWidth < 320) {
      clusterMinWidth = 980;
    }
    var panelAvailability = {};
    Array.prototype.forEach.call(panels, function (panel) {
      var panelMode = normalizePanelMode(panel.getAttribute("data-home-mode-panel"));
      if (panelMode) {
        panelAvailability[panelMode] = true;
      }
    });
    var rawModeSequence = String(switcher.getAttribute("data-home-mode-sequence") || "")
      .split(/\s+/)
      .map(normalizeRawMode)
      .filter(function (token, index, source) {
        return !!token && source.indexOf(token) === index && !!panelAvailability[token];
      });
    if (!rawModeSequence.length) {
      rawModeSequence = ["catalog"];
      if (panelAvailability.vertical) {
        rawModeSequence.push("vertical");
      }
      if (panelAvailability.cluster) {
        rawModeSequence.push("cluster");
      }
    }
    var homeModeUserInteracted = false;
    var markHomeModeInteraction = function () {
      homeModeUserInteracted = true;
    };
    document.addEventListener("pointerdown", markHomeModeInteraction, true);
    document.addEventListener("keydown", markHomeModeInteraction, true);

    function isClusterModeAvailable() {
      return !!panelAvailability.cluster && window.innerWidth >= clusterMinWidth;
    }

    function isCompactHomeModeViewport() {
      return window.innerWidth < clusterMinWidth;
    }

    function isCatalogOnlyHomeModeViewport() {
      return isCompactHomeModeViewport();
    }

    function isVerticalOnlyHomeModeViewport() {
      return !isCatalogOnlyHomeModeViewport();
    }

    function getViewportDefaultHomeMode() {
      if (isCatalogOnlyHomeModeViewport()) {
        if (panelAvailability.catalog) {
          return "catalog";
        }
        if (panelAvailability.vertical) {
          return "vertical";
        }
        return "catalog";
      }
      if (panelAvailability.vertical) {
        return "vertical";
      }
      if (panelAvailability.catalog) {
        return "catalog";
      }
      return "catalog";
    }

    function isModeAvailable(mode) {
      if (isCatalogOnlyHomeModeViewport()) {
        return mode === "catalog" ? !!panelAvailability.catalog : false;
      }
      if (isVerticalOnlyHomeModeViewport()) {
        return mode === "vertical" ? !!panelAvailability.vertical : false;
      }
      return mode === "catalog" ? !!panelAvailability.catalog : false;
    }

    var resolveEffectiveMode = function (rawMode) {
      var normalized = normalizeRawMode(rawMode);
      if (normalized === "catalog" && isModeAvailable("catalog")) {
        return "catalog";
      }
      if (normalized === "vertical" && isModeAvailable("vertical")) {
        return "vertical";
      }
      if (normalized === "cluster" && isModeAvailable("cluster")) {
        return "cluster";
      }
      return getViewportDefaultHomeMode();
    };

    var updateTopicJumpLinks = function (effectiveMode) {
      if (!effectiveMode) {
        return;
      }
      var jumpLinks = document.querySelectorAll("[data-home-topic-anchor]");
      Array.prototype.forEach.call(jumpLinks, function (link) {
        var anchorToken = String(link.getAttribute("data-home-topic-anchor") || "").trim();
        var clusterBase = String(link.getAttribute("data-home-cluster-base") || "").trim();
        if (effectiveMode === "cluster" && clusterBase) {
          link.setAttribute("href", "#home-cluster-map");
          link.setAttribute("data-home-cluster-jump", clusterBase);
          return;
        }
        if (link.hasAttribute("data-home-cluster-jump")) {
          link.removeAttribute("data-home-cluster-jump");
        }
        if (!anchorToken) {
          return;
        }
        link.setAttribute("href", "#topic-" + effectiveMode + "-" + anchorToken);
      });
    };

    var persistModeInUrl = function (rawMode) {
      if (!window.history || typeof window.history.replaceState !== "function") {
        return;
      }
      var hasUrlApi = typeof URL !== "undefined";
      if (!hasUrlApi) {
        return;
      }
      try {
        var url = new URL(window.location.href);
        var normalizedRaw = resolveEffectiveMode(rawMode);
        var viewportDefaultMode = getViewportDefaultHomeMode();
        if (!isModeAvailable(normalizedRaw) || !normalizedRaw || normalizedRaw === viewportDefaultMode) {
          url.searchParams.delete("home_mode");
        } else {
          url.searchParams.set("home_mode", normalizedRaw);
        }
        window.history.replaceState(null, "", url.toString());
      } catch (err) {
        // Ignore URL write failures.
      }
    };

    var updateSummaryCurrent = function (effectiveMode) {
      Array.prototype.forEach.call(summaryCurrentNodes, function (node) {
        node.textContent = modeLabels[effectiveMode] || "Catalog";
      });
    };

    var syncModeControls = function (effectiveMode) {
      var availableModes = rawModeSequence.filter(function (token) {
        return isModeAvailable(token);
      });
      var visibleCount = 0;
      Array.prototype.forEach.call(buttons, function (button) {
        var buttonMode = normalizeRawMode(button.getAttribute("data-home-mode-btn"));
        var isAvailable = isModeAvailable(buttonMode);
        button.hidden = !isAvailable;
        button.disabled = !isAvailable;
        if (isAvailable) {
          visibleCount += 1;
        }
        var isActiveButton = isAvailable && buttonMode === effectiveMode;
        button.classList.toggle("is-active", isActiveButton);
        button.setAttribute("aria-pressed", isActiveButton ? "true" : "false");
      });
      if (cycleButton) {
        var currentIndex = availableModes.indexOf(effectiveMode);
        if (currentIndex < 0) {
          currentIndex = 0;
        }
        var nextMode = availableModes[(currentIndex + 1) % Math.max(availableModes.length, 1)] || effectiveMode;
        var nextLabel = modeLabels[nextMode] || "Catalog";
        var currentLabel = modeLabels[effectiveMode] || "Catalog";
        var title = "Current view: " + currentLabel + ". Click to switch to " + nextLabel + ".";
        cycleButton.hidden = availableModes.length <= 1;
        cycleButton.disabled = availableModes.length <= 1;
        cycleButton.setAttribute("title", title);
        cycleButton.setAttribute("aria-label", title);
        cycleButton.setAttribute("data-home-next-mode", nextMode);
      }
      switcher.hidden = availableModes.length <= 1;
    };

    var activateMode = function (rawMode, options) {
      var normalizedRaw = normalizeRawMode(rawMode) || configuredMode || "catalog";
      var effectiveMode = resolveEffectiveMode(normalizedRaw);
      if (!effectiveMode) {
        effectiveMode = selectedMode;
      }
      normalizedRaw = effectiveMode;

      Array.prototype.forEach.call(panels, function (panel) {
        var panelMode = normalizePanelMode(panel.getAttribute("data-home-mode-panel"));
        var isActive = panelMode === effectiveMode;
        panel.hidden = !isActive;
        panel.classList.toggle("is-active", isActive);
        panel.setAttribute("aria-hidden", isActive ? "false" : "true");
      });

      switcher.setAttribute("data-home-mode-raw", normalizedRaw);
      switcher.setAttribute("data-home-mode-effective", effectiveMode);
      updateTopicJumpLinks(effectiveMode);
      updateSummaryCurrent(effectiveMode);
      syncModeControls(effectiveMode);

      var shouldSyncUrl = !options || options.syncUrl !== false;
      if (shouldSyncUrl) {
        persistModeInUrl(normalizedRaw);
      }

      try {
        document.dispatchEvent(
          new CustomEvent("phoenix-home-mode-changed", {
            detail: {
              rawMode: normalizedRaw,
              effectiveMode: effectiveMode,
              clusterAvailable: isClusterModeAvailable(),
              verticalAvailable: isModeAvailable("vertical")
            }
          })
        );
      } catch (err) {
        // Ignore custom event dispatch failures.
      }
    };

    var queryMode = "";
    try {
      var params = new URLSearchParams(window.location.search || "");
      queryMode = normalizeRawMode(params.get("home_mode"));
    } catch (err) {
      queryMode = "";
    }
    legacyStorageKeys.forEach(function (key) {
      removeLocalStorage(key);
    });
    var startMode = queryMode || configuredMode || "catalog";

    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function () {
        markHomeModeInteraction();
        var nextMode = normalizeRawMode(button.getAttribute("data-home-mode-btn")) || "catalog";
        activateMode(nextMode, { persist: true, syncUrl: true });
      });
    });
    if (cycleButton) {
      cycleButton.addEventListener("click", function () {
        markHomeModeInteraction();
        var nextMode = normalizeRawMode(cycleButton.getAttribute("data-home-next-mode")) || "catalog";
        activateMode(nextMode, { persist: true, syncUrl: true });
      });
    }

    document.addEventListener("phoenix-home-mode-request", function (event) {
      var detail = event && event.detail ? event.detail : {};
      var requestedMode = normalizeRawMode(detail.mode);
      if (!requestedMode) {
        return;
      }
      if (
        detail.automatic === true
        && requestedMode === "catalog"
        && configuredMode === "vertical"
        && isModeAvailable("vertical")
        && !queryMode
        && !homeModeUserInteracted
      ) {
        return;
      }
      activateMode(requestedMode, {
        persist: detail.persist !== false,
        syncUrl: detail.syncUrl !== false
      });
    });

    var lastClusterAvailability = isClusterModeAvailable();
    var lastCompactHomeModeViewport = isCompactHomeModeViewport();
    window.addEventListener("resize", function () {
      var nextClusterAvailability = isClusterModeAvailable();
      var nextCompactHomeModeViewport = isCompactHomeModeViewport();
      if (
        nextClusterAvailability === lastClusterAvailability
        && nextCompactHomeModeViewport === lastCompactHomeModeViewport
      ) {
        return;
      }
      lastClusterAvailability = nextClusterAvailability;
      lastCompactHomeModeViewport = nextCompactHomeModeViewport;
      var currentRawMode = normalizeRawMode(switcher.getAttribute("data-home-mode-raw")) || startMode;
      activateMode(currentRawMode, { persist: true, syncUrl: true });
    });

    activateMode(startMode, { persist: true, syncUrl: true });
  }

  function initHomeVerticalView() {
    var containers = document.querySelectorAll("[data-home-vertical-map]");
    if (!containers.length) {
      return;
    }

    var pathParts = normalizePath(window.location.pathname).split("/").filter(Boolean);
    var siteScope = pathParts.length ? pathParts[0] : "root";

    Array.prototype.forEach.call(containers, function (container, containerIndex) {
      var tree = container.querySelector("[data-home-vertical-tree]");
      var dataNode = container.querySelector("[data-home-vertical-data]");
      if (!tree || !dataNode) {
        return;
      }

      var payload = {};
      try {
        payload = JSON.parse(String(dataNode.textContent || "{}"));
      } catch (err) {
        payload = {};
      }
      var nodes = Array.isArray(payload.nodes) ? payload.nodes.slice() : [];
      if (!nodes.length) {
        tree.hidden = true;
        return;
      }

      var nodeById = {};
      var childrenByParent = {};
      nodes.forEach(function (node) {
        if (!node || !node.id) {
          return;
        }
        nodeById[node.id] = node;
        var parentId = String(node.parent_id || "").trim();
        if (!childrenByParent[parentId]) {
          childrenByParent[parentId] = [];
        }
        childrenByParent[parentId].push(node);
      });

      function sortNodes(nodeList) {
        return nodeList.sort(function (a, b) {
          var slotA = parseInt(String((a && a.slot_index) || ""), 10);
          var slotB = parseInt(String((b && b.slot_index) || ""), 10);
          var hasSlotA = Number.isFinite(slotA);
          var hasSlotB = Number.isFinite(slotB);
          if (hasSlotA && hasSlotB && slotA !== slotB) {
            return slotA - slotB;
          }
          if (hasSlotA && !hasSlotB) {
            return -1;
          }
          if (!hasSlotA && hasSlotB) {
            return 1;
          }
          var labelA = String((a && (a.full_label || a.label)) || "").toLowerCase();
          var labelB = String((b && (b.full_label || b.label)) || "").toLowerCase();
          return labelA.localeCompare(labelB);
        });
      }

      Object.keys(childrenByParent).forEach(function (parentId) {
        sortNodes(childrenByParent[parentId]);
      });

      var topNodes = sortNodes(
        nodes.filter(function (node) {
          return String((node && node.semantic_level) || "").trim().toLowerCase() === "root";
        })
      );
      if (!topNodes.length) {
        topNodes = sortNodes(
          nodes.filter(function (node) {
            return String((node && node.semantic_level) || "").trim().toLowerCase() === "l1";
          })
        );
      }
      if (!topNodes.length) {
        topNodes = sortNodes(
          nodes.filter(function (node) {
            return !String((node && node.parent_id) || "").trim();
          })
        );
      }
      if (!topNodes.length) {
        tree.hidden = true;
        return;
      }

      var primaryTopNode = topNodes.length === 1 ? topNodes[0] : null;
      var primaryTopSemantic = String((primaryTopNode && primaryTopNode.semantic_level) || "").trim().toLowerCase();
      var l1Nodes = [];
      if (primaryTopNode && primaryTopSemantic === "root") {
        l1Nodes = getChildren(primaryTopNode).filter(function (node) {
          return !!node;
        });
      } else {
        l1Nodes = topNodes.filter(function (node) {
          return !!node;
        });
      }
      var singleL1Node = l1Nodes.length === 1 ? l1Nodes[0] : null;
      container.setAttribute("data-home-vertical-l1-count", String(l1Nodes.length));
      container.setAttribute("data-home-vertical-top-count", String(topNodes.length));
      if (singleL1Node && singleL1Node.id) {
        container.setAttribute("data-home-vertical-single-l1-id", String(singleL1Node.id));
      } else {
        container.removeAttribute("data-home-vertical-single-l1-id");
      }

      var storageKey = "phoenix-home-vertical-expanded-v1-" + siteScope + "-" + String(containerIndex);
      var state = container.__homeVerticalState || { expanded: {} };
      if (!state || typeof state !== "object") {
        state = { expanded: {} };
      }
      if (!state.expanded || typeof state.expanded !== "object") {
        state.expanded = {};
      }
      var shouldApplyDefaultExpansion = !container.__homeVerticalStateInitialized;
      var hasStoredState = false;
      if (!container.__homeVerticalStateInitialized) {
        try {
          var rawStored = String(readLocalStorage(storageKey) || "").trim();
          if (rawStored) {
            var parsedStored = JSON.parse(rawStored);
            if (parsedStored && typeof parsedStored === "object") {
              state.expanded = parsedStored;
              hasStoredState = true;
            }
          }
        } catch (err) {
          state.expanded = {};
        }
        container.__homeVerticalStateInitialized = true;
      }
      container.__homeVerticalState = state;

      function persistState() {
        try {
          writeLocalStorage(storageKey, JSON.stringify(state.expanded));
        } catch (err) {
          // Ignore serialization/storage failures.
        }
      }

      function scheduleVerticalRender() {
        if (container.__homeVerticalRenderTimer) {
          window.clearTimeout(container.__homeVerticalRenderTimer);
        }
        if (container.__homeVerticalRenderFrame && typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(container.__homeVerticalRenderFrame);
        }
        container.__homeVerticalRenderFrame = 0;
        container.__homeVerticalRenderTimer = 0;
        var rerender = function () {
          container.__homeVerticalRenderTimer = 0;
          render();
        };
        if (typeof window.requestAnimationFrame === "function") {
          container.__homeVerticalRenderFrame = window.requestAnimationFrame(function () {
            container.__homeVerticalRenderFrame = 0;
            container.__homeVerticalRenderTimer = window.setTimeout(rerender, 0);
          });
        } else {
          container.__homeVerticalRenderTimer = window.setTimeout(rerender, 0);
        }
      }

      function applyVerticalToggleState(toggle, node, expanded) {
        if (!toggle || !node) {
          return;
        }
        var isNodeExpanded = !!expanded;
        var icon = toggle.querySelector(".home-vertical-toggle-icon");
        var text = toggle.querySelector(".home-vertical-toggle-text");
        if (icon) {
          icon.textContent = isNodeExpanded ? "-" : "+";
        }
        if (text) {
          text.textContent = isNodeExpanded ? "Hide subtopics" : "Show subtopics";
        }
        toggle.setAttribute(
          "aria-label",
          (isNodeExpanded ? getUiString("collapse-section", "Collapse section") : getUiString("expand-section", "Expand section"))
            + ": "
            + String(node.full_label || node.label || "Untitled")
        );
        toggle.setAttribute("aria-expanded", isNodeExpanded ? "true" : "false");
      }

      function toggleVerticalExpansion(node, toggle, badge) {
        if (!node || !node.id || isLockedOpenNode(node)) {
          return;
        }
        var isNodeExpanded = !isExpanded(node);
        if (isNodeExpanded) {
          state.expanded[node.id] = 1;
        } else {
          delete state.expanded[node.id];
        }
        persistState();
        applyVerticalToggleState(toggle, node, isNodeExpanded);
        if (badge) {
          badge.setAttribute("aria-expanded", isNodeExpanded ? "true" : "false");
        }
        scheduleVerticalRender();
      }

      function getChildren(node) {
        if (!node || !node.id) {
          return [];
        }
        return childrenByParent[node.id] || [];
      }

      function hasChildren(node) {
        return getChildren(node).length > 0;
      }

      function isLockedOpenNode(node) {
        if (!node || !node.id || !hasChildren(node)) {
          return false;
        }
        var nodeId = String(node.id || "").trim();
        if (primaryTopNode && topNodes.length === 1 && nodeId === String(primaryTopNode.id || "").trim()) {
          return true;
        }
        return !!(singleL1Node && nodeId === String(singleL1Node.id || "").trim());
      }

      function isExpanded(node) {
        return !!(node && node.id && (isLockedOpenNode(node) || state.expanded[node.id]));
      }

      function getNodeLevelValue(node) {
        var parsedLevel = parseInt(String((node && node.level) || 0), 10);
        if (!Number.isFinite(parsedLevel) || parsedLevel < 0) {
          parsedLevel = getDepthValue(node);
        }
        return parsedLevel;
      }

      function getDepthValue(node) {
        var parsedDepth = parseInt(String((node && node.depth) || 0), 10);
        if (!Number.isFinite(parsedDepth) || parsedDepth < 0) {
          parsedDepth = 0;
        }
        return Math.min(parsedDepth + 1, 7);
      }

      function getLevelBadge(node) {
        var levelLabel = String((node && node.level_label) || "").trim();
        var parsedLevel = parseInt(String((node && node.level) || 0), 10);
        if (levelLabel) {
          return levelLabel;
        }
        if (!Number.isFinite(parsedLevel) || parsedLevel < 1) {
          parsedLevel = getDepthValue(node);
        }
        return "L" + String(parsedLevel);
      }

      function makeNode(tag, cls, text) {
        var el = document.createElement(tag || "div");
        if (cls) {
          el.className = cls;
        }
        if (text) {
          el.textContent = text;
        }
        return el;
      }

      function pluralizeWord(value, singular, plural) {
        var numeric = Math.max(0, parseInt(String(value || 0), 10) || 0);
        return String(numeric) + " " + (numeric === 1 ? singular : (plural || singular + "s"));
      }

      function getDisplayLabel(node) {
        return String((node && (node.display_label || node.label || node.full_label)) || "Untitled");
      }

      function getFullLabel(node) {
        return String((node && (node.full_label || node.display_label || node.label)) || "Untitled");
      }

      function normalizeCardTitleForCompare(value) {
        return String(value || "")
          .replace(/[^\p{L}\p{N}_]+/gu, " ")
          .replace(/[0-9]+/g, function (digits) { return String(parseInt(digits, 10)); })
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      }

      function stripCardHierarchySuffix(value) {
        var label = String(value || "").replace(/\s+/g, " ").trim();
        var match = label.match(/^(.*)\s(?:\||:)\s([^.!?]{1,56})$/);
        return match && match[1].trim().length >= 2 ? match[1].trim() : label;
      }

      function getSecondaryCardTitle(node) {
        var catchyTitle = stripCardHierarchySuffix((node && node.catchy_title) || "");
        var fullLabel = stripCardHierarchySuffix(getFullLabel(node));
        var displayLabel = getDisplayLabel(node).replace(/\s+/g, " ").trim();
        if (catchyTitle && normalizeCardTitleForCompare(catchyTitle) !== normalizeCardTitleForCompare(displayLabel)) {
          return catchyTitle;
        }
        if (!fullLabel || normalizeCardTitleForCompare(fullLabel) === normalizeCardTitleForCompare(displayLabel)) {
          return "";
        }
        return fullLabel;
      }

      function getNodeImage(node) {
        return String((node && node.image) || "").trim();
      }

      function getNodeSummary(node) {
        var explicit = String((node && (node.summary || node.description)) || "").trim();
        if (explicit) {
          return explicit;
        }
        var childTotal = Math.max(0, parseInt(String((node && node.child_total) || 0), 10) || 0);
        var semantic = String((node && node.semantic_level) || "").trim().toLowerCase();
        if (semantic === "l1" && childTotal > 0) {
          return "Open " + pluralizeWord(childTotal, "subtopic") + " from this section.";
        }
        if (semantic === "l2" && childTotal > 0) {
          return "This section opens into " + pluralizeWord(childTotal, "page") + ".";
        }
        return "";
      }

      function getVerticalSizeClass(node) {
        var semantic = String((node && node.semantic_level) || "").trim().toLowerCase();
        var depth = getDepthValue(node);
        if (semantic === "root") {
          return "ct-node-root";
        }
        if (semantic === "l1") {
          return "ct-node-xl";
        }
        if (semantic === "l2" || depth === 3) {
          return "ct-node-lg";
        }
        if (depth === 4) {
          return "ct-node-md";
        }
        if (depth === 5) {
          return "ct-node-sm";
        }
        return "ct-node-xs";
      }

      function isLeafGridCandidate(nodeList, parentDepth) {
        if (!Array.isArray(nodeList) || nodeList.length < 2 || parentDepth < 2) {
          return false;
        }
        return nodeList.every(function (childNode) {
          return !hasChildren(childNode);
        });
      }

      function seedSingleRootCollapsedState() {
        if (topNodes.length !== 1 || !primaryTopNode || !primaryTopNode.id || !hasChildren(primaryTopNode)) {
          return;
        }

        state.expanded[primaryTopNode.id] = 1;

        if (!singleL1Node || !singleL1Node.id || !hasChildren(singleL1Node)) {
          return;
        }

        state.expanded[singleL1Node.id] = 1;
      }

      function ensureLeafGridOverlay(childrenWrap) {
        var overlay = childrenWrap.querySelector(".home-vertical-grid-overlay");
        if (overlay) {
          return overlay;
        }
        overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        overlay.setAttribute("class", "home-vertical-grid-overlay");
        overlay.setAttribute("aria-hidden", "true");
        childrenWrap.insertBefore(overlay, childrenWrap.firstChild || null);
        return overlay;
      }

      function refreshLeafGridOverlay(childrenWrap) {
        if (!childrenWrap || !childrenWrap.classList || !childrenWrap.classList.contains("home-vertical-children-leaf-grid")) {
          return;
        }

        var shouldUseOverlay = !window.matchMedia || !window.matchMedia("(max-width: 1119px)").matches;
        var overlay = childrenWrap.querySelector(".home-vertical-grid-overlay");
        if (!shouldUseOverlay) {
          if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
          return;
        }

        overlay = ensureLeafGridOverlay(childrenWrap);
        while (overlay.firstChild) {
          overlay.removeChild(overlay.firstChild);
        }

        if (childrenWrap.hidden) {
          return;
        }

        var childWrappers = [];
        Array.prototype.forEach.call(childrenWrap.children, function (child) {
          if (child && child.classList && child.classList.contains("home-vertical-node")) {
            childWrappers.push(child);
          }
        });
        if (!childWrappers.length) {
          return;
        }

        var containerRect = childrenWrap.getBoundingClientRect();
        if (!containerRect.width || !containerRect.height) {
          return;
        }

        var connectorPoints = [];
        var railX = 2;
        childWrappers.forEach(function (child) {
          var row = child.querySelector(".home-vertical-node-row");
          var bubble = row ? row.querySelector(".home-vertical-bubble") : null;
          if (!bubble) {
            return;
          }
          var bubbleRect = bubble.getBoundingClientRect();
          var y = bubbleRect.top - containerRect.top + (bubbleRect.height * 0.5);
          var x = Math.max(railX + 18, bubbleRect.left - containerRect.left + 1);
          connectorPoints.push({ x: x, y: y });
        });

        if (!connectorPoints.length) {
          return;
        }

        overlay.setAttribute("viewBox", "0 0 " + Math.ceil(containerRect.width) + " " + Math.ceil(containerRect.height));
        overlay.setAttribute("width", String(Math.ceil(containerRect.width)));
        overlay.setAttribute("height", String(Math.ceil(containerRect.height)));

        var railBottom = connectorPoints.reduce(function (bottom, point) {
          return Math.max(bottom, point.y);
        }, 0);
        var rail = document.createElementNS("http://www.w3.org/2000/svg", "line");
        rail.setAttribute("class", "home-vertical-grid-overlay-line home-vertical-grid-overlay-rail");
        rail.setAttribute("x1", String(railX));
        rail.setAttribute("y1", "0");
        rail.setAttribute("x2", String(railX));
        rail.setAttribute("y2", String(railBottom));
        overlay.appendChild(rail);

        connectorPoints.forEach(function (point) {
          var branch = document.createElementNS("http://www.w3.org/2000/svg", "line");
          branch.setAttribute("class", "home-vertical-grid-overlay-line");
          branch.setAttribute("x1", String(railX));
          branch.setAttribute("y1", String(point.y));
          branch.setAttribute("x2", String(point.x));
          branch.setAttribute("y2", String(point.y));
          overlay.appendChild(branch);
        });
      }

      function buildCard(node, branchToggle) {
        var depth = getDepthValue(node);
        var level = getNodeLevelValue(node);
        var sizeClass = getVerticalSizeClass(node);
        var lockedOpen = isLockedOpenNode(node);
        var card = document.createElement("div");
        card.className = "home-vertical-card home-vertical-bubble ct-node " + sizeClass;
        card.setAttribute("data-depth", String(depth));
        card.setAttribute("data-level", String(level));
        card.setAttribute("data-node-id", String((node && node.id) || ""));
        card.setAttribute("data-node-kind", String((node && node.kind) || ""));
        card.setAttribute("data-semantic-level", String((node && node.semantic_level) || "").trim().toLowerCase());

        var pageUrl = String((node && node.url) || "#");
        var fullLabel = getFullLabel(node);
        var readMoreLabel = getUiString("open-report", "Read more");
        var childNodes = getChildren(node);
        var link = makeNode("a", "ct-node-link home-vertical-primary-link");
        link.href = pageUrl;
        link.title = fullLabel;
        link.setAttribute("aria-label", "Open page: " + fullLabel);

        var imageSrc = getNodeImage(node);
        if (imageSrc && sizeClass !== "ct-node-xs") {
          var thumb = makeNode("div", "ct-node-thumb");
          var image = document.createElement("img");
          var semanticLevel = String((node && node.semantic_level) || "").trim().toLowerCase();
          var isPriorityThumb = semanticLevel === "root" || semanticLevel === "l1";
          image.src = imageSrc;
          image.alt = "";
          image.loading = isPriorityThumb ? "eager" : "lazy";
          image.decoding = isPriorityThumb ? "auto" : "async";
          if (isPriorityThumb) {
            image.fetchPriority = "high";
          }
          thumb.appendChild(image);
          link.appendChild(thumb);
        } else if (sizeClass !== "ct-node-xs") {
          link.appendChild(
            makeNode(
              "span",
              "ct-node-initial",
              String(getFullLabel(node) || "U").slice(0, 1).toUpperCase()
            )
          );
        }

        var content = makeNode("span", "ct-node-content");
        content.appendChild(makeNode("span", "ct-node-label", getDisplayLabel(node)));

        var secondaryTitle = getSecondaryCardTitle(node);
        if (secondaryTitle) {
          content.appendChild(makeNode("span", "ct-node-title-full", secondaryTitle));
        }

        var summary = getNodeSummary(node);
        if (summary) {
          content.appendChild(makeNode("span", "ct-node-summary", summary));
        }
        link.appendChild(content);
        card.appendChild(link);

        var count = Math.max(0, parseInt(String((node && node.count) || 0), 10) || 0);
        if (count > 1) {
          var badgeText = pluralizeWord(count, "page");
          var badge = childNodes.length && !lockedOpen
            ? makeNode("button", "ct-node-badge ct-node-badge-toggle", badgeText)
            : makeNode("span", "ct-node-badge", badgeText);
          badge.title = badgeText;
          badge.setAttribute("aria-label", badge.title);
          if (childNodes.length && !lockedOpen) {
            badge.type = "button";
            badge.setAttribute("data-home-vertical-badge-toggle", "");
            badge.setAttribute("aria-expanded", isExpanded(node) ? "true" : "false");
            badge.addEventListener("click", function (event) {
              event.preventDefault();
              event.stopPropagation();
              toggleVerticalExpansion(node, null, badge);
            });
          }
          card.appendChild(badge);
        }

        var actions = makeNode("div", "home-vertical-card-actions");
        if (branchToggle) {
          actions.appendChild(branchToggle);
        }
        var readMoreLink = makeNode("a", "topic-card-link home-vertical-read-more", readMoreLabel);
        readMoreLink.href = pageUrl;
        readMoreLink.title = fullLabel;
        readMoreLink.setAttribute("aria-label", readMoreLabel + " about " + fullLabel);
        actions.appendChild(readMoreLink);
        card.appendChild(actions);

        var childTotal = Math.max(0, parseInt(String((node && node.child_total) || 0), 10) || 0);
        if (childTotal >= 6) {
          card.classList.add("ct-node-heavy");
        } else if (childTotal >= 3) {
          card.classList.add("ct-node-medium");
        }

        if (pageUrl && pageUrl !== "#") {
          card.setAttribute("tabindex", "0");
          card.setAttribute("role", "link");
          card.setAttribute("aria-label", "Open page: " + fullLabel);
          card.addEventListener("click", function (event) {
            if (
              event.target
              && event.target.closest
              && event.target.closest("a, button, input, select, textarea, summary, label, [role='button'], [role='link']")
            ) {
              return;
            }
            window.location.assign(pageUrl);
          });
          card.addEventListener("keydown", function (event) {
            var key = String(event.key || "");
            if (key === "Enter" || key === " ") {
              event.preventDefault();
              window.location.assign(pageUrl);
            }
          });
        }

        return card;
      }

      function buildNode(node) {
        var depth = getDepthValue(node);
        var level = getNodeLevelValue(node);
        var semantic = String((node && node.semantic_level) || "").trim().toLowerCase();
        var expanded = isExpanded(node);
        var lockedOpen = isLockedOpenNode(node);
        var wrapper = document.createElement("div");
        wrapper.className = "home-vertical-node";
        wrapper.setAttribute("data-depth", String(depth));
        wrapper.setAttribute("data-level", String(level));
        wrapper.setAttribute("data-node-id", String(node.id || ""));
        wrapper.setAttribute("data-semantic-level", semantic);
        wrapper.classList.add(expanded ? "is-expanded" : "is-collapsed");
        if (singleL1Node && String(node.id || "").trim() === String(singleL1Node.id || "").trim()) {
          wrapper.classList.add("is-single-l1");
          wrapper.setAttribute("data-home-vertical-single-l1", "true");
        }
        if (lockedOpen) {
          wrapper.classList.add("is-locked-open");
          wrapper.setAttribute("data-home-vertical-locked-open", "true");
        }
        if (depth === 1) {
          wrapper.id = "topic-vertical-" + slugify(String(node.basename || node.label || node.id || "topic"));
        }

        var row = document.createElement("div");
        row.className = "home-vertical-node-row";
        wrapper.appendChild(row);

        var childNodes = getChildren(node);
        var toggle = null;
        if (childNodes.length && !lockedOpen) {
          toggle = document.createElement("button");
          toggle.className = "home-vertical-toggle";
          toggle.type = "button";
          toggle.setAttribute("data-home-vertical-toggle", "");
          toggle.innerHTML = "";
          toggle.appendChild(makeNode("span", "home-vertical-toggle-icon", expanded ? "-" : "+"));
          toggle.appendChild(makeNode("span", "home-vertical-toggle-text", expanded ? "Hide subtopics" : "Show subtopics"));
          applyVerticalToggleState(toggle, node, expanded);
          toggle.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            toggleVerticalExpansion(node, toggle, null);
          });
        }

        var spacer = document.createElement("span");
        spacer.className = "home-vertical-toggle-spacer";
        if (lockedOpen) {
          spacer.className += " home-vertical-toggle-spacer-locked";
        }
        spacer.setAttribute("aria-hidden", "true");
        row.appendChild(spacer);
        row.appendChild(buildCard(node, toggle));

        if (childNodes.length) {
          var childrenWrap = document.createElement("div");
          childrenWrap.className = "home-vertical-children";
          if (isLeafGridCandidate(childNodes, depth)) {
            childrenWrap.classList.add("home-vertical-children-leaf-grid");
            childrenWrap.setAttribute("data-leaf-grid-columns", childNodes.length >= 5 ? "3" : "2");
          }
          childrenWrap.id = "home-vertical-children-" + slugify(String(node.id || node.label || "branch"));
          childrenWrap.hidden = !expanded;
          childrenWrap.setAttribute("data-expanded", expanded ? "true" : "false");
          if (toggle) {
            toggle.setAttribute("aria-controls", childrenWrap.id);
          }
          childNodes.forEach(function (childNode) {
            childrenWrap.appendChild(buildNode(childNode));
          });
          wrapper.appendChild(childrenWrap);
        }

        return wrapper;
      }

      function render() {
        seedSingleRootCollapsedState();
        tree.innerHTML = "";
        var fragment = document.createDocumentFragment();
        topNodes.forEach(function (node) {
          fragment.appendChild(buildNode(node));
        });
        tree.appendChild(fragment);
        scheduleLeafGridOverlayRefresh();
      }

      function refreshAllLeafGridOverlays() {
        var grids = tree.querySelectorAll(".home-vertical-children.home-vertical-children-leaf-grid");
        Array.prototype.forEach.call(grids, function (grid) {
          refreshLeafGridOverlay(grid);
        });
      }

      function scheduleLeafGridOverlayRefresh() {
        if (container.__homeVerticalOverlayFrame) {
          cancelAnimationFrame(container.__homeVerticalOverlayFrame);
        }
        container.__homeVerticalOverlayFrame = requestAnimationFrame(function () {
          container.__homeVerticalOverlayFrame = 0;
          refreshAllLeafGridOverlays();
        });
      }

      if (shouldApplyDefaultExpansion && !hasStoredState) {
        topNodes.forEach(function (node) {
          if (hasChildren(node)) {
            state.expanded[node.id] = 1;
          }
        });
        seedSingleRootCollapsedState();
      }

      if (!container.__homeVerticalControlsBound) {
        var hasFlexibleExpansion = nodes.some(function (node) {
          return hasChildren(node) && !isLockedOpenNode(node);
        });
        var expandAllButton = container.querySelector("[data-home-vertical-expand-all]");
        if (expandAllButton) {
          expandAllButton.hidden = !hasFlexibleExpansion;
          expandAllButton.disabled = !hasFlexibleExpansion;
          expandAllButton.addEventListener("click", function () {
            nodes.forEach(function (node) {
              if (hasChildren(node) && !isLockedOpenNode(node)) {
                state.expanded[node.id] = 1;
              }
            });
            persistState();
            render();
          });
        }

        var collapseAllButton = container.querySelector("[data-home-vertical-collapse-all]");
        if (collapseAllButton) {
          collapseAllButton.hidden = !hasFlexibleExpansion;
          collapseAllButton.disabled = !hasFlexibleExpansion;
          collapseAllButton.addEventListener("click", function () {
            state.expanded = {};
            seedSingleRootCollapsedState();
            persistState();
            render();
          });
        }
        container.__homeVerticalControlsBound = true;
      }

      if (!container.__homeVerticalOverlayBound) {
        window.addEventListener("resize", scheduleLeafGridOverlayRefresh);
        if (window.ResizeObserver) {
          container.__homeVerticalOverlayObserver = new ResizeObserver(function () {
            scheduleLeafGridOverlayRefresh();
          });
          container.__homeVerticalOverlayObserver.observe(tree);
        }
        if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
          document.fonts.ready.then(function () {
            scheduleLeafGridOverlayRefresh();
          }).catch(function () {
            // Ignore font observer failures.
          });
        }
        container.__homeVerticalOverlayBound = true;
      }

      render();
    });
  }

  function initHomeFilter() {
    var input = document.querySelector("[data-home-filter]");
    var status = document.querySelector("[data-home-filter-status]");
    var clearButton = document.querySelector("[data-home-filter-clear]");
    var results = document.querySelector("[data-home-filter-results]");
    var allCards = document.querySelectorAll(".topic-card[data-card-search]");
    if (!input) {
      return;
    }
    var preparedHomePages = null;
    var preparedHomePagesIsFallback = false;
    var latestHomeFilterQuery = "";
    var latestHomeFilterRanked = [];
    var latestHomeFilterTotal = 0;
    var visibleHomeFilterResultLimit = searchPageResultRenderLimit;
    var allDisclosures = document.querySelectorAll("[data-home-disclosure]");
    var pathParts = normalizePath(window.location.pathname).split("/").filter(Boolean);
    var siteScope = pathParts.length ? pathParts[0] : "root";
    var disclosureStorageKey = "phoenix-home-disclosure-state-v1-" + siteScope;
    var disclosureState = {};
    try {
      var rawDisclosureState = String(readLocalStorage(disclosureStorageKey) || "").trim();
      if (rawDisclosureState) {
        var parsedDisclosureState = JSON.parse(rawDisclosureState);
        if (parsedDisclosureState && typeof parsedDisclosureState === "object") {
          disclosureState = parsedDisclosureState;
        }
      }
    } catch (err) {
      disclosureState = {};
    }

    var getDisclosureKey = function (node, index) {
      if (!node) {
        return "";
      }
      var explicitKey = String(node.getAttribute("data-home-disclosure-key") || "").trim();
      if (explicitKey) {
        return explicitKey;
      }
      var summary = node.querySelector("summary");
      var label = String((summary && summary.textContent) || "").trim().toLowerCase();
      if (label) {
        return "home-" + slugify(label);
      }
      return "home-disclosure-" + String(index || 0);
    };

    var persistDisclosureState = function (node, index) {
      var key = getDisclosureKey(node, index);
      if (!key) {
        return;
      }
      disclosureState[key] = node.hasAttribute("open") ? 1 : 0;
      try {
        writeLocalStorage(disclosureStorageKey, JSON.stringify(disclosureState));
      } catch (err) {
        // Ignore storage write failures.
      }
    };

    var setDisclosureOpen = function (node, shouldOpen) {
      if (!node) {
        return;
      }
      if (shouldOpen) {
        node.setAttribute("open", "open");
      } else {
        node.removeAttribute("open");
      }
    };

    var restoreDisclosureDefaults = function (targetDisclosures) {
      Array.prototype.forEach.call(targetDisclosures || allDisclosures, function (node, index) {
        if (node && node.hasAttribute("data-home-mobile-disclosure")) {
          return;
        }
        var disclosureKey = getDisclosureKey(node, index);
        var storedToken = disclosureKey ? disclosureState[disclosureKey] : null;
        var hasStoredState = storedToken === 0 || storedToken === 1 || storedToken === true || storedToken === false;
        var defaultOpen = String(node.getAttribute("data-default-open") || "").toLowerCase() === "true";
        setDisclosureOpen(node, hasStoredState ? (storedToken === 1 || storedToken === true) : defaultOpen);
      });
    };

    var getUniqueCount = function (nodeList) {
      var seen = Object.create(null);
      var fallbackCount = 0;
      Array.prototype.forEach.call(nodeList, function (card) {
        var baseKey = String(card.getAttribute("data-card-base") || "").trim();
        if (!baseKey) {
          fallbackCount += 1;
          return;
        }
        seen[baseKey] = true;
      });
      return Object.keys(seen).length + fallbackCount;
    };

    var getHomeCardRecord = function (card, index) {
      var link = card.querySelector(".topic-card-link[href], h3 a[href], .topic-card-media[href]");
      var titleNode = card.querySelector("h3 a, h3, .topic-card-link");
      var summaryNode = card.querySelector(".topic-card-summary");
      var kickerNode = card.querySelector(".topic-card-kicker");
      var href = link ? String(link.getAttribute("href") || "").trim() : "";
      var title = collapseSearchText(
        card.getAttribute("data-card-title")
        || (titleNode && titleNode.textContent)
        || (link && (link.getAttribute("title") || link.textContent))
        || ""
      );
      var description = collapseSearchText(summaryNode ? summaryNode.textContent : "");
      var breadcrumb = collapseSearchText(kickerNode ? kickerNode.textContent : "");
      var text = collapseSearchText(card.getAttribute("data-card-search") || card.textContent || "");
      return {
        title: title,
        url: href || "#",
        description: description,
        breadcrumb: breadcrumb,
        text: text,
        level: Number(card.getAttribute("data-level") || card.getAttribute("data-card-level") || 0) || 0,
        _index: index || 0,
        _searchBlob: collapseSearchText([title, breadcrumb, description, text].join(" "))
      };
    };

    var collectHomeSearchRecords = function (cards) {
      var seen = Object.create(null);
      var records = [];
      Array.prototype.forEach.call(cards, function (card, index) {
        var record = getHomeCardRecord(card, index);
        if (!record.title || !record.url || record.url === "#") {
          return;
        }
        var key = String(card.getAttribute("data-card-base") || record.url || record.title).trim();
        if (seen[key]) {
          return;
        }
        seen[key] = true;
        records.push(record);
      });
      return records;
    };

    var getHomeSearchRecords = function (cards, cardRecords) {
      cardRecords = cardRecords || collectHomeSearchRecords(cards);
      if (cardRecords.length) {
        return cardRecords;
      }
      if (!preparedHomePages || (preparedHomePagesIsFallback && isSiteSearchIndexLoaded())) {
        preparedHomePages = prepareSiteSearchPages();
        preparedHomePagesIsFallback = !isSiteSearchIndexLoaded();
      }
      return preparedHomePages;
    };

    var renderHomeSearchResult = function (record, query, hitCount) {
      var snippetSource = [record.title, record.description, record.text, record.breadcrumb].filter(Boolean).join(" ");
      var numericHitCount = Math.max(0, Number(hitCount || 0) || 0);
      var hitCountPill = numericHitCount > 0
        ? '<span class="site-search-result-hit-count">' + escapeHtml(numericHitCount === 1 ? "1 hit" : String(numericHitCount) + " hits") + "</span>"
        : "";
      return ""
        + '<a class="site-search-result home-filter-result" href="' + escapeHtml(buildUrlWithSearchHighlight(record.url || "#", query)) + '">'
        + '<span class="site-search-result-kicker">' + escapeHtml(record.breadcrumb || getUiString("overview", "Overview")) + "</span>"
        + '<span class="site-search-result-title">' + escapeHtml(record.title || getUiString("overview", "Overview")) + "</span>"
        + '<span class="site-search-result-meta-row">'
        + '<span class="site-search-result-meta">' + escapeHtml(getSearchMatchKind(record, query)) + "</span>"
        + hitCountPill
        + "</span>"
        + '<span class="site-search-result-excerpt">' + buildHighlightedSnippet(snippetSource, query, 230) + "</span>"
        + "</a>";
    };

    var renderHomeFilterResultBatch = function (ranked, query, totalUniqueReports) {
      if (!results) {
        return;
      }
      var visibleLimit = Math.min(visibleHomeFilterResultLimit, ranked.length);
      results.hidden = false;
      results.innerHTML = ranked.slice(0, visibleLimit).map(function (item) {
        return renderHomeSearchResult(item.page, query, item.hitCount);
      }).join("") + (ranked.length > visibleLimit
        ? '<button class="site-search-more-button home-filter-more-button" type="button" data-home-filter-show-more>Show more</button>'
        : "");
      if (status) {
        status.setAttribute("data-state", "active");
        status.textContent = ranked.length > visibleLimit
          ? "Showing first " + String(visibleLimit) + " of " + String(ranked.length) + " matching pages for \"" + query + "\"."
          : "Showing " + String(ranked.length) + " of " + String(totalUniqueReports) + " pages for \"" + query + "\".";
      }
    };

    var collectFilterContext = function () {
      var contextCards = [];
      var addCard = function (card) {
        if (!card || contextCards.indexOf(card) !== -1) {
          return;
        }
        contextCards.push(card);
      };
      Array.prototype.forEach.call(allCards, addCard);

      return {
        cards: contextCards
      };
    };

    var applyFilter = function () {
      var query = String(input.value || "").trim().toLowerCase();
      var context = collectFilterContext();
      var cards = context.cards;
      var cardRecords = collectHomeSearchRecords(cards);
      var records = query ? getHomeSearchRecords(cards, cardRecords) : cardRecords;
      if (query !== latestHomeFilterQuery) {
        visibleHomeFilterResultLimit = searchPageResultRenderLimit;
      }
      if (query && !cardRecords.length && preparedHomePagesIsFallback) {
        loadSiteSearchIndex().then(function () {
          preparedHomePages = null;
          preparedHomePagesIsFallback = false;
          if (String(input.value || "").trim().toLowerCase() === query) {
            applyFilter();
          }
        }).catch(function () {
          // Keep the home search on local fallback records if the full index is unavailable.
        });
      }
      var ranked = query
        ? rankSearchRecords(records, query, "all")
        : [];
      var totalUniqueReports = records.length || getUniqueCount(cards);
      latestHomeFilterQuery = query;
      latestHomeFilterRanked = ranked;
      latestHomeFilterTotal = totalUniqueReports;

      Array.prototype.forEach.call(allCards, function (card) {
        card.classList.remove("is-filtered-out");
        card.classList.remove("is-search-match");
      });
      if (!query) {
        restoreDisclosureDefaults();
      }

      if (results) {
        if (!query) {
          results.hidden = true;
          results.innerHTML = "";
        } else if (!ranked.length) {
          results.hidden = false;
          results.innerHTML = '<p class="site-search-empty">' + escapeHtml("No pages match \"" + query + "\". Try a broader section or keyword.") + "</p>";
        } else {
          renderHomeFilterResultBatch(ranked, query, totalUniqueReports);
        }
      }

      if (status) {
        var visibleUnique = ranked.length;
        if (!query) {
          status.setAttribute("data-state", "default");
          status.textContent = "";
        } else if (!visibleUnique) {
          status.setAttribute("data-state", "empty");
          status.textContent = "No pages match \"" + query + "\". Try a broader section or keyword.";
        } else {
          status.setAttribute("data-state", "active");
          if (!results) {
            status.textContent = "Showing " + String(visibleUnique) + " of " + String(totalUniqueReports) + " pages for \"" + query + "\".";
          }
        }
      }

      if (clearButton) {
        clearButton.hidden = !query;
      }
    };
    var scheduledHomeFilter = createSearchRenderScheduler(applyFilter, {
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
    input.addEventListener("input", function () {
      scheduledHomeFilter.schedule();
    });
    input.addEventListener("keydown", function (event) {
      var key = String(event.key || "");
      if (key === "Enter" && String(input.value || "").trim()) {
        event.preventDefault();
        scheduledHomeFilter.cancel();
        navigateToSearchResultsPage(input.value);
        return;
      }
      if (key === "Escape" && String(input.value || "").trim()) {
        input.value = "";
        scheduledHomeFilter.flush();
      }
    });
    if (clearButton) {
      clearButton.addEventListener("click", function () {
        input.value = "";
        scheduledHomeFilter.flush();
        input.focus();
      });
    }
    if (results) {
      results.addEventListener("click", function (event) {
        var button = event.target && event.target.closest ? event.target.closest("[data-home-filter-show-more]") : null;
        if (!button || !results.contains(button) || !latestHomeFilterRanked.length) {
          return;
        }
        visibleHomeFilterResultLimit = Math.min(
          latestHomeFilterRanked.length,
          visibleHomeFilterResultLimit + searchPageResultRenderLimit
        );
        renderHomeFilterResultBatch(latestHomeFilterRanked, latestHomeFilterQuery, latestHomeFilterTotal);
      });
    }
    Array.prototype.forEach.call(allDisclosures, function (node, index) {
      node.addEventListener("toggle", function () {
        if (String(input.value || "").trim()) {
          return;
        }
        persistDisclosureState(node, index);
      });
    });
    document.addEventListener("phoenix-home-mode-changed", function () {
      scheduledHomeFilter.flush();
    });
    applyFilter();
  }

  function initHomeCardNavigation() {
    var body = document.body;
    if (!body || !body.classList.contains("page-home")) {
      return;
    }

    var cards = document.querySelectorAll(".topic-card, .home-vertical-card");
    if (!cards.length) {
      return;
    }

    function isInteractiveTarget(node, card) {
      if (!node || !node.closest) {
        return false;
      }
      var interactive = node.closest("a, button, input, select, textarea, summary, label, [role='button'], [role='link']");
      return Boolean(interactive && interactive !== card);
    }

    Array.prototype.forEach.call(cards, function (card) {
      if (!card) {
        return;
      }
      var primaryLink = card.querySelector(
        ".home-vertical-primary-link, .topic-card-link, h3 a, .topic-card-media, .ct-node-link"
      );
      if (!primaryLink) {
        return;
      }
      var href = String(primaryLink.getAttribute("href") || "").trim();
      if (!href) {
        return;
      }

      if (!card.hasAttribute("tabindex")) {
        card.setAttribute("tabindex", "0");
      }
      card.setAttribute("role", "link");
      if (!card.getAttribute("aria-label")) {
        var label = String(
          primaryLink.getAttribute("aria-label")
          || primaryLink.getAttribute("title")
          || primaryLink.textContent
          || ""
        ).trim();
        if (label) {
          card.setAttribute("aria-label", label);
        }
      }

      var navigateToCard = function () {
        window.location.assign(href);
      };

      card.addEventListener("click", function (event) {
        if (isInteractiveTarget(event.target, card)) {
          return;
        }
        navigateToCard();
      });

      card.addEventListener("keydown", function (event) {
        if (isInteractiveTarget(event.target, card)) {
          return;
        }
        var key = String(event.key || "");
        if (key === "Enter" || key === " ") {
          event.preventDefault();
          navigateToCard();
        }
      });
    });
  }

  PhoenixUI.initializers.homeResponsiveDisclosures = initHomeResponsiveDisclosures;
  PhoenixUI.initializers.homeModeSwitcher = initHomeModeSwitcher;
  PhoenixUI.initializers.homeVerticalView = initHomeVerticalView;
  PhoenixUI.initializers.homeFilter = initHomeFilter;
  PhoenixUI.initializers.homeCardNavigation = initHomeCardNavigation;
})();
