(function() {
  "use strict";

  var PhoenixUI = window.PhoenixUI = window.PhoenixUI || { initializers: {} };
  PhoenixUI.initializers = PhoenixUI.initializers || {};
  var normalizePath = PhoenixUI.normalizePath;
  var readLocalStorage = PhoenixUI.readLocalStorage;
  var writeLocalStorage = PhoenixUI.writeLocalStorage;
  var getUiString = PhoenixUI.getUiString;
  var formatUiString = PhoenixUI.formatUiString;
  var prefersReducedMotion = PhoenixUI.prefersReducedMotion;

  function initHierarchyGraphs() {
    var homeGraphContainers = document.querySelectorAll("[data-hierarchy-graph]");
    var articleGraphContainers = document.querySelectorAll("[data-branch-graph]");
    if (!homeGraphContainers.length && !articleGraphContainers.length) {
      return;
    }

    var svgNs = "http://www.w3.org/2000/svg";

    function createSvgNode(tagName) {
      return document.createElementNS(svgNs, tagName);
    }

    function clearSvg(svg) {
      while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
      }
    }

    function normalizeLabelText(text) {
      return String(text || "")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim();
    }

    function truncateLabel(text, maxLength) {
      var value = normalizeLabelText(text);
      if (!value) {
        return "";
      }
      if (value.length <= maxLength) {
        return value;
      }
      return value.slice(0, Math.max(1, maxLength - 3)).trim() + "...";
    }

    function splitLabelLines(text, maxCharsPerLine, maxLines) {
      var value = normalizeLabelText(text);
      if (!value) {
        return [""];
      }
      var words = value.split(" ");
      if (words.length === 1) {
        return [truncateLabel(value, maxCharsPerLine)];
      }
      var lines = [];
      var current = "";
      for (var index = 0; index < words.length; index += 1) {
        var word = words[index];
        var proposed = current ? (current + " " + word) : word;
        if (proposed.length <= maxCharsPerLine || !current) {
          current = proposed;
        } else {
          lines.push(current);
          current = word;
        }
        if (lines.length === maxLines - 1) {
          if (index + 1 < words.length) {
            current = current + " " + words.slice(index + 1).join(" ");
          }
          break;
        }
      }
      if (current) {
        lines.push(current);
      }
      lines = lines.slice(0, Math.max(1, maxLines));
      if (lines.length === 2) {
        var stopwordPattern = /^(?:a|an|and|as|at|by|for|from|in|of|on|or|the|to|vs?)$/i;
        var firstWords = lines[0].split(" ").filter(Boolean);
        var secondWords = lines[1].split(" ").filter(Boolean);
        while (firstWords.length > 1) {
          var secondLineText = secondWords.join(" ");
          var weakSecondLine = secondWords.length <= 1 || secondLineText.length < 10;
          var weakFirstEnding = stopwordPattern.test(firstWords[firstWords.length - 1] || "");
          if (!weakSecondLine && !weakFirstEnding) {
            break;
          }
          var candidateSecondWords = [firstWords[firstWords.length - 1]].concat(secondWords);
          var candidateFirstWords = firstWords.slice(0, -1);
          var candidateFirst = candidateFirstWords.join(" ");
          var candidateSecond = candidateSecondWords.join(" ");
          if (!candidateFirst || candidateSecond.length > maxCharsPerLine) {
            break;
          }
          firstWords = candidateFirstWords;
          secondWords = candidateSecondWords;
        }
        lines = [firstWords.join(" "), secondWords.join(" ")].filter(Boolean);
      }
      return lines;
    }

    function getNodeLabelBudget(node) {
      var kind = String((node && node.kind) || "").trim().toLowerCase();
      if (kind === "root" || kind === "current") {
        return 26;
      }
      if (kind === "branch" || kind === "parent" || kind === "sibling") {
        return 22;
      }
      return 18;
    }

    function readNodeCount(node) {
      var explicit = parseInt(String((node && node.count) || 0), 10);
      if (Number.isFinite(explicit) && explicit > 0) {
        return explicit;
      }
      var rawLabel = String((node && node.label) || "").trim();
      var match = rawLabel.match(/^\+(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
      return 1;
    }

    function getNodeDimensions(node, isCompact) {
      var kind = String((node && node.kind) || "").trim().toLowerCase();
      if (kind === "current") {
        return { width: isCompact ? 224 : 264, height: 80 };
      }
      if (kind === "root") {
        return { width: isCompact ? 232 : 276, height: 84 };
      }
      if (kind.indexOf("cluster") !== -1) {
        return { width: isCompact ? 162 : 182, height: 70 };
      }
      if (kind === "parent") {
        return { width: isCompact ? 188 : 214, height: 72 };
      }
      if (kind === "branch" || kind === "sibling") {
        return { width: isCompact ? 186 : 210, height: 74 };
      }
      return { width: isCompact ? 164 : 184, height: 68 };
    }

    function buildSpreadPositions(count, minX, maxX, y) {
      var points = [];
      if (count <= 0) {
        return points;
      }
      if (count === 1) {
        points.push({ x: Math.round((minX + maxX) / 2), y: y });
        return points;
      }
      var step = (maxX - minX) / (count - 1);
      for (var i = 0; i < count; i += 1) {
        points.push({ x: Math.round(minX + (step * i)), y: y });
      }
      return points;
    }

    function appendEdge(svg, x1, y1, x2, y2, className, nodeId) {
      var path = createSvgNode("path");
      var controlX = Math.round((x1 + x2) / 2);
      var controlY = Math.round((y1 + y2) / 2);
      path.setAttribute("class", "branch-graph-edge hierarchy-graph-edge " + String(className || ""));
      path.setAttribute("d", "M " + x1 + " " + y1 + " Q " + controlX + " " + controlY + " " + x2 + " " + y2);
      if (nodeId) { path.setAttribute("data-edge-for", nodeId); }
      svg.appendChild(path);
    }

    function appendNode(svg, node, options) {
      var opts = options || {};
      var compact = Boolean(opts.compact);
      var dims = getNodeDimensions(node, compact);
      var width = dims.width;
      var height = dims.height;
      var group = createSvgNode("g");
      var kind = String(node.kind || "child").trim().toLowerCase();
      group.setAttribute(
        "class",
        "hierarchy-graph-node branch-graph-node branch-graph-node-" + kind + " hierarchy-graph-node-" + kind
      );
      group.setAttribute("transform", "translate(" + Math.round(node.x) + " " + Math.round(node.y) + ")");
      group.setAttribute("data-kind", kind);

      var card = createSvgNode("rect");
      card.setAttribute("class", "hierarchy-graph-card");
      card.setAttribute("x", String(-Math.round(width / 2)));
      card.setAttribute("y", String(-Math.round(height / 2)));
      card.setAttribute("width", String(width));
      card.setAttribute("height", String(height));
      card.setAttribute("rx", kind === "root" ? "18" : "16");
      card.setAttribute("ry", kind === "root" ? "18" : "16");
      group.appendChild(card);

      var accent = createSvgNode("rect");
      accent.setAttribute("class", "hierarchy-graph-accent");
      accent.setAttribute("x", String(-Math.round(width / 2)));
      accent.setAttribute("y", String(-Math.round(height / 2)));
      accent.setAttribute("width", "10");
      accent.setAttribute("height", String(height));
      accent.setAttribute("rx", "16");
      accent.setAttribute("ry", "16");
      group.appendChild(accent);

      var imageOffset = 0;
      if (node.image && width >= 184) {
        var thumb = createSvgNode("image");
        thumb.setAttribute("href", node.image);
        thumb.setAttribute("x", String(-Math.round(width / 2) + 16));
        thumb.setAttribute("y", String(-Math.round(height / 2) + 14));
        thumb.setAttribute("width", "34");
        thumb.setAttribute("height", "34");
        thumb.setAttribute("preserveAspectRatio", "xMidYMid slice");
        thumb.setAttribute("class", "hierarchy-graph-thumb");
        group.appendChild(thumb);
        imageOffset = 42;
      }

      var labelBudget = getNodeLabelBudget(node);
      var labelLines = splitLabelLines(String(node.label || node.full_label || ""), labelBudget, 2);
      var text = createSvgNode("text");
      text.setAttribute("class", "hierarchy-graph-label");
      text.setAttribute("x", String(-Math.round(width / 2) + 20 + imageOffset));
      text.setAttribute("y", labelLines.length > 1 ? "-6" : "0");
      text.setAttribute("text-anchor", "start");
      text.setAttribute("xml:space", "preserve");
      for (var lineIndex = 0; lineIndex < labelLines.length; lineIndex += 1) {
        var tspan = createSvgNode("tspan");
        tspan.setAttribute("x", String(-Math.round(width / 2) + 20 + imageOffset));
        tspan.setAttribute("dy", lineIndex === 0 ? "0" : "15");
        tspan.setAttribute("xml:space", "preserve");
        var lineText = truncateLabel(labelLines[lineIndex], labelBudget);
        if (lineIndex < labelLines.length - 1) {
          lineText += " ";
        }
        tspan.textContent = lineText;
        text.appendChild(tspan);
      }
      group.appendChild(text);

      var count = readNodeCount(node);
      if (count > 1 || kind.indexOf("cluster") !== -1) {
        var badgeWidth = Math.max(34, String(count).length * 9 + 20);
        var badgeRect = createSvgNode("rect");
        badgeRect.setAttribute("class", "hierarchy-graph-badge");
        badgeRect.setAttribute("x", String(Math.round(width / 2) - badgeWidth - 12));
        badgeRect.setAttribute("y", String(-Math.round(height / 2) + 12));
        badgeRect.setAttribute("width", String(badgeWidth));
        badgeRect.setAttribute("height", "22");
        badgeRect.setAttribute("rx", "11");
        badgeRect.setAttribute("ry", "11");
        group.appendChild(badgeRect);

        var badgeText = createSvgNode("text");
        badgeText.setAttribute("class", "hierarchy-graph-badge-text");
        badgeText.setAttribute("x", String(Math.round(width / 2) - badgeWidth / 2 - 12));
        badgeText.setAttribute("y", String(-Math.round(height / 2) + 27));
        badgeText.textContent = kind.indexOf("cluster") !== -1 ? ("+" + String(count)) : String(count);
        group.appendChild(badgeText);
      }

      var title = createSvgNode("title");
      title.textContent = String(node.full_label || node.label || "").trim() || "Node";
      group.appendChild(title);

      if (node.url) {
        var anchor = createSvgNode("a");
        anchor.setAttribute("href", node.url);
        anchor.setAttribute("data-node-id", String(node._edgeId || ""));
        anchor.setAttribute("class", "hierarchy-graph-anchor branch-graph-anchor");
        anchor.appendChild(group);
        svg.appendChild(anchor);
      } else {
        svg.appendChild(group);
      }
    }

    function renderArticleGraph(container) {
      var svg = container.querySelector("svg");
      if (!svg) {
        return;
      }

      var currentLabel = String(container.getAttribute("data-current-label") || "").trim();
      if (!currentLabel) {
        container.hidden = true;
        return;
      }

      var parentNode = null;
      var siblingNodes = [];
      var childNodes = [];
      Array.prototype.forEach.call(container.querySelectorAll("[data-graph-item]"), function (item) {
        var kind = String(item.getAttribute("data-kind") || "").trim().toLowerCase();
        var label = String(item.getAttribute("data-label") || "").trim();
        var url = String(item.getAttribute("data-url") || "").trim();
        var count = parseInt(String(item.getAttribute("data-count") || "1"), 10);
        if (!label) {
          return;
        }
        var graphNode = {
          kind: kind,
          label: label,
          full_label: label,
          url: url,
          count: Number.isFinite(count) ? count : 1
        };
        if (kind === "parent" && !parentNode) {
          parentNode = graphNode;
        } else if (kind === "sibling" || kind === "sibling-cluster") {
          siblingNodes.push(graphNode);
        } else if (kind === "child" || kind === "child-cluster") {
          childNodes.push(graphNode);
        }
      });

      if (!parentNode || (siblingNodes.length < 2 && childNodes.length < 2)) {
        container.hidden = true;
        return;
      }

      clearSvg(svg);
      var compact = Boolean(container.clientWidth && container.clientWidth < 700);
      var maxPerRow = compact ? 4 : 6;
      var siblingRows = Math.max(1, Math.ceil(siblingNodes.length / maxPerRow));
      var childRows = Math.max(1, Math.ceil(childNodes.length / maxPerRow));
      var width = compact ? 820 : 1080;
      var baseH = compact ? 340 : 300;
      var perRow = compact ? 100 : 90;
      var height = baseH + Math.max(0, siblingRows - 1) * perRow + Math.max(0, childRows - 1) * perRow;
      var centerX = Math.round(width / 2);
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);

      var currentNode = {
        kind: "current",
        label: currentLabel,
        full_label: currentLabel,
        url: String(container.getAttribute("data-current-url") || "").trim(),
        count: 1,
        x: centerX,
        y: compact ? 164 : 176
      };
      parentNode.x = centerX;
      parentNode.y = compact ? 62 : 58;

      /* Multi-row spread: wraps nodes to rows of maxPerRow */
      function buildMultiRowPositions(nodes, minX, maxX, startY, rowGap) {
        var positions = [];
        var total = nodes.length;
        for (var r = 0; r < Math.ceil(total / maxPerRow); r++) {
          var rStart = r * maxPerRow;
          var rCount = Math.min(maxPerRow, total - rStart);
          var rowPositions = buildSpreadPositions(rCount, minX, maxX, startY + r * rowGap);
          for (var p = 0; p < rowPositions.length; p++) {
            positions.push(rowPositions[p]);
          }
        }
        return positions;
      }
      var edgeMinX = compact ? 110 : 120;
      var edgeMaxX = compact ? width - 110 : width - 120;
      var siblingY = compact ? 266 : 126;
      var childY = (compact ? 346 : 294) + Math.max(0, siblingRows - 1) * perRow;
      var siblingPositions = buildMultiRowPositions(siblingNodes, edgeMinX, edgeMaxX, siblingY, perRow);
      var childPositions = buildMultiRowPositions(childNodes, edgeMinX, edgeMaxX, childY, perRow);
      for (var siblingIndex = 0; siblingIndex < siblingNodes.length; siblingIndex += 1) {
        siblingNodes[siblingIndex].x = siblingPositions[siblingIndex].x;
        siblingNodes[siblingIndex].y = siblingPositions[siblingIndex].y;
        siblingNodes[siblingIndex]._edgeId = "node-" + siblingIndex;
      }
      for (var childIndex = 0; childIndex < childNodes.length; childIndex += 1) {
        childNodes[childIndex].x = childPositions[childIndex].x;
        childNodes[childIndex].y = childPositions[childIndex].y;
        childNodes[childIndex]._edgeId = "node-child-" + childIndex;
      }

      appendEdge(svg, parentNode.x, parentNode.y + 30, currentNode.x, currentNode.y - 38, "branch-graph-edge-parent");
      siblingNodes.forEach(function (node) {
        appendEdge(svg, currentNode.x, currentNode.y - 16, node.x, node.y - 30, "branch-graph-edge-sibling", "node-" + siblingNodes.indexOf(node));
      });
      childNodes.forEach(function (node) {
        appendEdge(svg, currentNode.x, currentNode.y + 28, node.x, node.y - 32, "branch-graph-edge-child", "node-child-" + childNodes.indexOf(node));
      });

      appendNode(svg, parentNode, { compact: compact });
      appendNode(svg, currentNode, { compact: compact });
      siblingNodes.forEach(function (node) {
        appendNode(svg, node, { compact: compact });
      });
      childNodes.forEach(function (node) {
        appendNode(svg, node, { compact: compact });
      });

      /* Edge hover: highlight connected edges on node hover */
      Array.prototype.forEach.call(svg.querySelectorAll(".branch-graph-anchor"), function (anchor) {
        var nodeId = anchor.getAttribute("data-node-id") || "";
        if (!nodeId) { return; }
        anchor.addEventListener("mouseenter", function () {
          var allEdges = svg.querySelectorAll(".branch-graph-edge");
          for (var ei = 0; ei < allEdges.length; ei++) {
            var edgeFor = allEdges[ei].getAttribute("data-edge-for") || "";
            if (edgeFor === nodeId) {
              allEdges[ei].classList.add("edge-highlighted");
              allEdges[ei].classList.remove("edge-dimmed");
            } else if (edgeFor) {
              allEdges[ei].classList.add("edge-dimmed");
              allEdges[ei].classList.remove("edge-highlighted");
            }
          }
        });
        anchor.addEventListener("mouseleave", function () {
          var allEdges = svg.querySelectorAll(".branch-graph-edge");
          for (var ei = 0; ei < allEdges.length; ei++) {
            allEdges[ei].classList.remove("edge-highlighted");
            allEdges[ei].classList.remove("edge-dimmed");
          }
        });
      });
    }

    function createHtmlNode(tagName, className, text) {
      var node = document.createElement(tagName);
      if (className) {
        node.className = className;
      }
      if (text !== undefined && text !== null) {
        node.textContent = String(text);
      }
      return node;
    }

    function applyHomeClusterNodeMeta(element, node) {
      if (!element || !node) {
        return;
      }
      var densityTier = String(node.density_tier || "").trim().toLowerCase();
      var titleBucket = String(node.title_length_bucket || "").trim().toLowerCase();
      if (densityTier) {
        element.setAttribute("data-density-tier", densityTier);
        element.classList.add("is-tier-" + densityTier);
      }
      if (titleBucket) {
        element.setAttribute("data-title-bucket", titleBucket);
        element.classList.add("is-title-" + titleBucket);
      }
      if (node.semantic_level) {
        element.setAttribute("data-semantic-level", String(node.semantic_level));
      }
      if (node.render_hint) {
        element.setAttribute("data-render-hint", String(node.render_hint));
      }
      if (node.preferred_cluster_strategy) {
        element.setAttribute("data-preferred-cluster-strategy", String(node.preferred_cluster_strategy));
      }
      if (node.preferred_subtree_layout) {
        element.setAttribute("data-preferred-subtree-layout", String(node.preferred_subtree_layout));
      }
      if (node.subtree_shape && typeof node.subtree_shape === "object") {
        var subtreeShape = node.subtree_shape;
        var subtreeTotal = parseInt(String(subtreeShape.total_nodes || 0), 10);
        var subtreeDepth = parseInt(String(subtreeShape.max_depth || 0), 10);
        var subtreeBreadth = parseInt(String(subtreeShape.max_breadth || 0), 10);
        var subtreeChildCount = parseInt(String(subtreeShape.child_count || 0), 10);
        if (Number.isFinite(subtreeTotal)) {
          element.setAttribute("data-subtree-total", String(subtreeTotal));
        }
        if (Number.isFinite(subtreeDepth)) {
          element.setAttribute("data-subtree-depth", String(subtreeDepth));
        }
        if (Number.isFinite(subtreeBreadth)) {
          element.setAttribute("data-subtree-breadth", String(subtreeBreadth));
        }
        if (Number.isFinite(subtreeChildCount)) {
          element.setAttribute("data-subtree-child-count", String(subtreeChildCount));
        }
      }
    }

    function getHomeClusterTierRank(tier) {
      var normalized = String(tier || "balanced").trim().toLowerCase();
      if (normalized === "sparse") {
        return 0;
      }
      if (normalized === "balanced") {
        return 1;
      }
      if (normalized === "dense") {
        return 2;
      }
      return 3;
    }

    function chunkHomeClusterItems(items, pageSize) {
      var source = Array.isArray(items) ? items.slice() : [];
      var size = Math.max(1, parseInt(String(pageSize || 1), 10) || 1);
      var pages = [];
      for (var index = 0; index < source.length; index += size) {
        pages.push(source.slice(index, index + size));
      }
      return pages;
    }

    function getHomeClusterPageSize(kind, width, tier) {
      var rank = getHomeClusterTierRank(tier);
      if (kind === "l1-overview") {
        if (rank <= 1) {
          return width >= 1220 ? 12 : (width >= 860 ? 8 : 4);
        }
        if (rank === 2) {
          return width >= 1220 ? 8 : (width >= 860 ? 6 : 3);
        }
        return 0;
      }
      if (kind === "l1-focus") {
        if (width >= 1220) {
          return 8;
        }
        if (width >= 860) {
          return 6;
        }
        return 4;
      }
      if (kind === "l2-overview") {
        if (rank <= 1) {
          if (width >= 1220) {
            return 3;
          }
          if (width >= 860) {
            return 2;
          }
          return 1;
        }
        if (rank === 2) {
          return width >= 860 ? 1 : 0;
        }
        return 0;
      }
      if (kind === "l2-focus") {
        if (width >= 1220) {
          return 12;
        }
        if (width >= 860) {
          return 8;
        }
        return 5;
      }
      if (kind === "l3-focus") {
        if (width >= 1220) {
          return 16;
        }
        if (width >= 860) {
          return 12;
        }
        return 8;
      }
      if (kind === "group-overview") {
        return width >= 860 ? 2 : 1;
      }
      return 1;
    }

    function renderHomeClusterMap(container, payload, nodes) {

      var board = container.querySelector("[data-home-cluster-board]");

      var focusTray = container.querySelector("[data-home-cluster-focus]");

      if (!board) {

        container.hidden = true;

        return;

      }



      var width = Math.max(

        Math.round((container.getBoundingClientRect && container.getBoundingClientRect().width) || 0),

        container.clientWidth || 0,

        (container.parentElement && Math.round((container.parentElement.getBoundingClientRect && container.parentElement.getBoundingClientRect().width) || 0)) || 0,

        320

      );
      var viewportWidth = Math.max(
        document.documentElement ? (document.documentElement.clientWidth || 0) : 0,
        window.innerWidth || 0,
        width
      );
      var isVertical = width < 720;

      var nodeById = {};

      var childrenByParent = {};

      var branchByBase = {};



      container.hidden = false;

      container.setAttribute("data-home-cluster-version", String(payload.home_cluster_version || 3));

      container.classList.add("home-cluster-tree-mode");



      nodes.forEach(function (node) {

        nodeById[node.id] = node;

        var parentId = String(node.parent_id || "").trim();

        if (parentId) {

          if (!childrenByParent[parentId]) {

            childrenByParent[parentId] = [];

          }

          childrenByParent[parentId].push(node);

        }

        if (String(node.semantic_level || "") === "l1" && node.basename) {

          branchByBase[String(node.basename)] = node.id;

        }

      });

      Object.keys(childrenByParent).forEach(function (parentId) {

        childrenByParent[parentId].sort(function (a, b) {

          var aSlot = parseInt(String(a.slot_index || 0), 10);

          var bSlot = parseInt(String(b.slot_index || 0), 10);

          if (Number.isFinite(aSlot) && Number.isFinite(bSlot) && aSlot !== bSlot) {

            return aSlot - bSlot;

          }

          return String(a.label || "").localeCompare(String(b.label || ""));

        });

      });

      var currentPath = normalizePath(window.location.pathname);
      var pathParts = currentPath.split("/").filter(Boolean);
      var siteScope = pathParts.length ? pathParts[0] : "root";
      var branchStorageKey = "phoenix-home-cluster-branch-v1-" + siteScope + "-" + currentPath.replace(/[^\w/-]+/g, "_");



      var rootNode = nodes.filter(function (node) {

        return parseInt(String(node.depth || 0), 10) === 0;

      })[0] || null;

      var allBranches = rootNode ? (childrenByParent[rootNode.id] || []) : [];

      if (!rootNode || !allBranches.length) {

        container.hidden = true;

        return;

      }



      /* --- Shape Analysis --- */

      var shape = payload.shape || {};

      var totalNodes = shape.total_nodes || nodes.length;

      var maxDepth = shape.max_depth || 0;

      var maxBreadth = shape.max_breadth || 0;

      var breadthByDepth = shape.breadth_by_depth || {};

      var rootBreadth = parseInt(String(breadthByDepth[0] || breadthByDepth["0"] || 0), 10);

      var l1Breadth = parseInt(String(breadthByDepth[1] || breadthByDepth["1"] || allBranches.length), 10);

      var l2Breadth = parseInt(String(breadthByDepth[2] || breadthByDepth["2"] || 0), 10);

      var l1Count = allBranches.length;

      var singleRootTree = !Number.isFinite(rootBreadth) || rootBreadth <= 1;
      var syntheticRoot = Boolean(shape && shape.synthetic_root);

      var shallowFanoutEligible = singleRootTree && maxDepth <= 1 && l1Count >= 2 && l1Count <= 12;
      var splitColumnFanoutEligible = singleRootTree && l1Count >= 2 && l1Count <= 8;
      var multiRootExplorerFanout = syntheticRoot && maxDepth <= 2 && l1Count >= 6 && l1Count <= 14 && maxBreadth <= 24 && totalNodes <= 80;

      var hierarchyFirstTree = singleRootTree && maxDepth >= 2 && l1Count <= 8 && maxBreadth <= 28 && totalNodes <= 180;
      var mobileBranchListEligible = singleRootTree && l1Count >= 2 && l1Count <= 8 && totalNodes <= 240;

      function getPreferredClusterStrategyHint(isMobile) {
        var mobileHint = String(payload.preferred_cluster_strategy_mobile || (rootNode && rootNode.preferred_cluster_strategy_mobile) || "").trim().toLowerCase();
        var desktopHint = String(payload.preferred_cluster_strategy || (rootNode && rootNode.preferred_cluster_strategy) || "").trim().toLowerCase();
        if (isMobile && (mobileHint === "fanout" || mobileHint === "cascade" || mobileHint === "tree" || mobileHint === "grid")) {
          return mobileHint;
        }
        if (desktopHint === "fanout" || desktopHint === "cascade" || desktopHint === "tree" || desktopHint === "grid") {
          return desktopHint;
        }
        return "";
      }



      /* --- Layout Strategy Selection --- */

      function autoSelectStrategy() {
        var usableWidth = width || viewportWidth || 1200;
        var isMobile = viewportWidth <= 720;
        var hintedStrategy = getPreferredClusterStrategyHint(isMobile);
        var cascadeLimit = isMobile ? 20 : 40;
        var cascadeBreadth = isMobile ? 5 : 8;
        var gridNodeLimit = isMobile ? 100 : 200;
        var gridL1Limit = isMobile ? 10 : 15;
        if (hintedStrategy) {
          if (hintedStrategy === "tree" && isMobile && (hierarchyFirstTree || mobileBranchListEligible)) {
            return "fanout";
          }
          if (hintedStrategy === "cascade" && isMobile && (hierarchyFirstTree || mobileBranchListEligible)) {
            return "fanout";
          }
          if (hintedStrategy === "tree" && !isMobile && splitColumnFanoutEligible) {
            return "fanout";
          }
          if (hintedStrategy === "tree" && multiRootExplorerFanout) {
            return "fanout";
          }
          if (hintedStrategy === "fanout" && usableWidth < 620 && l1Count > 8) {
            return "cascade";
          }
          return hintedStrategy;
        }
        if (shallowFanoutEligible) {
          return "fanout";
        }
        if (multiRootExplorerFanout) {
          return "fanout";
        }
        if (isMobile && mobileBranchListEligible) {
          return "fanout";
        }
        if (!isMobile && splitColumnFanoutEligible && usableWidth < 900) {
          return "fanout";
        }
        if (hierarchyFirstTree) {
          if (isMobile) {
            if (l1Count <= 6 && usableWidth >= 360) {
              return "fanout";
            }
            return "cascade";
          }
          return "fanout";
        }
        if (totalNodes <= cascadeLimit && maxBreadth <= cascadeBreadth) {
          return "cascade";
        }
        if (l1Count >= gridL1Limit || totalNodes >= gridNodeLimit) {
          return "grid";
        }
        return "tree";
      }

      function selectLayoutStrategy() {

        var override = String(container.getAttribute("data-ct-strategy-override") || "").trim().toLowerCase();

        if (override === "fanout" || override === "cascade" || override === "tree" || override === "grid") {

          return override;

        }

        return autoSelectStrategy();

      }

      var strategy = selectLayoutStrategy();

      var autoStrategy = autoSelectStrategy();

      function getStrategyLabel(token) {
        return {
          fanout: "Branch map",
          cascade: "Stacked view",
          tree: "Tree view",
          grid: "Tile grid"
        }[token] || "Cluster diagram";
      }

      function syncClusterLabels(activeStrategy) {
        var label = getStrategyLabel(activeStrategy);
        var band = container.closest("[data-home-hierarchy-band]");
        var titleNode = band ? band.querySelector("[data-home-cluster-title]") : null;
        if (titleNode) {
          titleNode.textContent = label;
        }
        var switcher = document.querySelector("[data-home-mode-switcher]");
        if (switcher && String(switcher.getAttribute("data-home-mode-effective") || "").trim().toLowerCase() === "cluster") {
          var summaryCurrentNodes = switcher.querySelectorAll("[data-home-mode-summary-current], [data-home-mode-summary-current-visual]");
          Array.prototype.forEach.call(summaryCurrentNodes, function (node) {
            node.textContent = label;
          });
        }
      }



      /* --- State for expand/collapse --- */
      var state = container.__homeClusterState || {
        expandedBranches: {},
        expandedL2: {},
        selectedBranchId: "",
        hoveredBranchId: "",
        manualSelection: false
      };
      if (!state || typeof state !== "object") {
        state = {
          expandedBranches: {},
          expandedL2: {},
          selectedBranchId: "",
          hoveredBranchId: "",
          manualSelection: false
        };
      }
      if (!state.expandedBranches || typeof state.expandedBranches !== "object") {
        state.expandedBranches = {};
      }
      if (!state.expandedL2 || typeof state.expandedL2 !== "object") {
        state.expandedL2 = {};
      }
      state.selectedBranchId = String(state.selectedBranchId || "").trim();
      state.hoveredBranchId = String(state.hoveredBranchId || "").trim();
      state.manualSelection = !!state.manualSelection;
      if (!container.__homeClusterState && !state.selectedBranchId) {
        var persistedBranchBase = String(readLocalStorage(branchStorageKey) || "").trim();
        if (persistedBranchBase) {
          var restoredBranch = allBranches.filter(function (branchNode) {
            return String(branchNode && branchNode.basename || "").trim() === persistedBranchBase;
          })[0] || null;
          if (restoredBranch && restoredBranch.id) {
            state.selectedBranchId = String(restoredBranch.id || "").trim();
            state.manualSelection = true;
          }
        }
      }
      if (state.selectedBranchId && !nodeById[state.selectedBranchId]) {
        state.selectedBranchId = "";
        state.manualSelection = false;
      }
      if (state.hoveredBranchId && !nodeById[state.hoveredBranchId]) {
        state.hoveredBranchId = "";
      }
      /* Auto-expand all branches for small sites on first render */
      if (!container.__homeClusterState && totalNodes <= 30) {
        allBranches.forEach(function (b) { state.expandedBranches[b.id] = true; });
      }
      if (state.selectedBranchId && !Object.prototype.hasOwnProperty.call(state.expandedBranches, state.selectedBranchId)) {
        state.expandedBranches[state.selectedBranchId] = true;
      }
      container.__homeClusterState = state;
      var shouldPreferFocusedBranch = !!state.manualSelection || totalNodes >= 18 || l1Count > 4;

      if (
        !container.__homeClusterStateInitialized
        && !state.selectedBranchId
        && !isVertical
        && shouldPreferFocusedBranch
        && strategy === "fanout"
        && allBranches.length
        && allBranches[0]
        && allBranches[0].id
      ) {
        state.selectedBranchId = String(allBranches[0].id || "").trim();
        state.manualSelection = true;
        state.expandedBranches[state.selectedBranchId] = true;
      }
      container.__homeClusterStateInitialized = true;

      function getTopLevelBranchId(nodeOrId) {
        var current = typeof nodeOrId === "string" ? nodeById[String(nodeOrId || "").trim()] : nodeOrId;
        var guard = 0;
        while (current && guard < 16) {
          var currentDepth = parseInt(String(current.depth || 0), 10) || 0;
          if (currentDepth === 1) {
            return String(current.id || "").trim();
          }
          var parentId = String(current.parent_id || "").trim();
          if (!parentId) {
            break;
          }
          current = nodeById[parentId];
          guard += 1;
        }
        return "";
      }

      function isNodeInSelectedBranch(nodeOrId) {
        var selectedBranchId = String(state.selectedBranchId || "").trim();
        if (!selectedBranchId) {
          return false;
        }
        return getTopLevelBranchId(nodeOrId) === selectedBranchId;
      }

      function getEffectiveFocusBranchId() {
        var hoveredBranchId = String(state.hoveredBranchId || "").trim();
        if (hoveredBranchId && nodeById[hoveredBranchId]) {
          return hoveredBranchId;
        }
        var selectedBranchId = String(state.selectedBranchId || "").trim();
        if (selectedBranchId && nodeById[selectedBranchId]) {
          return selectedBranchId;
        }
        return "";
      }

      function getSelectedBranchNode() {
        var selectedBranchId = String(state.selectedBranchId || "").trim();
        return selectedBranchId && nodeById[selectedBranchId] ? nodeById[selectedBranchId] : null;
      }

      function isHoverPreviewActive() {
        var hoveredBranchId = String(state.hoveredBranchId || "").trim();
        var selectedBranchId = String(state.selectedBranchId || "").trim();
        return !!hoveredBranchId && !!nodeById[hoveredBranchId] && hoveredBranchId !== selectedBranchId;
      }

      function getFocusMode() {
        if (isHoverPreviewActive()) {
          return "preview";
        }
        if (state.manualSelection && getSelectedBranchNode()) {
          return "pinned";
        }
        return "guided";
      }

      function syncBranchAttention() {
        var effectiveFocusBranchId = getEffectiveFocusBranchId();
        var hoverPreviewActive = isHoverPreviewActive();
        var branchNodes = board.querySelectorAll("[data-branch-id]");
        Array.prototype.forEach.call(branchNodes, function (branchEl) {
          var branchId = String(branchEl.getAttribute("data-branch-id") || "").trim();
          var isSelected = !!branchId && branchId === String(state.selectedBranchId || "").trim();
          var isFocused = !!branchId && branchId === effectiveFocusBranchId;
          var shouldDim = !!effectiveFocusBranchId && hoverPreviewActive && branchId !== effectiveFocusBranchId;
          branchEl.classList.toggle("ct-selected", isSelected);
          branchEl.classList.toggle("ct-highlighted", isFocused);
          branchEl.classList.toggle("ct-dimmed", shouldDim);
        });
      }

      function persistSelectedBranchBase(baseName) {
        writeLocalStorage(branchStorageKey, String(baseName || "").trim());
      }

      function cancelPendingHoverClear() {
        if (container.__homeClusterHoverClearTimer) {
          window.clearTimeout(container.__homeClusterHoverClearTimer);
          container.__homeClusterHoverClearTimer = 0;
        }
      }

      function setSelectedBranch(branchId, options) {
        var nextBranchId = String(branchId || "").trim();
        var opts = options || {};
        if (!nextBranchId || !nodeById[nextBranchId]) {
          return false;
        }
        var nextBranchNode = nodeById[nextBranchId] || {};
        state.selectedBranchId = nextBranchId;
        state.manualSelection = Object.prototype.hasOwnProperty.call(opts, "manual")
          ? !!opts.manual
          : state.manualSelection;
        if (opts.clearHover !== false) {
          state.hoveredBranchId = "";
        }
        if (opts.collapseSiblings !== false) {
          Object.keys(state.expandedBranches).forEach(function (expandedId) {
            if (getTopLevelBranchId(expandedId) !== nextBranchId) {
              delete state.expandedBranches[expandedId];
            }
          });
        }
        state.expandedBranches[nextBranchId] = true;
        if (opts.persist === true || (opts.persist !== false && opts.manual === true)) {
          persistSelectedBranchBase(nextBranchNode.basename || "");
        }
        container.__homeClusterState = state;
        return true;
      }

      function clearSelectedBranch() {
        state.manualSelection = false;
        state.hoveredBranchId = "";
        state.selectedBranchId = "";
        state.expandedBranches = {};
        if (totalNodes <= 30) {
          allBranches.forEach(function (branchNode) {
            if (branchNode && branchNode.id) {
              state.expandedBranches[branchNode.id] = true;
            }
          });
        }
        persistSelectedBranchBase("");
        container.__homeClusterState = state;
        renderHomeClusterMap(container, payload, nodes);
      }

      function setHoveredBranch(branchId) {
        var nextBranchId = String(branchId || "").trim();
        if (!nextBranchId || !nodeById[nextBranchId]) {
          return;
        }
        cancelPendingHoverClear();
        if (state.hoveredBranchId === nextBranchId) {
          return;
        }
        state.hoveredBranchId = nextBranchId;
        container.__homeClusterPendingPreviewBranchId = nextBranchId;
        container.__homeClusterState = state;
        syncBranchAttention();
        renderFocusTrayFromState();
      }

      function clearHoveredBranch(branchId, options) {
        var targetBranchId = String(branchId || "").trim();
        var opts = options || {};
        if (targetBranchId && state.hoveredBranchId !== targetBranchId) {
          return;
        }
        if (!state.hoveredBranchId) {
          return;
        }
        var clearAction = function () {
          container.__homeClusterHoverClearTimer = 0;
          state.hoveredBranchId = "";
          container.__homeClusterPendingPreviewBranchId = "";
          container.__homeClusterState = state;
          syncBranchAttention();
          renderFocusTrayFromState();
        };
        cancelPendingHoverClear();
        if (opts.immediate) {
          clearAction();
          return;
        }
        container.__homeClusterPendingPreviewBranchId = state.hoveredBranchId;
        container.__homeClusterHoverClearTimer = window.setTimeout(clearAction, 160);
      }



      /* --- Helper functions --- */

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

      function getSecondaryCardTitle(node, displayLabel) {

        var catchyTitle = stripCardHierarchySuffix((node && node.catchy_title) || "");
        var fullLabel = stripCardHierarchySuffix(getFullLabel(node));
        var compactLabel = String(displayLabel || getDisplayLabel(node)).replace(/\s+/g, " ").trim();

        if (catchyTitle && normalizeCardTitleForCompare(catchyTitle) !== normalizeCardTitleForCompare(compactLabel)) {
          return catchyTitle;
        }

        if (!fullLabel || normalizeCardTitleForCompare(fullLabel) === normalizeCardTitleForCompare(compactLabel)) {
          return "";
        }

        return fullLabel;

      }

      function getNodeImage(node) {

        return String((node && node.image) || "").trim();

      }

      function getTierRank(tier) {

        var t = String(tier || "balanced").trim().toLowerCase();

        if (t === "sparse") return 0;

        if (t === "balanced") return 1;

        if (t === "dense") return 2;

        return 3;

      }



      /* --- Progressive node sizing --- */

      function mapNodeScaleToClass(scaleToken) {

        var scale = String(scaleToken || "").trim().toLowerCase();

        if (scale === "root") return "ct-node-root";
        if (scale === "xl") return "ct-node-xl";
        if (scale === "lg") return "ct-node-lg";
        if (scale === "md") return "ct-node-md";
        if (scale === "sm") return "ct-node-sm";
        if (scale === "xs") return "ct-node-xs";

        return "";

      }

      function getHintedNodeSizeClass(node, depth, strat) {

        if (!node || typeof node !== "object") {
          return "";
        }

        var hintedScale = String(
          ((width <= 720 ? node.node_size_mode_mobile : node.node_size_mode) || node.node_size_mode || "")
        ).trim().toLowerCase();

        var mapped = mapNodeScaleToClass(hintedScale);
        if (!mapped) {
          return "";
        }

        if (strat === "grid") {
          if (mapped === "ct-node-root") return "ct-node-root";
          if (mapped === "ct-node-xl" || mapped === "ct-node-lg") return "ct-node-md";
        } else if (strat === "cascade" && mapped === "ct-node-xl") {
          return "ct-node-lg";
        }

        return mapped;

      }

      function getNodeSizeClass(depth, strat, node) {

        var hintedClass = getHintedNodeSizeClass(node, depth, strat);
        if (hintedClass) return hintedClass;

        if (depth <= 0) return "ct-node-root";

        if (strat === "fanout") {

          if (depth === 1) {

            if ((width >= 1080 && l1Count <= 6) || (width >= 1280 && l1Count <= 8)) return "ct-node-xl";

            if (width >= 860) return "ct-node-lg";

            return "ct-node-md";

          }

          if (depth === 2) return width >= 1024 ? "ct-node-md" : "ct-node-sm";

          return "ct-node-sm";

        }

        if (strat === "cascade") {

          if (depth === 1) return "ct-node-lg";

          if (depth === 2) return "ct-node-md";

          if (depth === 3) return "ct-node-sm";

          return "ct-node-xs";

        }

        if (strat === "grid") {

          if (depth === 1) return "ct-node-sm";

          return "ct-node-xs";

        }

        /* tree strategy: scale by totalNodes */

        if (totalNodes < 60) {

          if (depth === 1) return "ct-node-lg";

          if (depth === 2) return "ct-node-md";

          if (depth === 3) return "ct-node-sm";

          return "ct-node-xs";

        }

        if (totalNodes < 120) {

          if (depth === 1 && width >= 1320 && l1Count <= 8) return "ct-node-xl";
          if (depth === 1) return "ct-node-md";

          if (depth === 2) return "ct-node-sm";

          return "ct-node-xs";

        }

        if (depth === 1) {
          if (width >= 1460 && l1Count <= 8) return "ct-node-lg";
          if (width >= 1180) return "ct-node-md";
          return "ct-node-sm";
        }

        if (depth === 2) {
          if (width >= 1460) return "ct-node-md";
          return "ct-node-sm";
        }

        if (depth === 3) {
          if (width >= 1520 && totalNodes < 320) return "ct-node-sm";
          return "ct-node-xs";
        }

        return "ct-node-xs";

      }



      /* --- Inline child limits by density and strategy --- */

      function getInlineChildLimit(tier, depth, strat, parentNode) {

        var rank = getTierRank(tier);
        var inSelectedBranch = !shouldPreferFocusedBranch || isNodeInSelectedBranch(parentNode);

        if (shouldPreferFocusedBranch && !inSelectedBranch) {
          return 0;
        }

        if (strat === "grid") {

          return 0; /* grid mode shows children only on expand */

        }

        if (strat === "cascade") {

          if (rank <= 0) return 999;

          if (rank === 1) return 8;

          if (rank === 2) return 4;

          return 2;

        }

        /* tree */

        if (rank <= 0) return 999;

        if (rank === 1) return width >= 960 ? (inSelectedBranch ? 8 : 6) : (inSelectedBranch ? 6 : 4);

        if (rank === 2) return width >= 960 ? (inSelectedBranch ? 5 : 3) : (inSelectedBranch ? 3 : 2);

        return inSelectedBranch ? 2 : 0;

      }



      function getInlineL3Limit(tier, strat, parentNode) {

        if (strat === "grid") return 0;

        var rank = getTierRank(tier);
        var inSelectedBranch = !shouldPreferFocusedBranch || isNodeInSelectedBranch(parentNode);

        if (shouldPreferFocusedBranch && !inSelectedBranch) {
          return 0;
        }

        if (strat === "cascade") {

          if (rank <= 0) return inSelectedBranch ? 8 : 6;

          if (rank === 1) return inSelectedBranch ? 4 : 3;

          return 0;

        }

        if (rank <= 0) return inSelectedBranch ? 6 : 4;

        if (rank === 1) return inSelectedBranch ? 3 : 2;

        return 0;

      }



      /* --- DOM builders --- */

      function makeNode(tag, cls, text) {

        var el = document.createElement(tag || "div");

        if (cls) el.className = cls;

        if (text) el.textContent = text;

        return el;

      }

      function pluralizeWord(value, singular, plural) {
        var numeric = Math.max(0, parseInt(String(value || 0), 10) || 0);
        return String(numeric) + " " + (numeric === 1 ? singular : (plural || singular + "s"));
      }

      function getNodeLevelLabel(node) {
        var explicit = String(node.level_label || "").trim();
        if (explicit) return explicit;
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        if (semantic === "root") return "Overview";
        if (semantic === "l1") return "Topic";
        if (semantic === "l2") return "Section";
        if (semantic === "l3") return "Page";
        return "Page";
      }

      function getNodeMetaLine(node) {
        var count = Math.max(0, parseInt(String(node.count || 0), 10) || 0);
        var childTotal = Math.max(0, parseInt(String(node.child_total || 0), 10) || 0);
        var semantic = String(node.semantic_level || "").trim().toLowerCase();

        if (semantic === "root") {
          return childTotal > 0
            ? (pluralizeWord(count, "page") + " across " + pluralizeWord(childTotal, "section"))
            : pluralizeWord(count, "page");
        }
        if (semantic === "l1") {
          return childTotal > 0
            ? (pluralizeWord(count, "page") + " in " + pluralizeWord(childTotal, "subtopic"))
            : pluralizeWord(count, "page");
        }
        if (semantic === "l2") {
          return childTotal > 0
            ? (pluralizeWord(count, "page") + " with " + pluralizeWord(childTotal, "page"))
            : pluralizeWord(count, "page");
        }
        return count > 1 ? pluralizeWord(count, "page") : "";
      }

      function getNodeSummary(node) {
        var explicit = String(node.summary || node.description || "").trim();
        if (explicit) return explicit;
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        var childTotal = Math.max(0, parseInt(String(node.child_total || 0), 10) || 0);
        if (semantic === "root" && childTotal > 0) {
          return "Start here, then open " + pluralizeWord(childTotal, "main section") + " and related pages.";
        }
        if (semantic === "l1" && childTotal > 0) {
          return "Open " + pluralizeWord(childTotal, "subtopic") + " from this section.";
        }
        if (semantic === "l2" && childTotal > 0) {
          return "This section opens into " + pluralizeWord(childTotal, "page") + ".";
        }
        return "";
      }

      function getRepresentativeSampleScore(node) {
        if (!node) {
          return -1;
        }
        var score = 0;
        var descendantTotal = Math.max(0, parseInt(String(node.descendant_total || 0), 10) || 0);
        var childTotal = Math.max(0, parseInt(String(node.child_total || 0), 10) || 0);
        var densityTier = String(node.density_tier || "balanced").trim().toLowerCase();
        var titleBucket = String(node.title_length_bucket || "").trim().toLowerCase();
        var semanticLevel = String(node.semantic_level || "").trim().toLowerCase();

        if (getNodeImage(node)) {
          score += 20;
        }
        score += Math.min(descendantTotal, 24) * 2;
        score += Math.min(childTotal, 8) * 5;
        score += getNodeSummary(node) ? 8 : 0;
        score += getTierRank(densityTier) * 4;

        if (semanticLevel === "l2") {
          score += 5;
        } else if (semanticLevel === "l3") {
          score += 2;
        }

        if (titleBucket === "medium") {
          score += 3;
        } else if (titleBucket === "long") {
          score += 2;
        } else if (titleBucket === "very-long") {
          score -= 2;
        }

        return score;
      }

      function getRankedRepresentativeNodes(items, limit) {
        var list = Array.prototype.slice.call(items || []);
        list.sort(function (a, b) {
          var scoreDelta = getRepresentativeSampleScore(b) - getRepresentativeSampleScore(a);
          if (scoreDelta !== 0) {
            return scoreDelta;
          }
          var descendantDelta = (parseInt(String(b && b.descendant_total || 0), 10) || 0)
            - (parseInt(String(a && a.descendant_total || 0), 10) || 0);
          if (descendantDelta !== 0) {
            return descendantDelta;
          }
          return String(getFullLabel(a || "")).localeCompare(String(getFullLabel(b || "")));
        });
        var maxItems = Math.max(0, parseInt(String(limit || list.length), 10) || list.length);
        return list.slice(0, maxItems);
      }

      function getFocusGridMode(focusBranch, children) {
        var total = Math.max(0, parseInt(String((children && children.length) || 0), 10) || 0);
        var branchTier = getTierRank(focusBranch && focusBranch.density_tier);
        if (width <= 720) {
          return "stacked";
        }
        if (total <= 2) {
          return "editorial";
        }
        if (total <= 4 && width >= 1180 && branchTier <= 1) {
          return "editorial";
        }
        if (total <= 6 && width >= 980) {
          return "balanced";
        }
        if (total <= 8) {
          return "compact";
        }
        return "list";
      }

      function getFocusChildLimit(gridMode, total) {
        var childTotal = Math.max(0, parseInt(String(total || 0), 10) || 0);
        if (!childTotal) {
          return 0;
        }
        var limit = 2;
        if (gridMode === "editorial") {
          limit = width >= 1320 ? 4 : 3;
        } else if (gridMode === "balanced") {
          limit = width >= 1360 ? 6 : (width >= 980 ? 4 : 3);
        } else if (gridMode === "compact") {
          limit = width >= 1320 ? 6 : 4;
        } else if (gridMode === "list") {
          limit = width >= 1320 ? 8 : 6;
        } else if (gridMode === "stacked") {
          limit = 4;
        }
        if (childTotal <= limit + 1) {
          return childTotal;
        }
        return limit;
      }

      function getFocusCardRole(node, index, total, gridMode) {
        var sizeMode = String(node && node.focus_card_size_mode || "standard").trim().toLowerCase();
        var totalCount = Math.max(1, parseInt(String(total || 1), 10) || 1);
        if (gridMode === "editorial") {
          return index === 0 ? "featured" : "standard";
        }
        if (gridMode === "balanced") {
          if (index === 0 && (sizeMode === "hero" || totalCount >= 3)) {
            return "featured";
          }
          return "standard";
        }
        if (gridMode === "compact") {
          return index === 0 && sizeMode !== "micro" ? "standard" : "compact";
        }
        if (gridMode === "list" || gridMode === "stacked") {
          return index === 0 && sizeMode === "standard" ? "compact" : "micro";
        }
        return "standard";
      }

      function getOverflowNoun(parentNode, count) {
        var overflowCount = Math.max(0, parseInt(String(count || 0), 10) || 0);
        var semanticLevel = String(parentNode && parentNode.semantic_level || "").trim().toLowerCase();
        if (semanticLevel === "root") {
          return overflowCount === 1 ? "section" : "sections";
        }
        if (semanticLevel === "l1") {
          return overflowCount === 1 ? "subtopic" : "subtopics";
        }
        if (semanticLevel === "l2") {
          return overflowCount === 1 ? "page" : "pages";
        }
        return overflowCount === 1 ? "page" : "pages";
      }

      function applyExpandToggleState(toggle, expanded, node) {
        if (!toggle) {
          return;
        }
        var isExpanded = !!expanded;
        var labelBase = getDisplayLabel(node) || "this branch";
        var actionLabel = isExpanded ? "Hide subtopics" : "Show subtopics";
        var icon = toggle.querySelector(".ct-expand-toggle-icon");
        var text = toggle.querySelector(".ct-expand-toggle-text");
        if (icon) {
          icon.textContent = isExpanded ? "\u2212" : "+";
        }
        if (text) {
          text.textContent = isExpanded ? "Hide" : "Expand";
        }
        toggle.title = actionLabel;
        toggle.setAttribute("aria-label", actionLabel + " for " + labelBase);
        toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        toggle.setAttribute("data-toggle-state", isExpanded ? "expanded" : "collapsed");
      }

      function createExpandToggle(node, expanded) {
        var toggle = makeNode("button", "ct-expand-toggle");
        toggle.type = "button";
        toggle.appendChild(makeNode("span", "ct-expand-toggle-icon", expanded ? "\u2212" : "+"));
        toggle.appendChild(makeNode("span", "ct-expand-toggle-text", expanded ? "Hide" : "Expand"));
        applyExpandToggleState(toggle, expanded, node);
        return toggle;
      }

      function scheduleClusterRerender() {
        if (container.__homeClusterRenderTimer) {
          window.clearTimeout(container.__homeClusterRenderTimer);
        }
        if (container.__homeClusterRenderFrame && typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(container.__homeClusterRenderFrame);
        }
        container.__homeClusterRenderFrame = 0;
        container.__homeClusterRenderTimer = 0;
        var rerender = function () {
          container.__homeClusterRenderTimer = 0;
          renderHomeClusterMap(container, payload, nodes);
        };
        if (typeof window.requestAnimationFrame === "function") {
          container.__homeClusterRenderFrame = window.requestAnimationFrame(function () {
            container.__homeClusterRenderFrame = 0;
            container.__homeClusterRenderTimer = window.setTimeout(rerender, 0);
          });
        } else {
          container.__homeClusterRenderTimer = window.setTimeout(rerender, 0);
        }
      }

      function toggleBranchExpansion(nodeId, toggle) {
        var targetId = String(nodeId || "").trim();
        if (!targetId || !nodeById[targetId]) {
          return;
        }
        var isExpanded = !state.expandedBranches[targetId];
        if (isExpanded) {
          state.expandedBranches[targetId] = true;
        } else {
          delete state.expandedBranches[targetId];
        }
        container.__homeClusterState = state;
        applyExpandToggleState(toggle, isExpanded, nodeById[targetId]);
        scheduleClusterRerender();
      }

      function getOverflowLabel(parentNode, count, options) {
        var overflowCount = Math.max(0, parseInt(String(count || 0), 10) || 0);
        var opts = options || {};
        var noun = getOverflowNoun(parentNode, overflowCount);
        if (opts.compact) {
          return "+" + String(overflowCount) + " " + noun;
        }
        return String(overflowCount) + " more " + noun;
      }

      function buildClusterMedia(node) {
        var imageSrc = getNodeImage(node);
        var media = makeNode("a", "home-cluster-card-media");
        media.href = String(node.url || "#");
        media.title = getFullLabel(node);
        if (imageSrc) {
          var image = document.createElement("img");
          image.src = imageSrc;
          image.alt = "";
          image.loading = "lazy";
          image.decoding = "async";
          media.appendChild(image);
          return media;
        }
        media.classList.add("home-cluster-card-placeholder");
        media.appendChild(
          makeNode(
            "span",
            "home-cluster-card-initial",
            String(getFullLabel(node) || "U").slice(0, 1).toUpperCase()
          )
        );
        return media;
      }

      function buildFocusChildCard(node, options) {
        var card = makeNode("article", "home-cluster-card home-cluster-card-l2");
        var opts = options || {};
        var tier = String(node.density_tier || "").trim().toLowerCase();
        var sizeMode = String(
          ((width <= 720 ? node.focus_card_size_mode_mobile : node.focus_card_size_mode) || node.focus_card_size_mode || "standard")
        ).trim().toLowerCase() || "standard";
        var cardRole = String(opts.role || "standard").trim().toLowerCase() || "standard";
        if (tier) {
          card.classList.add("is-tier-" + tier);
        }
        card.classList.add("is-size-" + sizeMode);
        card.classList.add("is-role-" + cardRole);
        card.setAttribute("data-size-mode", sizeMode);
        card.setAttribute("data-card-role", cardRole);

        var showMedia = cardRole !== "micro";
        var showSummary = cardRole === "featured" || cardRole === "standard";
        var showDeepList = cardRole !== "micro";

        if (showMedia) {
          card.appendChild(buildClusterMedia(node));
        }

        var metaRow = makeNode("div", "home-cluster-card-meta-row");
        var badgeText = parseInt(String(node.count || 0), 10) > 1
          ? pluralizeWord(node.count || 0, "page")
          : getNodeLevelLabel(node);
        metaRow.appendChild(makeNode("span", "home-cluster-count-badge", badgeText));
        metaRow.appendChild(makeNode("span", "home-cluster-card-meta", getNodeMetaLine(node) || getNodeLevelLabel(node)));
        card.appendChild(metaRow);

        var title = makeNode("h3", "home-cluster-card-title");
        var titleLink = makeNode("a", "home-cluster-title-link", getDisplayLabel(node));
        titleLink.href = String(node.url || "#");
        titleLink.title = getFullLabel(node);
        title.appendChild(titleLink);
        card.appendChild(title);

        var summary = getNodeSummary(node);
        if (summary && showSummary) {
          card.appendChild(makeNode("p", "home-cluster-node-summary", summary));
        }

        var deepChildren = childrenByParent[node.id] || [];
        if (showDeepList && deepChildren.length > 0) {
          var deepList = makeNode("div", "home-cluster-l3-list");
          var deepLimit = 0;
          if (cardRole === "featured" || sizeMode === "hero") {
            deepLimit = width >= 1240 ? 5 : (width >= 900 ? 4 : 3);
          } else if (cardRole === "standard" || sizeMode === "standard") {
            deepLimit = width >= 1240 ? 4 : (width >= 900 ? 3 : 2);
          } else if (cardRole === "compact" || sizeMode === "compact") {
            deepLimit = width >= 900 ? 3 : 2;
          } else {
            deepLimit = 0;
          }
          if (deepLimit > 0) {
            getRankedRepresentativeNodes(deepChildren, deepLimit).forEach(function (deepNode) {
              var deepLink = makeNode("a", "home-cluster-card-l3", getDisplayLabel(deepNode));
              deepLink.href = String(deepNode.url || "#");
              deepLink.title = getFullLabel(deepNode);
              deepList.appendChild(deepLink);
            });
            if (deepChildren.length > deepLimit) {
              deepList.appendChild(
                makeNode(
                  "span",
                  "home-cluster-card-l3",
                  getOverflowLabel(node, deepChildren.length - deepLimit, { compact: true })
                )
              );
            }
          }
          if (deepList.childNodes.length > 0) {
            card.appendChild(deepList);
          }
        }

        return card;
      }

      function renderFocusTrayFromState() {
        if (!focusTray) {
          return;
        }

        var focusBranchId = getEffectiveFocusBranchId();
        var focusBranch = focusBranchId ? nodeById[focusBranchId] : null;
        var selectedBranch = getSelectedBranchNode();
        var isPreview = isHoverPreviewActive();
        var isPinned = !!(state.manualSelection && selectedBranch && selectedBranch.id === focusBranchId && !isPreview);
        var focusMode = getFocusMode();
        if (!focusBranch || (!isPreview && !state.manualSelection)) {
          focusTray.innerHTML = "";
          focusTray.hidden = true;
          focusTray.removeAttribute("data-home-cluster-focus-mode");
          return;
        }

        focusTray.innerHTML = "";
        focusTray.hidden = false;
        focusTray.setAttribute("data-home-cluster-focus-mode", focusMode);

        var head = makeNode("div", "home-cluster-focus-head");
        var text = makeNode("div", "home-cluster-focus-text");
        var breadcrumbs = makeNode("nav", "home-cluster-focus-breadcrumbs");
        breadcrumbs.setAttribute("aria-label", getUiString("cluster-focus-path", "Cluster focus path"));
        var overviewCrumb = makeNode("button", "home-cluster-focus-crumb home-cluster-focus-crumb-button", getUiString("overview", "Overview"));
        overviewCrumb.type = "button";
        overviewCrumb.addEventListener("click", clearSelectedBranch);
        breadcrumbs.appendChild(overviewCrumb);
        if (selectedBranch) {
          breadcrumbs.appendChild(makeNode("span", "home-cluster-focus-crumb-sep", "/"));
          if (selectedBranch.id === focusBranchId && !isPreview) {
            breadcrumbs.appendChild(
              makeNode("span", "home-cluster-focus-crumb home-cluster-focus-crumb-current", getDisplayLabel(selectedBranch))
            );
          } else {
            var selectedCrumb = makeNode(
              "button",
              "home-cluster-focus-crumb home-cluster-focus-crumb-button home-cluster-focus-crumb-selected",
              getDisplayLabel(selectedBranch)
            );
            selectedCrumb.type = "button";
            selectedCrumb.addEventListener("click", function () {
              if (setSelectedBranch(selectedBranch.id, { manual: true })) {
                renderHomeClusterMap(container, payload, nodes);
              }
            });
            breadcrumbs.appendChild(selectedCrumb);
          }
        }
        if (!selectedBranch || selectedBranch.id !== focusBranchId) {
          breadcrumbs.appendChild(makeNode("span", "home-cluster-focus-crumb-sep", "/"));
          breadcrumbs.appendChild(
            makeNode("span", "home-cluster-focus-crumb home-cluster-focus-crumb-current", getDisplayLabel(focusBranch))
          );
        }
        text.appendChild(breadcrumbs);

        var modeLabel = getUiString("active-branch", "Active branch");
        if (isPreview) {
          modeLabel = isVertical ? getUiString("preview-branch", "Preview branch") : getUiString("hover-preview", "Hover preview");
        } else if (isPinned) {
          modeLabel = isVertical ? getUiString("selected-branch", "Selected branch") : getUiString("pinned-branch", "Pinned branch");
        } else if (state.manualSelection) {
          modeLabel = getUiString("selected-branch", "Selected branch");
        }
        var headKicker = makeNode(
          "p",
          "home-cluster-kicker",
          modeLabel
        );
        text.appendChild(headKicker);

        if (isPreview && selectedBranch) {
          text.appendChild(
            makeNode(
              "p",
              "home-cluster-focus-context",
              formatUiString(
                "previewing-focus-selected-template",
                "Previewing {focus} while {selected} stays selected.",
                {
                  focus: getDisplayLabel(focusBranch),
                  selected: getDisplayLabel(selectedBranch)
                }
              )
            )
          );
        } else if (isPinned) {
          text.appendChild(
            makeNode(
              "p",
              "home-cluster-focus-context",
              isVertical
          ? getUiString("vertical-selected-branch-hint", "Tap another branch to switch the selection, or open a page from this branch.")
                : getUiString("horizontal-pinned-branch-hint", "Click another branch to pin it, or hover to preview without leaving this branch.")
            )
          );
        } else {
          text.appendChild(
            makeNode(
              "p",
              "home-cluster-focus-context",
              isVertical
                ? getUiString("vertical-branch-card-hint", "Tap a branch card to open its subtopics here.")
                : getUiString("horizontal-branch-card-hint", "Hover to preview a branch, then click to pin it in place.")
            )
          );
        }

        var headTitle = makeNode("h3", "home-cluster-focus-title");
        var headTitleLink = makeNode("a", "home-cluster-title-link", getFullLabel(focusBranch));
        headTitleLink.href = String(focusBranch.url || "#");
        headTitleLink.title = getFullLabel(focusBranch);
        headTitle.appendChild(headTitleLink);
        text.appendChild(headTitle);

        var focusMeta = getNodeMetaLine(focusBranch);
        if (focusMeta) {
          text.appendChild(makeNode("p", "home-cluster-focus-meta", focusMeta));
        }
        head.appendChild(text);

        var actions = makeNode("div", "home-cluster-focus-actions");
        if (isPreview) {
          var pinButton = makeNode("button", "home-cluster-action", getUiString("pin-branch", "Pin Branch"));
          pinButton.type = "button";
          pinButton.addEventListener("click", function () {
            if (setSelectedBranch(focusBranch.id, { manual: true })) {
              renderHomeClusterMap(container, payload, nodes);
            }
          });
          actions.appendChild(pinButton);
        }
        if (isPreview && selectedBranch) {
          var backToPinnedButton = makeNode("button", "home-cluster-action", getUiString("back-to-pinned", "Back to Pinned"));
          backToPinnedButton.type = "button";
          backToPinnedButton.addEventListener("click", function () {
            clearHoveredBranch(focusBranch.id, { immediate: true });
          });
          actions.appendChild(backToPinnedButton);
        }
        if (state.manualSelection) {
          var closeButton = makeNode("button", "home-cluster-focus-close", getUiString("back-to-overview", "Back to Overview"));
          closeButton.type = "button";
          closeButton.addEventListener("click", clearSelectedBranch);
          actions.appendChild(closeButton);
        }
        if (actions.childNodes.length > 0) {
          head.appendChild(actions);
        }

        focusTray.appendChild(head);

        var focusSummary = getNodeSummary(focusBranch);
        if (focusSummary) {
          focusTray.appendChild(makeNode("p", "home-cluster-node-summary", focusSummary));
        }

        var focusChildren = childrenByParent[focusBranch.id] || [];
        if (!focusChildren.length) {
          return;
        }

        var focusGrid = makeNode("div", "home-cluster-focus-grid");
        var gridMode = getFocusGridMode(focusBranch, focusChildren);
        focusGrid.setAttribute("data-grid-mode", gridMode);
        var childLimit = getFocusChildLimit(gridMode, focusChildren.length);
        var rankedFocusChildren = getRankedRepresentativeNodes(focusChildren, childLimit);
        rankedFocusChildren.forEach(function (childNode, childIndex) {
          focusGrid.appendChild(
            buildFocusChildCard(childNode, {
              role: getFocusCardRole(childNode, childIndex, rankedFocusChildren.length, gridMode),
              gridMode: gridMode
            })
          );
        });

        if (focusChildren.length > childLimit) {
          var overflow = makeNode(
            "a",
            "home-cluster-overflow home-cluster-overflow-l2",
            getOverflowLabel(focusBranch, focusChildren.length - childLimit, { compact: true })
          );
          overflow.href = String(focusBranch.url || "#");
          overflow.title = "Open " + getFullLabel(focusBranch) + " for " + getOverflowLabel(focusBranch, focusChildren.length - childLimit);
          overflow.setAttribute("aria-label", overflow.title);
          focusGrid.appendChild(overflow);
        }

        focusTray.appendChild(focusGrid);
      }

      function bindBranchInteractions(target, branchNode, options) {
        if (!target || !branchNode || !branchNode.id) {
          return;
        }
        var opts = options || {};
        var branchId = String(branchNode.id);

        target.addEventListener("mouseenter", function () {
          setHoveredBranch(branchId);
        });
        target.addEventListener("mouseleave", function () {
          clearHoveredBranch(branchId);
        });
        target.addEventListener("focusin", function () {
          setHoveredBranch(branchId);
        });
        target.addEventListener("focusout", function (event) {
          if (!target.contains(event.relatedTarget)) {
            clearHoveredBranch(branchId);
          }
        });

        if (!opts.selectOnClick) {
          return;
        }
        target.addEventListener("click", function (event) {
          if (event.target && event.target.closest) {
            if (event.target.closest("a") || event.target.closest("button.ct-expand-toggle")) {
              return;
            }
          }
          if (setSelectedBranch(branchId, { manual: true })) {
            renderHomeClusterMap(container, payload, nodes);
          }
        });
      }

      function shouldShowNodeKicker(node, sizeClass) {
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        return sizeClass === "ct-node-root"
          || sizeClass === "ct-node-xl"
          || (semantic === "l1" && sizeClass !== "ct-node-sm")
          || (semantic === "l2" && sizeClass === "ct-node-lg");
      }

      function shouldShowNodeSummary(node, sizeClass) {
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        if (sizeClass === "ct-node-root" || sizeClass === "ct-node-xl") return true;
        if (semantic === "l1") return sizeClass === "ct-node-lg" || sizeClass === "ct-node-md";
        if (semantic === "l2") return sizeClass === "ct-node-lg";
        return false;
      }

      function shouldShowNodeMeta(node, sizeClass) {
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        if (sizeClass === "ct-node-root" || sizeClass === "ct-node-xl" || sizeClass === "ct-node-lg") return true;
        if ((semantic === "l1" || semantic === "l2") && sizeClass === "ct-node-md") return true;
        return false;
      }

      function shouldShowCountLabel(node, sizeClass) {
        var semantic = String(node.semantic_level || "").trim().toLowerCase();
        if (sizeClass === "ct-node-root" || sizeClass === "ct-node-xl") return true;
        if ((semantic === "l1" || semantic === "l2") && sizeClass !== "ct-node-sm") return true;
        return false;
      }



      function buildTreeNodeBubble(node, sizeClass) {

        var bubble = makeNode("div", "ct-node " + (sizeClass || "ct-node-md"));

        applyHomeClusterNodeMeta(bubble, node);
        bubble.setAttribute("data-node-id", String(node.id || ""));

        var link = makeNode("a", "ct-node-link");

        link.href = String(node.url || "#");

        link.title = getFullLabel(node);

        link.setAttribute("aria-label", "Open page: " + getFullLabel(node));



        /* thumbnail or initial */

        var imgSrc = getNodeImage(node);

        var showThumb = sizeClass !== "ct-node-xs";

        if (imgSrc && showThumb) {

          var thumb = makeNode("div", "ct-node-thumb");

          var img = document.createElement("img");

          img.src = imgSrc;

          img.alt = "";

          img.loading = "lazy";

          img.decoding = "async";

          thumb.appendChild(img);

          link.appendChild(thumb);

        } else if (showThumb) {

          var initial = makeNode("span", "ct-node-initial", String(getFullLabel(node) || "U").slice(0, 1).toUpperCase());

          link.appendChild(initial);

        }

        var content = makeNode("span", "ct-node-content");

        if (shouldShowNodeKicker(node, sizeClass)) {
          content.appendChild(makeNode("span", "ct-node-kicker", getNodeLevelLabel(node)));
        }



        var labelText = (sizeClass === "ct-node-root")
          ? getFullLabel(node)
          : getDisplayLabel(node);

        var label = makeNode("span", "ct-node-label", labelText);

        content.appendChild(label);

        var secondaryTitle = getSecondaryCardTitle(node, labelText);
        if (secondaryTitle && sizeClass !== "ct-node-root") {
          content.appendChild(makeNode("span", "ct-node-title-full", secondaryTitle));
        }

        var summaryText = getNodeSummary(node);
        if (summaryText && shouldShowNodeSummary(node, sizeClass)) {
          content.appendChild(makeNode("span", "ct-node-summary", summaryText));
        }

        var metaText = getNodeMetaLine(node);
        if (metaText && shouldShowNodeMeta(node, sizeClass)) {
          content.appendChild(makeNode("span", "ct-node-meta", metaText));
        }

        link.appendChild(content);

        bubble.appendChild(link);



        /* count badge */

        var count = parseInt(String(node.count || 0), 10);

        var childTotal = parseInt(String(node.child_total || 0), 10);

        if (count > 1 || childTotal > 0) {

          var badgeText = shouldShowCountLabel(node, sizeClass)
          ? pluralizeWord(count || 1, "page")
            : String(count || 1);
          var badge = makeNode("span", "ct-node-badge", badgeText);

        badge.title = getNodeMetaLine(node) || (String(count) + " pages in this section");
          badge.setAttribute("aria-label", badge.title);

          bubble.appendChild(badge);

        }



        /* node size encoding */

        var descendantTotal = parseInt(String(node.descendant_total || 0), 10);

        if (descendantTotal >= 20) {

          bubble.classList.add("ct-node-heavy");

        } else if (descendantTotal >= 8) {

          bubble.classList.add("ct-node-medium");

        }



        return bubble;

      }



      function buildClusterDot(count, parentUrl, parentNode, options) {

        var dot = makeNode("a", "ct-cluster-dot");
        var compactLabel = getOverflowLabel(parentNode, count, { compact: true });
        var fullLabel = getOverflowLabel(parentNode, count, options);

        dot.href = String(parentUrl || "#");

        dot.title = fullLabel;
        dot.setAttribute("aria-label", fullLabel);

        dot.textContent = compactLabel;

        return dot;

      }

      function getFanoutColumnCount(count, availableWidth) {

        var branchCount = Math.max(1, parseInt(String(count || 1), 10) || 1);

        var usableWidth = Math.max(320, parseInt(String(availableWidth || width || 0), 10) || 320);

        if (usableWidth <= 720) {
          return 1;
        }

        var minCardWidth = branchCount <= 3 ? 320 : (branchCount <= 6 ? 290 : (branchCount <= 8 ? 238 : 214));
        if (multiRootExplorerFanout) {
          minCardWidth = branchCount >= 10 ? 268 : 248;
        }

        var columns = Math.max(1, Math.floor((usableWidth - 56) / minCardWidth));

        if (branchCount >= 9 && usableWidth >= 1480) {

          columns = Math.max(columns, 5);

        } else if (branchCount >= 7 && usableWidth >= 1180) {

          columns = Math.max(columns, 4);

        } else if (usableWidth >= 880) {

          columns = Math.max(columns, 3);

        } else if (usableWidth >= 620) {

          columns = Math.max(columns, 2);

        }

        if (multiRootExplorerFanout) {
          columns = Math.min(columns, usableWidth >= 1680 ? 4 : 3);
        }

        if (branchCount <= 4) {

          columns = Math.min(columns, 2);

        } else if (branchCount <= 6) {

          columns = Math.min(columns, 3);

        } else if (branchCount <= 8) {

          columns = Math.min(columns, 4);

        } else if (branchCount <= 12) {

          columns = Math.min(columns, 5);

        }

        return Math.max(1, Math.min(branchCount, columns));

      }

      function buildFanoutCard(branchNode, index) {

        var item = makeNode("div", "ct-fanout-item");

        item.setAttribute("data-branch-id", branchNode.id);

        item.setAttribute("data-branch-index", String(index));

        var bubble = buildTreeNodeBubble(branchNode, getNodeSizeClass(1, "fanout", branchNode));

        bubble.classList.add("ct-fanout-node");

        item.appendChild(bubble);
        bindBranchInteractions(item, branchNode, { selectOnClick: true });

        return item;

      }

      function getTreeColumnCount(branchCount, usableWidth, options) {
        var total = Math.max(1, parseInt(String(branchCount || 1), 10) || 1);
        var widthValue = Math.max(320, parseInt(String(usableWidth || width || 0), 10) || 320);
        var opts = options || {};
        var focusedBranchMode = !!opts.focusedBranchMode;
        var deepTree = !!opts.deepTree;

        if (total <= 1) return 1;

        if (widthValue >= 1560) {
          if (focusedBranchMode) {
            return Math.min(total, total >= 7 ? 4 : 3);
          }
          if (!deepTree && total >= 8) {
            return Math.min(total, 4);
          }
          if (total >= 5) {
            return Math.min(total, 3);
          }
          return Math.min(total, 2);
        }

        if (widthValue >= 1280) {
          if (focusedBranchMode) {
            return Math.min(total, total >= 5 ? 3 : 2);
          }
          if (!deepTree && total >= 7) {
            return Math.min(total, 3);
          }
          if (total >= 4) {
            return 2;
          }
          return 1;
        }

        if (widthValue >= 1024) {
          if (focusedBranchMode && total >= 5) {
            return 2;
          }
          if (total >= 6 && !deepTree) {
            return 2;
          }
        }

        return 1;
      }

      function getTreeBranchSpan(branchNode, treeColumns) {
        var columns = Math.max(1, parseInt(String(treeColumns || 1), 10) || 1);
        if (columns <= 1 || !branchNode) {
          return "regular";
        }

        var branchId = String(branchNode.id || "").trim();
        var isSelectedBranch = branchId && branchId === String(state.selectedBranchId || "").trim();
        var childCount = (childrenByParent[branchId] || []).length;
        var subtreeShape = branchNode.subtree_shape && typeof branchNode.subtree_shape === "object"
          ? branchNode.subtree_shape
          : {};
        var subtreeDepth = Math.max(0, parseInt(String(subtreeShape.max_depth || 0), 10) || 0);

        if (isSelectedBranch && shouldPreferFocusedBranch && childCount > 0) {
          return "full";
        }

        if (columns >= 3 && childCount >= 5 && subtreeDepth >= 2) {
          return "wide";
        }

        return "regular";
      }

      function getSubtreeLayout(parentNode, childDepth, childCount) {

        var hintedLayout = String((parentNode && parentNode.preferred_subtree_layout) || "").trim().toLowerCase();
        if (hintedLayout === "card-grid" || hintedLayout === "chip-grid") {
          if (strategy === "grid") {
            return "tree";
          }
          return hintedLayout;
        }

        var total = Math.max(0, parseInt(String(childCount || ((parentNode && parentNode.subtree_shape && parentNode.subtree_shape.child_count) || 0)), 10) || 0);

        if (!total) return "tree";

        if (strategy === "grid") return "tree";

        var localDepth = parseInt(String((parentNode && parentNode.subtree_shape && parentNode.subtree_shape.max_depth) || 0), 10);
        var localBreadth = parseInt(String((parentNode && parentNode.subtree_shape && parentNode.subtree_shape.max_breadth) || total), 10);

        if (childDepth === 2) {

          if (total <= 4 && width >= 760) return "card-grid";

          if (total <= 8 && width >= 1080 && String(parentNode.semantic_level || "") === "l1") {

            return "card-grid";

          }

          if (localDepth >= 2 && localBreadth <= 12 && total <= 6 && width >= 1240) {

            return "card-grid";

          }

          if (total <= 12 && width >= 1320 && String(parentNode.semantic_level || "") === "l1") {

            return "card-grid";

          }

        }

        if (childDepth >= 3 && total <= 6 && localDepth <= 2 && width >= 900) {

          return "chip-grid";

        }

        return "tree";

      }

      function buildSubtreeChipList(parentNode, children, maxVisible) {

        var chipList = makeNode("div", "ct-subtree-chip-list");
        chipList.setAttribute("data-ct-subtree-layout", "chip-grid");
        if (parentNode && parentNode.id) {
          chipList.setAttribute("data-parent-id", String(parentNode.id));
        }

        var visible = Math.max(0, parseInt(String(maxVisible || children.length), 10) || children.length);

        children.slice(0, visible).forEach(function (child) {

          var chip = makeNode("a", "ct-subtree-chip", getDisplayLabel(child));

          chip.href = String(child.url || "#");

          chip.title = getFullLabel(child);

          chipList.appendChild(chip);

        });

        if (children.length > visible) {

          chipList.appendChild(buildClusterDot(children.length - visible, parentNode.url, parentNode));

        }

        return chipList;

      }

      function buildSubtreeGrid(parentNode, children, childDepth, expanded, tier) {

        var grid = makeNode("div", "ct-subtree-grid ct-subtree-grid-l" + Math.min(childDepth, 4));
        grid.setAttribute("data-ct-subtree-layout", "card-grid");
        if (parentNode && parentNode.id) {
          grid.setAttribute("data-parent-id", String(parentNode.id));
        }

        var inlineLimit = expanded ? children.length : Math.min(children.length, childDepth === 2 ? 8 : 6);

        children.slice(0, inlineLimit).forEach(function (child) {

          var card = makeNode("div", "ct-subtree-card");

          var cardBubble = buildTreeNodeBubble(child, getNodeSizeClass(childDepth, strategy, child));

          cardBubble.classList.add("ct-subtree-node");

          card.appendChild(cardBubble);

          var subChildren = childrenByParent[child.id] || [];

          if (subChildren.length > 0) {

            var isChildExpanded = !!state.expandedBranches[child.id];

            var subToggle = createExpandToggle(child, isChildExpanded);

            (function (nodeId) {

              subToggle.addEventListener("click", function (event) {

                event.preventDefault();

                event.stopPropagation();

                toggleBranchExpansion(nodeId, subToggle);

              });

            })(child.id);

            cardBubble.appendChild(subToggle);

            if (isChildExpanded || subChildren.length <= getInlineL3Limit(tier, strategy, child)) {

              card.appendChild(buildSubtreeChipList(child, subChildren, isChildExpanded ? subChildren.length : 4));

            }

          }

          grid.appendChild(card);

        });

        if (children.length > inlineLimit && !expanded) {

          var overflowCard = makeNode("div", "ct-subtree-card ct-subtree-card-overflow");

          overflowCard.appendChild(buildClusterDot(children.length - inlineLimit, parentNode.url, parentNode));

          grid.appendChild(overflowCard);

        }

        return grid;

      }



      /* --- Recursive child builder for any depth --- */

      function buildChildrenRecursive(parentNode, depth, expanded) {

        var children = childrenByParent[parentNode.id] || [];

        if (!children.length) return null;

        var tier = String(parentNode.density_tier || "balanced");

        var limit;

        if (depth <= 2) {

          limit = expanded ? children.length : getInlineChildLimit(tier, depth, strategy, parentNode);

        } else {

          limit = expanded ? children.length : getInlineL3Limit(tier, strategy, parentNode);

        }

        if (limit <= 0 && !expanded) return null;



        var childDepthForLayout = parseInt(String(depth || 0), 10) + 1;

        var subtreeLayout = getSubtreeLayout(parentNode, childDepthForLayout, children.length);

        if (subtreeLayout === "card-grid") {

          return buildSubtreeGrid(parentNode, children, childDepthForLayout, expanded, tier);

        }

        if (subtreeLayout === "chip-grid") {

          return buildSubtreeChipList(parentNode, children, expanded ? children.length : Math.min(children.length, 6));

        }

        var groupClass = depth <= 2 ? "ct-l2-group" : "ct-l3-group";

        var wrap = makeNode("div", groupClass);
        wrap.setAttribute("data-ct-subtree-layout", "tree");
        wrap.setAttribute("data-ct-child-depth", String(childDepthForLayout));
        if (parentNode && parentNode.id) {
          wrap.setAttribute("data-parent-id", String(parentNode.id));
        }

        var shown = children.slice(0, Math.min(limit, children.length));



        shown.forEach(function (child) {

          var childDepth = parseInt(String(child.depth || depth + 1), 10);

          var sizeClass = getNodeSizeClass(childDepth, strategy, child);

          var childRow = makeNode("div", "ct-tree-row ct-tree-row-l" + Math.min(childDepth, 4));

          if (strategy !== "cascade") {

            childRow.appendChild(makeNode("span", "ct-connector ct-connector-h", ""));

          }

          var childBubble = buildTreeNodeBubble(child, sizeClass);

          childRow.appendChild(childBubble);



          /* recursively build grandchildren */

          var isChildExpanded = !!state.expandedBranches[child.id];

          var subChildren = childrenByParent[child.id] || [];

          if (subChildren.length > 0) {

            /* add expand toggle */

            var subToggle = createExpandToggle(child, isChildExpanded);

            (function (nodeId) {

              subToggle.addEventListener("click", function (event) {

                event.preventDefault();

                event.stopPropagation();

                toggleBranchExpansion(nodeId, subToggle);

              });

            })(child.id);

            childBubble.appendChild(subToggle);

          }



          if (isChildExpanded || (subChildren.length > 0 && subChildren.length <= getInlineL3Limit(tier, strategy, child))) {

            var subGroup = buildChildrenRecursive(child, childDepth, isChildExpanded);

            if (subGroup) {

              if (strategy !== "cascade") {

                childRow.appendChild(makeNode("span", "ct-connector ct-connector-h", ""));

              }

              childRow.appendChild(subGroup);

            }

          }



          wrap.appendChild(childRow);

        });



        if (children.length > limit && !expanded) {

          var overflowRow = makeNode("div", "ct-tree-row ct-tree-row-l" + Math.min(depth + 1, 4));

          if (strategy !== "cascade") {

            overflowRow.appendChild(makeNode("span", "ct-connector ct-connector-h", ""));

          }

          overflowRow.appendChild(buildClusterDot(children.length - limit, parentNode.url, parentNode));

          wrap.appendChild(overflowRow);

        }

        return wrap;

      }



      /* --- L1 branch row builder --- */

      function buildBranchRow(branchNode, index) {

        var isSelectedBranch = String(state.selectedBranchId || "").trim() === String(branchNode.id || "").trim();

        var sizeClass = getNodeSizeClass(1, strategy, branchNode);

        var row = makeNode("div", "ct-tree-row ct-tree-row-l1");

        row.setAttribute("data-branch-id", branchNode.id);

        row.setAttribute("data-branch-index", String(index));



        if (strategy !== "cascade") {

          row.appendChild(makeNode("span", "ct-connector ct-connector-h ct-connector-root", ""));

        }



        var l1Bubble = buildTreeNodeBubble(branchNode, sizeClass);

        row.appendChild(l1Bubble);



        bindBranchInteractions(row, branchNode, { selectOnClick: true });



        return row;

      }



      /* --- Grid pill builder (compact grid mode) --- */

      function buildGridPill(branchNode, index) {
        var isSelectedBranch = String(state.selectedBranchId || "").trim() === String(branchNode.id || "").trim();
        var descendantTotal = parseInt(String(branchNode.descendant_total || 0), 10);

        /* tag-cloud sizing: heavy branches get bigger pills */
        var pillSizeClass = "";
        if (descendantTotal >= 20) {
          pillSizeClass = " ct-grid-pill-lg";
        } else if (descendantTotal >= 8) {
          pillSizeClass = " ct-grid-pill-md";
        }

        var pill = makeNode("div", "ct-grid-pill" + pillSizeClass + (isSelectedBranch ? " ct-grid-pill-selected" : ""));
        pill.setAttribute("data-branch-id", branchNode.id);

        /* use larger node for heavy pills */
        var sizeClass = descendantTotal >= 20 ? "ct-node-md" : getNodeSizeClass(1, strategy, branchNode);
        var bubble = buildTreeNodeBubble(branchNode, sizeClass);
        pill.appendChild(bubble);
        bindBranchInteractions(pill, branchNode, { selectOnClick: true });

        return pill;
      }



      /* === RENDER === */

      board.innerHTML = "";
      board.classList.remove("ct-layout-fanout", "ct-layout-cascade", "ct-layout-grid", "ct-layout-tree", "ct-vertical", "ct-horizontal");

      if (focusTray) {

        focusTray.innerHTML = "";

        focusTray.hidden = true;

      }



      container.setAttribute("data-ct-strategy", strategy);
      container.setAttribute("data-ct-auto-strategy", autoStrategy);
      syncClusterLabels(strategy);

      board.classList.toggle("ct-vertical", isVertical);

      board.classList.toggle("ct-horizontal", !isVertical);



      /* Keep the synthetic root in data for layout/state, but do not draw a
         visible root card above the actual map contents. */



      if (strategy === "fanout") {

        /* --- CENTERED ROOT + RESPONSIVE CHILD FANOUT --- */

        board.classList.add("ct-layout-fanout");

        var fanoutWrap = makeNode("div", "ct-fanout-wrap");

        var fanoutGrid = makeNode("div", "ct-fanout-grid");
        var fanoutColumns = getFanoutColumnCount(l1Count, width);
        fanoutGrid.style.setProperty("--ct-fanout-columns", String(fanoutColumns));
        fanoutGrid.setAttribute("data-ct-columns", String(fanoutColumns));
        fanoutGrid.setAttribute("data-ct-subtree-layout", "fanout-grid");

        allBranches.forEach(function (branchNode, index) {

          fanoutGrid.appendChild(buildFanoutCard(branchNode, index));

        });

        fanoutWrap.appendChild(fanoutGrid);

        board.appendChild(fanoutWrap);



      } else if (strategy === "cascade") {

        /* --- VERTICAL CASCADE --- */

        board.classList.add("ct-layout-cascade");

        var cascadeWrap = makeNode("div", "ct-cascade-levels");

        var branchLevel = makeNode("div", "ct-cascade-row");

        allBranches.forEach(function (branchNode, index) {

          var branchItem = makeNode("div", "ct-cascade-item");

          branchItem.appendChild(buildBranchRow(branchNode, index));

          branchLevel.appendChild(branchItem);

        });

        cascadeWrap.appendChild(branchLevel);

        board.appendChild(cascadeWrap);



      } else if (strategy === "grid") {

        /* --- COMPACT GRID --- */

        board.classList.add("ct-layout-grid");

        var gridWrap = makeNode("div", "ct-grid-wrap");
        gridWrap.setAttribute("data-ct-subtree-layout", "top-level-grid");

        var maxPills = l1Count <= 50 ? l1Count : Math.min(60, l1Count);

        var shownBranches = allBranches.slice(0, maxPills);

        shownBranches.forEach(function (branchNode, index) {

          gridWrap.appendChild(buildGridPill(branchNode, index));

        });

        if (allBranches.length > maxPills) {

          gridWrap.appendChild(buildClusterDot(allBranches.length - maxPills, rootNode.url, rootNode));

        }

        board.appendChild(gridWrap);



      } else {

        /* --- HORIZONTAL TREE --- */

        board.classList.add("ct-layout-tree");

        var treeWrap = makeNode("div", "ct-tree-wrap");
        var treeGrid = makeNode("div", "ct-tree-grid");
        var treeColumns = getTreeColumnCount(l1Count, width, {
          focusedBranchMode: shouldPreferFocusedBranch,
          deepTree: maxDepth >= 3
        });
        var treeMaxWidthRem = treeColumns >= 4 ? 104 : (treeColumns === 3 ? 98 : 92);
        treeGrid.style.setProperty("--ct-tree-columns", String(treeColumns));
        treeGrid.setAttribute("data-ct-tree-columns", String(treeColumns));
        treeWrap.style.setProperty("--ct-tree-max-width", String(treeMaxWidthRem) + "rem");

        allBranches.forEach(function (branchNode, index) {

          var branchItem = makeNode("div", "ct-tree-branch-item");
          var branchSpan = getTreeBranchSpan(branchNode, treeColumns);
          branchItem.setAttribute("data-ct-branch-span", branchSpan);
          if (branchSpan === "full") {
            branchItem.classList.add("ct-tree-branch-item-full");
          } else if (branchSpan === "wide") {
            branchItem.classList.add("ct-tree-branch-item-wide");
          }
          branchItem.appendChild(buildBranchRow(branchNode, index));
          treeGrid.appendChild(branchItem);

        });

        treeWrap.appendChild(treeGrid);
        board.appendChild(treeWrap);

      }

      syncBranchAttention();
      renderFocusTrayFromState();
      container.classList.toggle(
        "home-cluster-mobile-detail",
        !!(isVertical && shouldPreferFocusedBranch && state.manualSelection && String(state.selectedBranchId || "").trim())
      );

      function removeClusterConnectorOverlay() {
        var existingOverlay = board.querySelector(".ct-connector-overlay");
        if (existingOverlay && existingOverlay.parentNode) {
          existingOverlay.parentNode.removeChild(existingOverlay);
        }
        board.classList.remove("ct-svg-connectors");
      }

      function ensureClusterConnectorOverlay() {
        var overlay = board.querySelector(".ct-connector-overlay");
        if (overlay) {
          return overlay;
        }
        overlay = document.createElementNS(svgNs, "svg");
        overlay.setAttribute("class", "ct-connector-overlay");
        overlay.setAttribute("aria-hidden", "true");
        board.insertBefore(overlay, board.firstChild || null);
        return overlay;
      }

      function refreshClusterConnectorOverlay() {
        if (
          isVertical
          || strategy === "grid"
          || !document.createElementNS
          || !board.isConnected
        ) {
          removeClusterConnectorOverlay();
          return;
        }

        var boardRect = board.getBoundingClientRect();
        var overlayWidth = Math.max(Math.ceil(boardRect.width || 0), board.scrollWidth || 0);
        var overlayHeight = Math.max(Math.ceil(boardRect.height || 0), board.scrollHeight || 0);
        if (!overlayWidth || !overlayHeight) {
          removeClusterConnectorOverlay();
          return;
        }

        var renderedById = {};
        Array.prototype.forEach.call(board.querySelectorAll(".ct-node[data-node-id]"), function (bubble) {
          var nodeId = String(bubble.getAttribute("data-node-id") || "").trim();
          if (nodeId && !renderedById[nodeId]) {
            renderedById[nodeId] = bubble;
          }
        });

        var connectors = [];
        Object.keys(renderedById).forEach(function (nodeId) {
          var node = nodeById[nodeId];
          var parentId = String((node && node.parent_id) || "").trim();
          var parentBubble = parentId ? renderedById[parentId] : null;
          var usesVirtualRoot = !!(
            parentId
            && rootNode
            && String(rootNode.id || "").trim() === parentId
            && !parentBubble
          );
          if (!parentId || (!parentBubble && !usesVirtualRoot)) {
            return;
          }

          var childRect = renderedById[nodeId].getBoundingClientRect();
          var parentRect = parentBubble ? parentBubble.getBoundingClientRect() : null;
          var horizontalDistance = parentRect ? Math.abs(childRect.left - parentRect.right) : 0;
          var verticalDistance = parentRect ? Math.abs(childRect.top - parentRect.bottom) : 999;
          var mostlyHorizontal = horizontalDistance >= verticalDistance;
          var startX;
          var startY;
          var endX;
          var endY;
          var pathData;

          if (usesVirtualRoot) {
            startX = boardRect.width * 0.5;
            startY = 1;
            endX = childRect.left - boardRect.left + (childRect.width * 0.5);
            endY = childRect.top - boardRect.top;
            var rootControl = Math.max(22, Math.abs(endY - startY) * 0.56);
            pathData = "M " + startX + " " + startY
              + " C " + startX + " " + (startY + rootControl)
              + ", " + endX + " " + (endY - rootControl)
              + ", " + endX + " " + endY;
          } else if (mostlyHorizontal) {
            startX = parentRect.right - boardRect.left;
            startY = parentRect.top - boardRect.top + (parentRect.height * 0.5);
            endX = childRect.left - boardRect.left;
            endY = childRect.top - boardRect.top + (childRect.height * 0.5);
            var horizontalControl = Math.max(22, Math.abs(endX - startX) * 0.52);
            pathData = "M " + startX + " " + startY
              + " C " + (startX + horizontalControl) + " " + startY
              + ", " + (endX - horizontalControl) + " " + endY
              + ", " + endX + " " + endY;
          } else {
            startX = parentRect.left - boardRect.left + (parentRect.width * 0.5);
            startY = parentRect.bottom - boardRect.top;
            endX = childRect.left - boardRect.left + (childRect.width * 0.5);
            endY = childRect.top - boardRect.top;
            var verticalControl = Math.max(18, Math.abs(endY - startY) * 0.52);
            pathData = "M " + startX + " " + startY
              + " C " + startX + " " + (startY + verticalControl)
              + ", " + endX + " " + (endY - verticalControl)
              + ", " + endX + " " + endY;
          }

          connectors.push({
            childId: nodeId,
            isActive: isNodeInSelectedBranch(nodeId),
            pathData: pathData
          });
        });

        if (!connectors.length) {
          removeClusterConnectorOverlay();
          return;
        }

        var overlay = ensureClusterConnectorOverlay();
        while (overlay.firstChild) {
          overlay.removeChild(overlay.firstChild);
        }
        overlay.setAttribute("viewBox", "0 0 " + overlayWidth + " " + overlayHeight);
        overlay.setAttribute("width", String(overlayWidth));
        overlay.setAttribute("height", String(overlayHeight));

        connectors.forEach(function (connector) {
          var path = document.createElementNS(svgNs, "path");
          path.setAttribute("class", "ct-connector-path" + (connector.isActive ? " is-active" : ""));
          path.setAttribute("d", connector.pathData);
          path.setAttribute("data-child-id", connector.childId);
          overlay.appendChild(path);
        });
        board.classList.add("ct-svg-connectors");
      }

      function scheduleClusterConnectorOverlayRefresh() {
        if (container.__homeClusterConnectorFrame) {
          window.cancelAnimationFrame(container.__homeClusterConnectorFrame);
        }
        container.__homeClusterConnectorFrame = window.requestAnimationFrame(function () {
          container.__homeClusterConnectorFrame = 0;
          var refreshOverlay = container.__homeClusterConnectorRefresh;
          if (typeof refreshOverlay === "function") {
            refreshOverlay();
          }
        });
      }

      container.__homeClusterConnectorRefresh = refreshClusterConnectorOverlay;
      scheduleClusterConnectorOverlayRefresh();

      if (!container.__homeClusterConnectorOverlayBound) {
        if (window.ResizeObserver) {
          container.__homeClusterConnectorObserver = new ResizeObserver(function () {
            scheduleClusterConnectorOverlayRefresh();
          });
          container.__homeClusterConnectorObserver.observe(board);
        }
        if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
          document.fonts.ready.then(function () {
            scheduleClusterConnectorOverlayRefresh();
          }).catch(function () {
            // Ignore font observer failures.
          });
        }
        container.__homeClusterConnectorOverlayBound = true;
      }

      if (focusTray && !focusTray.__homeClusterPreviewBound) {
        focusTray.__homeClusterPreviewBound = true;
        focusTray.addEventListener("mouseenter", function () {
          cancelPendingHoverClear();
          var pendingBranchId = String(container.__homeClusterPendingPreviewBranchId || "").trim();
          if (pendingBranchId && nodeById[pendingBranchId] && state.hoveredBranchId !== pendingBranchId) {
            setHoveredBranch(pendingBranchId);
          }
        });
        focusTray.addEventListener("focusin", function () {
          cancelPendingHoverClear();
        });
        focusTray.addEventListener("mouseleave", function () {
          if (isHoverPreviewActive()) {
            clearHoveredBranch(state.hoveredBranchId);
          }
        });
        focusTray.addEventListener("focusout", function (event) {
          if (focusTray.contains(event.relatedTarget)) {
            return;
          }
          if (isHoverPreviewActive()) {
            clearHoveredBranch(state.hoveredBranchId);
          }
        });
      }



      /* resize handler */

      if (!container.__homeClusterResizeHandler) {

        container.__homeClusterResizeHandler = function () {

          renderHomeClusterMap(container, payload, nodes);

        };

        window.addEventListener("resize", container.__homeClusterResizeHandler);

      }



      /* jump-pill handler */

      if (!container.__homeClusterJumpHandler) {

        container.__homeClusterJumpHandler = function (event) {

          var trigger = event.target && event.target.closest ? event.target.closest("[data-home-cluster-jump]") : null;

          if (!trigger) return;

          var branchBase = String(trigger.getAttribute("data-home-cluster-jump") || "").trim();

          var targetId = branchByBase[branchBase] || "";

          if (!targetId) return;

          event.preventDefault();

          setSelectedBranch(targetId, { manual: true });

          renderHomeClusterMap(container, payload, nodes);

          var targetRow = board.querySelector("[data-branch-id=\"" + targetId + "\"]");

          if (targetRow && typeof targetRow.scrollIntoView === "function") {

            targetRow.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });

          } else if (typeof container.scrollIntoView === "function") {

            container.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });

          }

        };

        document.addEventListener("click", container.__homeClusterJumpHandler);

      }



      /* strategy sub-switcher buttons */

      var stratSwitcher = container.querySelector("[data-ct-strategy-switcher]");

      if (stratSwitcher) {

        var stratBtns = stratSwitcher.querySelectorAll("[data-ct-strategy-btn]");

        Array.prototype.forEach.call(stratBtns, function (btn) {

          var btnStrategy = String(btn.getAttribute("data-ct-strategy-btn") || "").trim().toLowerCase();

          var isActive = (!container.getAttribute("data-ct-strategy-override") && (
            btnStrategy === autoStrategy
            || (autoStrategy === "fanout" && btnStrategy === "adaptive")
          ))

            || (btnStrategy === strategy && container.getAttribute("data-ct-strategy-override"));

          btn.classList.toggle("is-active", isActive);

          btn.setAttribute("aria-pressed", isActive ? "true" : "false");

          if (!btn.__ctStrategyBound) {

            btn.__ctStrategyBound = true;

            btn.addEventListener("click", function () {

              var nextStrategy = String(btn.getAttribute("data-ct-strategy-btn") || "").trim().toLowerCase();

              if (nextStrategy === "adaptive") {

                container.removeAttribute("data-ct-strategy-override");

              } else {

                container.setAttribute("data-ct-strategy-override", nextStrategy);

              }

              renderHomeClusterMap(container, payload, nodes);

            });

          }

        });

      }

    }



    function renderHomeGraph(container) {
      var dataNode = container.querySelector("[data-hierarchy-graph-data]");
      if (!dataNode) {
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
        container.hidden = true;
        return;
      }

      var mode = String(payload.mode || container.getAttribute("data-hierarchy-mode") || "tree-diagram").trim().toLowerCase();
      if (container.hasAttribute("data-home-cluster-map")) {
        renderHomeClusterMap(container, payload, nodes);
        return;
      }

      var svg = container.querySelector("svg");
      if (!svg) {
        return;
      }

      var compact = Boolean(container.clientWidth && container.clientWidth < 700 && mode !== "tree-diagram" && mode !== "cluster-diagram");
      var depthGroups = {};
      var childrenByParent = {};
      var positionsById = {};
      var maxDepth = 0;

      nodes.forEach(function (node) {
        node.depth = parseInt(String(node.depth || 0), 10);
        if (!Number.isFinite(node.depth) || node.depth < 0) {
          node.depth = 0;
        }
        maxDepth = Math.max(maxDepth, node.depth);
        if (!depthGroups[node.depth]) {
          depthGroups[node.depth] = [];
        }
        depthGroups[node.depth].push(node);
        var parentId = String(node.parent_id || "").trim();
        if (parentId) {
          if (!childrenByParent[parentId]) {
            childrenByParent[parentId] = [];
          }
          childrenByParent[parentId].push(node);
        }
      });

      Object.keys(depthGroups).forEach(function (depthKey) {
        depthGroups[depthKey].sort(function (a, b) {
          var aSlot = parseInt(String(a.slot_index || 0), 10);
          var bSlot = parseInt(String(b.slot_index || 0), 10);
          if (Number.isFinite(aSlot) && Number.isFinite(bSlot) && aSlot !== bSlot) {
            return aSlot - bSlot;
          }
          return String(a.label || "").localeCompare(String(b.label || ""));
        });
      });

      clearSvg(svg);

      var depthOneCount = (depthGroups[1] || []).length;
      var width = Math.max(980, container.clientWidth || 980);
      if (mode === "tree-diagram") {
        width = Math.max(width, 260 + (depthOneCount * 190));
      } else {
        width = Math.max(width, 1040);
      }
      if (compact) {
        width = Math.max(container.clientWidth || 360, 360);
      }
      var rowGap = compact ? 112 : 126;
      var height = 140 + ((maxDepth + 1) * rowGap);
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);

      var margin = compact ? 28 : 80;
      var rootNodes = depthGroups[0] || [];
      if (rootNodes.length) {
        rootNodes[0].x = Math.round(width / 2);
        rootNodes[0].y = 64;
        positionsById[rootNodes[0].id] = { x: rootNodes[0].x, y: rootNodes[0].y };
      }

      var depthOneNodes = depthGroups[1] || [];
      var depthOnePositions = buildSpreadPositions(
        depthOneNodes.length,
        margin + 40,
        width - margin - 40,
        compact ? 188 : 206
      );
      for (var depthOneIndex = 0; depthOneIndex < depthOneNodes.length; depthOneIndex += 1) {
        depthOneNodes[depthOneIndex].x = depthOnePositions[depthOneIndex].x;
        depthOneNodes[depthOneIndex].y = depthOnePositions[depthOneIndex].y;
        positionsById[depthOneNodes[depthOneIndex].id] = {
          x: depthOneNodes[depthOneIndex].x,
          y: depthOneNodes[depthOneIndex].y
        };
      }

      var depthTwoNodes = depthGroups[2] || [];
      if (depthTwoNodes.length) {
        var segmentCount = Math.max(1, depthOneNodes.length || rootNodes.length || 1);
        var segmentWidth = Math.max(168, Math.floor((width - (margin * 2)) / segmentCount));
        var fallbackParent = depthOneNodes[0] || rootNodes[0] || null;
        depthTwoNodes.forEach(function (node) {
          var parentId = String(node.parent_id || "").trim();
          var parentNode = null;
          if (parentId) {
            parentNode = depthOneNodes.filter(function (candidate) {
              return candidate.id === parentId;
            })[0] || rootNodes.filter(function (candidate) {
              return candidate.id === parentId;
            })[0] || null;
          }
          if (!parentNode) {
            parentNode = fallbackParent;
          }
          var parentIndex = Math.max(0, depthOneNodes.indexOf(parentNode));
          var siblings = childrenByParent[parentNode ? parentNode.id : ""] || [node];
          var siblingIndex = Math.max(0, siblings.indexOf(node));
          var segmentStart = margin + (parentIndex * segmentWidth);
          var segmentEnd = segmentStart + segmentWidth;
          var childPositions = buildSpreadPositions(
            siblings.length,
            segmentStart + 18,
            segmentEnd - 18,
            compact ? 308 : 336
          );
          var position = childPositions[siblingIndex] || {
            x: Math.round((segmentStart + segmentEnd) / 2),
            y: compact ? 308 : 336
          };
          node.x = position.x;
          node.y = position.y;
          positionsById[node.id] = { x: node.x, y: node.y };
        });
      }

      (payload.edges || []).forEach(function (edge) {
        var from = positionsById[String((edge && edge.from) || "")];
        var to = positionsById[String((edge && edge.to) || "")];
        if (!from || !to) {
          return;
        }
        appendEdge(svg, from.x, from.y + 30, to.x, to.y - 30, "hierarchy-graph-edge-tree");
      });

      nodes.forEach(function (node) {
        if (!positionsById[node.id]) {
          return;
        }
        node.x = positionsById[node.id].x;
        node.y = positionsById[node.id].y;
        appendNode(svg, node, { compact: compact });
      });
    }

    Array.prototype.forEach.call(homeGraphContainers, renderHomeGraph);
    Array.prototype.forEach.call(articleGraphContainers, renderArticleGraph);
    document.addEventListener("phoenix-home-mode-changed", function () {
      window.setTimeout(function () {
        Array.prototype.forEach.call(homeGraphContainers, renderHomeGraph);
      }, 0);
    });
  }

  PhoenixUI.initializers.hierarchyGraphs = initHierarchyGraphs;
})();
