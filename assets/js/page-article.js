(function() {
  "use strict";

  var PhoenixUI = window.PhoenixUI = window.PhoenixUI || { initializers: {} };
  PhoenixUI.initializers = PhoenixUI.initializers || {};
  var getAnchorOffsetPixels = PhoenixUI.getAnchorOffsetPixels;
  var getUiString = PhoenixUI.getUiString;
  var prefersReducedMotion = PhoenixUI.prefersReducedMotion;
  var slugify = PhoenixUI.slugify;

  function markEndnotesAnchor(articleRoot) {
    if (!articleRoot) {
      return;
    }
    var candidates = articleRoot.querySelectorAll("h1, h2, h3, h4, h5, h6, p, strong");
    for (var i = 0; i < candidates.length; i += 1) {
      var node = candidates[i];
      var label = String(node.textContent || "").trim().toLowerCase();
      if (label === "endnotes" || label === "references" || label === "sources") {
        if (!node.id) {
          node.id = "endnotes";
        }
        node.classList.add("endnotes-marker");
        return;
      }
    }
  }

  function initEndnotesCollapsing() {
    var article = document.querySelector(".article-body");
    var root = document.documentElement;
    if (!article || !root) {
      return;
    }

    markEndnotesAnchor(article);

    var mode = String(root.getAttribute("data-endnotes-mode") || "auto").toLowerCase();
    if (mode !== "auto" && mode !== "expanded" && mode !== "collapsed") {
      mode = "auto";
    }
    var threshold = parseInt(root.getAttribute("data-endnotes-collapse-threshold"), 10);
    if (!Number.isFinite(threshold) || threshold < 1) {
      threshold = 6;
    }
    var initialVisible = parseInt(root.getAttribute("data-endnotes-initial-visible"), 10);
    if (!Number.isFinite(initialVisible) || initialVisible < 1) {
      initialVisible = 6;
    }

    var marker = article.querySelector(".endnotes-marker, #endnotes");
    if (!marker) {
      return;
    }

    var entries = [];
    var auxiliaryEntries = [];
    var sections = [];
    var currentSection = {
      heading: null,
      refs: [],
      lists: [],
      lastRef: null
    };
    sections.push(currentSection);
    var cursor = marker.nextElementSibling;
    while (cursor) {
      if (cursor.classList && cursor.classList.contains("further-reading-section")) {
        break;
      }
      var tag = String(cursor.tagName || "").toUpperCase();
      if (/^H[1-6]$/.test(tag) && !cursor.classList.contains("endnotes-marker")) {
        var headingLabel = String(cursor.textContent || "").trim().toLowerCase();
        if (headingLabel === "additional references" || headingLabel === "additional sources") {
          cursor.classList.add("additional-references-marker");
          currentSection = {
            heading: cursor,
            refs: [],
            lists: [],
            lastRef: null
          };
          sections.push(currentSection);
        } else {
          break;
        }
      }
      if (tag !== "SCRIPT" && tag !== "STYLE") {
        entries.push(cursor);
        if (tag === "OL" || tag === "UL") {
          currentSection.lists.push(cursor);
          var listItems = Array.prototype.filter.call(cursor.children, function (node) {
            return String((node && node.tagName) || "").toUpperCase() === "LI";
          });
          if (listItems.length) {
            cursor.classList.add("endnotes-entry-list");
            Array.prototype.forEach.call(listItems, function (item) {
              var listEntry = {
                node: item,
                container: cursor
              };
              if (item.querySelector('a[id^="endnote-"]')) {
                currentSection.refs.push(listEntry);
                currentSection.lastRef = listEntry;
              } else {
                listEntry.owner = currentSection.lastRef;
                auxiliaryEntries.push(listEntry);
              }
            });
          } else if (cursor.querySelector('a[id^="endnote-"]')) {
            var listContainerEntry = {
              node: cursor,
              container: cursor
            };
            currentSection.refs.push(listContainerEntry);
            currentSection.lastRef = listContainerEntry;
          }
        } else if (!cursor.classList.contains("additional-references-marker")) {
          var siblingEntry = {
            node: cursor,
            container: cursor
          };
          if (cursor.querySelector('a[id^="endnote-"]')) {
            currentSection.refs.push(siblingEntry);
            currentSection.lastRef = siblingEntry;
          } else {
            siblingEntry.owner = currentSection.lastRef;
            auxiliaryEntries.push(siblingEntry);
          }
        }
        var outboundLinks = cursor.querySelectorAll("a[href]");
        Array.prototype.forEach.call(outboundLinks, function (link) {
          var previous = link.previousSibling;
          if (
            previous &&
            previous.nodeType === 3 &&
            /\bLink:$/i.test(String(previous.nodeValue || ""))
          ) {
            previous.nodeValue += " ";
          }
        });
      }
      cursor = cursor.nextElementSibling;
    }

    if (!entries.length) {
      return;
    }

    var toggleTargets = [];
    Array.prototype.forEach.call(sections, function (section) {
      Array.prototype.forEach.call(section.refs, function (ref) {
        toggleTargets.push(ref);
      });
    });
    var summaryNoun = sections.length > 1 ? "references" : "endnotes";

    Array.prototype.forEach.call(toggleTargets, function (entry) {
      if (entry && entry.node) {
        entry.node.classList.add("endnotes-entry");
      }
    });

    if (mode === "expanded") {
      return;
    }

    if (mode === "auto" && toggleTargets.length <= threshold) {
      return;
    }
    if (initialVisible >= toggleTargets.length) {
      return;
    }

    Array.prototype.forEach.call(toggleTargets, function (entry, index) {
      if (!entry || !entry.node) {
        return;
      }
      entry.node.classList.toggle("is-hidden-endnote", index >= initialVisible);
    });

    var controlGroups = [];
    var createControls = function (position) {
      var controls = document.createElement("div");
      controls.className = "endnotes-toggle-wrap";
      if (position === "bottom") {
        controls.classList.add("endnotes-toggle-wrap-bottom");
      }

      var summary = document.createElement("p");
      summary.className = "endnotes-toggle-summary";
      controls.appendChild(summary);

      var button = document.createElement("button");
      button.type = "button";
      button.className = "endnotes-toggle-button";
      controls.appendChild(button);

      controlGroups.push({ wrap: controls, summary: summary, button: button });
      return controls;
    };

    var topControls = createControls("top");
    marker.insertAdjacentElement("afterend", topControls);

    var bottomControls = createControls("bottom");
    entries[entries.length - 1].insertAdjacentElement("afterend", bottomControls);

    var expanded = false;
    var setBlockHidden = function (node, hidden) {
      if (!node || !node.classList) {
        return;
      }
      node.classList.toggle("is-hidden-endnote-block", Boolean(hidden));
    };
    var applyControlState = function (summaryText, buttonText, ariaExpanded) {
      Array.prototype.forEach.call(controlGroups, function (group) {
        if (!group) {
          return;
        }
        group.summary.textContent = summaryText;
        group.button.textContent = buttonText;
        group.button.setAttribute("aria-expanded", ariaExpanded);
        group.wrap.classList.toggle("is-endnotes-expanded", ariaExpanded === "true");
      });
    };
    var update = function () {
      Array.prototype.forEach.call(toggleTargets, function (entry, index) {
        if (!entry || !entry.node || !entry.node.classList) {
          return;
        }
        entry.node.classList.toggle("is-hidden-endnote", !expanded && index >= initialVisible);
      });
      Array.prototype.forEach.call(auxiliaryEntries, function (entry) {
        if (!entry || !entry.node || !entry.node.classList) {
          return;
        }
        var ownerHidden = Boolean(
          entry.owner &&
          entry.owner.node &&
          entry.owner.node.classList &&
          entry.owner.node.classList.contains("is-hidden-endnote")
        );
        setBlockHidden(entry.node, !expanded && ownerHidden);
      });
      Array.prototype.forEach.call(sections, function (section) {
        var visibleInSection = 0;
        Array.prototype.forEach.call(section.refs, function (entry) {
          if (!entry || !entry.node || !entry.node.classList) {
            return;
          }
          if (!entry.node.classList.contains("is-hidden-endnote")) {
            visibleInSection += 1;
          }
        });
        if (section.heading) {
          setBlockHidden(section.heading, !expanded && visibleInSection < 1);
        }
        Array.prototype.forEach.call(section.lists, function (listNode) {
          var listVisibleCount = 0;
          Array.prototype.forEach.call(section.refs, function (entry) {
            if (!entry || entry.container !== listNode || !entry.node || !entry.node.classList) {
              return;
            }
            if (!entry.node.classList.contains("is-hidden-endnote")) {
              listVisibleCount += 1;
            }
          });
          setBlockHidden(listNode, !expanded && listVisibleCount < 1);
        });
      });
      if (expanded) {
        applyControlState(
          "Showing all " + String(toggleTargets.length) + " " + summaryNoun + ".",
          "Show fewer references",
          "true"
        );
      } else {
        var hiddenCount = Math.max(0, toggleTargets.length - initialVisible);
        applyControlState(
          "Showing first " + String(initialVisible) + " of " + String(toggleTargets.length) + " " + summaryNoun + ".",
          "Show " + String(hiddenCount) + " more references",
          "false"
        );
      }
    };

    Array.prototype.forEach.call(controlGroups, function (group) {
      group.button.addEventListener("click", function () {
        expanded = !expanded;
        update();
      });
    });
    update();
  }

  function detectPseudoHeadings(article) {
    if (!article) {
      return;
    }
    var sourceLabelPattern = /\\b(?:academic|publishing|springer|wikipedia|researchgate|youtube|journal|press)\\b/i;
    var sourceLabelAliases = {
      "oup academic": true,
      "aip publishing": true,
      "wikipedia": true,
      "springer": true,
      "researchgate": true,
      "youtube": true,
      "academia": true,
      "academic": true
    };
    var blocks = article.querySelectorAll("p");
    Array.prototype.forEach.call(blocks, function (node) {
      if (!node || !node.parentElement) {
        return;
      }
      if (node.closest && node.closest(".related-reports")) {
        return;
      }
      if (node.classList.contains("pseudo-heading-level-2") || node.classList.contains("pseudo-heading-level-3")) {
        return;
      }
      var text = String(node.textContent || "").trim();
      if (!text || text.length < 3 || text.length > 110) {
        return;
      }
      if (/https?:\/\//i.test(text)) {
        return;
      }
      var childCount = node.children ? node.children.length : 0;
      if (childCount === 1) {
        var onlyChild = node.children[0];
        if (!onlyChild || !onlyChild.tagName) {
          return;
        }
        var tag = String(onlyChild.tagName || "").toLowerCase();
        if (["strong", "b", "em", "i"].indexOf(tag) === -1) {
          return;
        }
        var styledLevelClass = (tag === "em" || tag === "i") ? "pseudo-heading-level-3" : "pseudo-heading-level-2";
        node.classList.add(styledLevelClass);
        return;
      }
      if (childCount !== 0) {
        return;
      }

      var lower = text.toLowerCase();
      if (sourceLabelAliases[lower] || sourceLabelPattern.test(lower)) {
        if (text.split(/\\s+/).length <= 3) {
          return;
        }
      }
      if (/^[a-z0-9-]+(?:\\.[a-z0-9-]+)+$/.test(lower)) {
        return;
      }
      if (/^\\s*(?:\\[(?:\\d+)\\]|\\d+\\.)\\s+/.test(text)) {
        return;
      }
      if ((/[.!?]$/.test(text) && text.length > 42) || (text.indexOf(":") !== -1 && text.length > 70)) {
        return;
      }
      if (!/^[A-Z]/.test(text)) {
        return;
      }

      var prev = node.previousElementSibling;
      var prevIsHeading = false;
      if (prev && prev.tagName) {
        var prevTag = String(prev.tagName || "").toUpperCase();
        prevIsHeading = prevTag === "H2" || prevTag === "H3" || prevTag === "H4"
          || prev.classList.contains("pseudo-heading-level-2")
          || prev.classList.contains("pseudo-heading-level-3");
      }
      var levelClass = prevIsHeading ? "pseudo-heading-level-3" : "pseudo-heading-level-2";
      node.classList.add(levelClass);
    });
  }

  function buildPageToc() {
    var tocRoots = document.querySelectorAll("[data-page-toc], [data-mobile-page-toc]");
    var article = document.querySelector(".article-body");
    if (!tocRoots.length || !article) {
      return;
    }
    document.documentElement.setAttribute("data-page-toc-count", "0");

    markEndnotesAnchor(article);
    var realHeadings = article.querySelectorAll("h2, h3, h4");
    if (realHeadings.length < 2) {
      detectPseudoHeadings(article);
    }

    function shouldIncludeTocHeading(heading, text) {
      var label = String(text || "").trim();
      if (!label) {
        return false;
      }
      if (/^showing first \d+ of \d+ endnotes\.?$/i.test(label)) {
        return false;
      }
      if (/^showing first \d+ of \d+ additional sources\.?$/i.test(label)) {
        return false;
      }
      if (/^show \d+ more sources\.?$/i.test(label) || /^show fewer sources\.?$/i.test(label)) {
        return false;
      }
      if (/^additional references?$/i.test(label) || /^additional sources?$/i.test(label)) {
        return false;
      }
      if (/et al\.?$/i.test(label) && label.length < 90 && label.indexOf(":") === -1) {
        return false;
      }
      if (/^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}(?:,\s*[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})+(?:\s+et al\.)?$/.test(label)) {
        return false;
      }
      if (heading && heading.classList && heading.classList.contains("endnotes-marker")) {
        return false;
      }
      return true;
    }

    var headings = article.querySelectorAll("h2, h3, h4, p.pseudo-heading-level-2, p.pseudo-heading-level-3");
    var dispatchState = function (hasHeadings) {
      try {
        document.dispatchEvent(
          new CustomEvent("phoenix-page-toc-built", {
            detail: { hasHeadings: Boolean(hasHeadings) }
          })
        );
      } catch (err) {
        // Ignore custom event failures.
      }
    };
    var renderEmptyState = function () {
      Array.prototype.forEach.call(tocRoots, function (rootNode) {
        rootNode.innerHTML = "<p class=\"page-toc-empty\">No section headings detected.</p>";
      });
      dispatchState(false);
    };
    if (!headings.length) {
      renderEmptyState();
      return;
    }

    var usedIds = {};
    var headingList = [];
    var tocEntries = [];
    var linkGroups = [];
    var lastActiveId = "";
    var forcedActiveId = "";
    var forcedActiveExpiresAt = 0;

    Array.prototype.forEach.call(headings, function (heading) {
      if (heading.closest && heading.closest(".related-reports, .further-reading-section, [data-page-toc-exclude]")) {
        return;
      }
      var text = String(heading.textContent || "").trim();
      text = text.replace(/^\\s*(?:#+\\s*)+/, "").trim();
      if (!shouldIncludeTocHeading(heading, text)) {
        return;
      }
      var baseId = heading.id || slugify(text);
      var nextId = baseId;
      var suffix = 2;
      while (usedIds[nextId]) {
        nextId = baseId + "-" + String(suffix);
        suffix += 1;
      }
      usedIds[nextId] = true;
      if (!heading.id) {
        heading.id = nextId;
      }

      headingList.push(heading);
    });

    if (!headingList.length) {
      renderEmptyState();
      return;
    }

    var activeTopLevelEntry = null;
    Array.prototype.forEach.call(headingList, function (heading) {
      var text = String(heading.textContent || "").trim().replace(/^\s*(?:#+\s*)+/, "").trim();
      var tagName = String(heading.tagName || "").toUpperCase();
      var isDepth3 = (
        tagName === "H3"
        || tagName === "H4"
        || heading.classList.contains("pseudo-heading-level-3")
      );
      var entry = {
        id: heading.id,
        heading: heading,
        text: text,
        depth: isDepth3 ? 3 : 2,
        children: []
      };
      if (entry.depth === 2 || !activeTopLevelEntry) {
        tocEntries.push(entry);
        activeTopLevelEntry = entry.depth === 2 ? entry : activeTopLevelEntry;
        if (entry.depth === 2) {
          activeTopLevelEntry = entry;
        }
      } else {
        activeTopLevelEntry.children.push(entry);
      }
    });

    var topLevelEntriesWithChildren = tocEntries.filter(function (entry) {
      return Boolean(entry.children && entry.children.length);
    });
    var hasNestedGroups = Boolean(topLevelEntriesWithChildren.length);
    var flatTocMode = tocEntries.length >= 1;
    var balancedSingleBranch = false;
    var pageTocMode = flatTocMode ? "flat" : "default";
    var indexToAlphabeticLabel = function (index) {
      var value = Math.max(0, parseInt(String(index || 0), 10) || 0);
      var token = "";
      do {
        token = String.fromCharCode(97 + (value % 26)) + token;
        value = Math.floor(value / 26) - 1;
      } while (value >= 0);
      return token;
    };
    var normalizeTocLookupText = function (value) {
      return String(value || "")
        .replace(/[-_]+/g, " ")
        .replace(/[^\w\s']+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/[’]/g, "'")
        .trim()
        .toLowerCase();
    };

    Array.prototype.forEach.call(tocEntries, function (entry, entryIndex) {
      entry.indexLabel = String(entryIndex + 1).padStart(2, "0");
      Array.prototype.forEach.call(entry.children || [], function (childEntry, childIndex) {
        childEntry.indexLabel = entry.indexLabel + indexToAlphabeticLabel(childIndex);
      });
    });

    var linkHeroHighlights = function () {
      var heroCopy = document.querySelector(".article-hero-copy");
      var highlights = document.querySelector(".article-hero-highlights-list");
      if (!highlights) {
        if (!heroCopy || !tocEntries.length) {
          return;
        }
        var section = document.createElement("section");
        section.className = "article-hero-highlights";
        section.setAttribute("aria-label", "Key sections");
        var title = document.createElement("p");
        title.className = "article-hero-highlights-title";
        var pageToolsLabel = document.querySelector(".page-tools-label, .mobile-page-tools-title");
        title.textContent = String((pageToolsLabel && pageToolsLabel.textContent) || "On this page").trim() || "On this page";
        highlights = document.createElement("ul");
        highlights.className = "article-hero-highlights-list";
        Array.prototype.slice.call(tocEntries, 0, 3).forEach(function (entry) {
          if (!entry || !entry.text) {
            return;
          }
          var item = document.createElement("li");
          item.textContent = entry.text;
          highlights.appendChild(item);
        });
        if (!highlights.children.length) {
          return;
        }
        section.appendChild(title);
        section.appendChild(highlights);
        heroCopy.appendChild(section);
      }
      var entriesByText = {};
      Array.prototype.forEach.call(tocEntries, function (entry) {
        var key = normalizeTocLookupText(entry.text);
        if (key && !entriesByText[key]) {
          entriesByText[key] = entry;
        }
      });
      Array.prototype.forEach.call(highlights.querySelectorAll("li"), function (item) {
        if (!item || item.querySelector("a")) {
          return;
        }
        var text = String(item.textContent || "").trim();
        var entry = entriesByText[normalizeTocLookupText(text)];
        if (!entry || !entry.id) {
          return;
        }
        var link = document.createElement("a");
        link.href = "#" + entry.id;
        link.textContent = text;
        item.textContent = "";
        item.appendChild(link);
      });
    };

    linkHeroHighlights();

    Array.prototype.forEach.call(tocRoots, function (rootNode) {
      var tocList = document.createElement("ul");
      var linksById = {};
      var setTocItemExpanded = function (item, isExpanded) {
        if (!item || !item.classList || !item.classList.contains("has-children")) {
          return;
        }
        item.classList.toggle("is-collapsed", !isExpanded);
        var toggle = item.querySelector(":scope > .page-toc-row > [data-page-toc-toggle]");
        if (!toggle) {
          return;
        }
        toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        toggle.setAttribute("title", isExpanded ? "Collapse subsections" : "Expand subsections");
        toggle.textContent = isExpanded ? "-" : "+";
      };
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
        if (!hasNestedGroups) {
          return;
        }
        var nestedItems = rootNode.querySelectorAll(".page-toc-item.has-children");
        var allExpanded = Array.prototype.every.call(nestedItems, function (item) {
          return item && !item.classList.contains("is-collapsed");
        });
        var allCollapsed = Array.prototype.every.call(nestedItems, function (item) {
          return item && item.classList.contains("is-collapsed");
        });
        updateBulkActionButtons(expandAllButtons, allExpanded);
        updateBulkActionButtons(collapseAllButtons, allCollapsed);
      };
      var setAllTocItemsExpanded = function (isExpanded) {
        Array.prototype.forEach.call(rootNode.querySelectorAll(".page-toc-item.has-children"), function (item) {
          setTocItemExpanded(item, isExpanded);
        });
        updateBulkActionState();
      };
      var buildTocItem = function (entry, parentItem) {
        var li = document.createElement("li");
        li.className = "page-toc-item " + (entry.depth === 3 ? "toc-depth-3" : "toc-depth-2");
        var row = document.createElement("div");
        row.className = "page-toc-row";
        var hasChildren = Boolean(entry.children && entry.children.length);
        if (hasChildren) {
          li.classList.add("has-children");
          if (balancedSingleBranch) {
            li.classList.add("is-primary-group");
          }
          var toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "page-toc-toggle";
          toggle.setAttribute("data-page-toc-toggle", "");
          toggle.setAttribute("aria-label", "Collapse subsections under " + entry.text);
          row.appendChild(toggle);
        }
        var link = document.createElement("a");
        link.href = "#" + entry.id;
        var isCardLink = flatTocMode;
        var isFlatPrimaryLink = isCardLink && !parentItem;
        var isFlatNestedLink = isCardLink && Boolean(parentItem);
        if (isFlatPrimaryLink) {
          li.classList.add("is-flat-link");
        }
        if (isFlatNestedLink) {
          li.classList.add("is-flat-nested-link");
          if (hasChildren) {
            li.classList.add("is-flat-nested-branch");
          }
        }
        if (isCardLink) {
          var index = document.createElement("span");
          index.className = "page-toc-link-index";
          index.textContent = entry.indexLabel || "";
          index.setAttribute("aria-hidden", "true");
          link.appendChild(index);
        }
        var label = document.createElement("span");
        label.className = "page-toc-link-label";
        label.textContent = entry.text;
        link.appendChild(label);
        if (isCardLink) {
          var cue = document.createElement("span");
          cue.className = "page-toc-link-cue";
          cue.textContent = "Jump";
          cue.setAttribute("aria-hidden", "true");
          link.appendChild(cue);
        }
        row.appendChild(link);
        li.appendChild(row);
        linksById[entry.id] = {
          link: link,
          item: li,
          parentItem: parentItem || null
        };
        if (hasChildren) {
          var childList = document.createElement("ul");
          childList.className = "page-toc-children";
          if (balancedSingleBranch) {
            childList.classList.add("page-toc-children-balanced");
          }
          Array.prototype.forEach.call(entry.children, function (childEntry) {
            childList.appendChild(buildTocItem(childEntry, li));
          });
          li.appendChild(childList);
          setTocItemExpanded(li, true);
          var toggleButton = row.querySelector("[data-page-toc-toggle]");
          if (toggleButton) {
            toggleButton.addEventListener("click", function () {
              var shouldExpand = li.classList.contains("is-collapsed");
              setTocItemExpanded(li, shouldExpand);
              updateBulkActionState();
            });
          }
        }
        return li;
      };
      Array.prototype.forEach.call(tocEntries, function (entry) {
        tocList.appendChild(buildTocItem(entry, null));
      });
      rootNode.innerHTML = "";
      rootNode.classList.toggle("page-toc-balanced", balancedSingleBranch);
      rootNode.classList.toggle("page-toc-flat", flatTocMode);
      rootNode.setAttribute("data-page-toc-mode", pageTocMode);
      rootNode.appendChild(tocList);
      var controlsRoot = rootNode.parentElement || rootNode;
      var bulkActionTopThreshold = 10;
      var actionsRoots = controlsRoot.querySelectorAll(".page-toc-actions, .mobile-page-toc-actions");
      var expandAllButtons = controlsRoot.querySelectorAll("[data-page-toc-expand-all]");
      var collapseAllButtons = controlsRoot.querySelectorAll("[data-page-toc-collapse-all]");
      var showTopBulkActions = headingList.length > bulkActionTopThreshold;
      Array.prototype.forEach.call(actionsRoots, function (actionsRoot) {
        var isTopActions = actionsRoot && actionsRoot.hasAttribute("data-page-toc-actions-top");
        actionsRoot.hidden = !hasNestedGroups || (isTopActions && !showTopBulkActions);
      });
      Array.prototype.forEach.call(expandAllButtons, function (button) {
        button.hidden = !hasNestedGroups;
        button.disabled = !hasNestedGroups;
        button.setAttribute("aria-pressed", "false");
        button.onclick = function () {
          setAllTocItemsExpanded(true);
        };
      });
      Array.prototype.forEach.call(collapseAllButtons, function (button) {
        button.hidden = !hasNestedGroups;
        button.disabled = !hasNestedGroups;
        button.setAttribute("aria-pressed", "false");
        button.onclick = function () {
          setAllTocItemsExpanded(false);
        };
      });
      updateBulkActionState();
      linkGroups.push({
        rootNode: rootNode,
        linksById: linksById
      });
    });
    document.documentElement.setAttribute("data-page-toc-count", String(headingList.length));

    var scrollTocActiveLinkIntoView = function (rootNode, activeLink) {
      if (!rootNode || !activeLink || !rootNode.closest || !activeLink.getBoundingClientRect) {
        return;
      }
      var scrollContainer = rootNode.closest("[data-page-tools]")
        || rootNode.closest(".mobile-page-tools-body")
        || rootNode.closest("[data-mobile-page-tools]")
        || rootNode;
      if (!scrollContainer || !scrollContainer.getBoundingClientRect) {
        return;
      }
      if (scrollContainer.scrollHeight <= scrollContainer.clientHeight + 6) {
        return;
      }
      var containerRect = scrollContainer.getBoundingClientRect();
      var linkRect = activeLink.getBoundingClientRect();
      var pad = Math.max(18, Math.round(scrollContainer.clientHeight * 0.16));
      var upperBound = containerRect.top + pad;
      var lowerBound = containerRect.bottom - pad;
      if (linkRect.top >= upperBound && linkRect.bottom <= lowerBound) {
        return;
      }
      var targetTop = scrollContainer.scrollTop
        + (linkRect.top - containerRect.top)
        - Math.round(scrollContainer.clientHeight * 0.28);
      var maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      var nextTop = Math.max(0, Math.min(targetTop, maxTop));
      if (Math.abs(nextTop - scrollContainer.scrollTop) < 6) {
        return;
      }
      if (typeof scrollContainer.scrollTo === "function") {
        try {
          scrollContainer.scrollTo({ top: nextTop, behavior: prefersReducedMotion() ? "auto" : "smooth" });
          return;
        } catch (err) {
          // Fall through to direct assignment.
        }
      }
      scrollContainer.scrollTop = nextTop;
    };

    var setForcedActiveId = function (nextId) {
      var normalizedId = String(nextId || "").replace(/^#/, "").trim();
      if (!normalizedId) {
        forcedActiveId = "";
        forcedActiveExpiresAt = 0;
        return;
      }
      forcedActiveId = normalizedId;
      forcedActiveExpiresAt = Date.now() + 1600;
    };

    var resolveForcedActiveId = function () {
      if (!forcedActiveId) {
        return "";
      }
      var targetHeading = null;
      for (var i = 0; i < headingList.length; i += 1) {
        if (headingList[i].id === forcedActiveId) {
          targetHeading = headingList[i];
          break;
        }
      }
      if (!targetHeading) {
        forcedActiveId = "";
        forcedActiveExpiresAt = 0;
        return "";
      }
      if (Date.now() > forcedActiveExpiresAt) {
        var releaseMarker = window.scrollY + Math.max(120, getAnchorOffsetPixels() + 72);
        if (targetHeading.offsetTop > releaseMarker + 12) {
          return forcedActiveId;
        }
        forcedActiveId = "";
        forcedActiveExpiresAt = 0;
        return "";
      }
      return forcedActiveId;
    };

    var updateActiveLink = function () {
      var activeId = headingList[0] ? headingList[0].id : "";
      var marker = window.scrollY + Math.max(120, getAnchorOffsetPixels() + 48);
      for (var i = 0; i < headingList.length; i += 1) {
        if (headingList[i].offsetTop <= marker) {
          activeId = headingList[i].id;
        }
      }
      var forcedId = resolveForcedActiveId();
      if (forcedId) {
        activeId = forcedId;
      }
      var activeChanged = activeId !== lastActiveId;
      lastActiveId = activeId;
      Array.prototype.forEach.call(linkGroups, function (group) {
        var currentLink = null;
        Object.keys(group.linksById).forEach(function (id) {
          var record = group.linksById[id];
          var link = record.link;
          var isActive = id === activeId;
          link.classList.toggle("is-active", isActive);
          if (isActive) {
            currentLink = link;
            link.setAttribute("aria-current", "location");
          } else {
            link.removeAttribute("aria-current");
          }
        });
        if (activeChanged && currentLink) {
          scrollTocActiveLinkIntoView(group.rootNode, currentLink);
        }
      });
    };

    Array.prototype.forEach.call(linkGroups, function (group) {
      Object.keys(group.linksById).forEach(function (id) {
        var record = group.linksById[id];
        var link = record && record.link;
        if (!link || typeof link.addEventListener !== "function") {
          return;
        }
        link.addEventListener("click", function () {
          setForcedActiveId(id);
          window.setTimeout(updateActiveLink, 0);
          window.setTimeout(updateActiveLink, 220);
        });
      });
    });

    window.addEventListener("hashchange", function () {
      setForcedActiveId(window.location.hash);
      updateActiveLink();
      window.setTimeout(updateActiveLink, 220);
    });

    window.addEventListener("scroll", updateActiveLink, { passive: true });
    updateActiveLink();
    dispatchState(true);
  }

  function createPageActionToast() {
    var toast = document.querySelector(".page-action-toast");
    if (toast) {
      return toast;
    }
    toast = document.createElement("div");
    toast.className = "page-action-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
    return toast;
  }

  var pageActionToastTimer = 0;

  function showPageActionToast(message) {
    if (!message || !document.body) {
      return;
    }
    var toast = createPageActionToast();
    if (!toast) {
      return;
    }
    toast.textContent = String(message);
    toast.classList.add("is-visible");
    window.clearTimeout(pageActionToastTimer);
    pageActionToastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2200);
  }

  function copyTextToClipboard(text) {
    var value = String(text || "");
    if (!value) {
      return Promise.reject(new Error("Nothing to copy."));
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(value);
    }
    return new Promise(function (resolve, reject) {
      var helper = document.createElement("textarea");
      helper.value = value;
      helper.setAttribute("readonly", "readonly");
      helper.style.position = "fixed";
      helper.style.top = "-9999px";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      helper.focus();
      helper.select();
      try {
        var copied = document.execCommand("copy");
        document.body.removeChild(helper);
        if (copied) {
          resolve();
          return;
        }
      } catch (err) {
        document.body.removeChild(helper);
        reject(err);
        return;
      }
      reject(new Error("Copy command failed."));
    });
  }

  function createActionIcon(kind) {
    if (kind === "download") {
      return ""
        + "<svg viewBox=\"0 0 24 24\" focusable=\"false\" aria-hidden=\"true\">"
        + "<path d=\"M12 3v11\"></path>"
        + "<path d=\"m7 11 5 5 5-5\"></path>"
        + "<path d=\"M5 20h14\"></path>"
        + "</svg>";
    }
    return ""
      + "<svg viewBox=\"0 0 24 24\" focusable=\"false\" aria-hidden=\"true\">"
      + "<path d=\"M15 8a3 3 0 1 0-2.83-4\"></path>"
      + "<path d=\"M6 14a3 3 0 1 0 2.83 4\"></path>"
      + "<path d=\"M18 21a3 3 0 1 0 0-6\"></path>"
      + "<path d=\"m8.59 15.51 6.83 3.98\"></path>"
      + "<path d=\"m15.41 4.51-6.82 3.98\"></path>"
      + "</svg>";
  }

  function createActionButton(kind, label, options) {
    var settings = options || {};
    var button = document.createElement("button");
    button.type = "button";
    button.className = "page-action-button";
    if (settings.iconOnly) {
      button.classList.add("page-action-button-icon");
    }
    if (settings.title) {
      button.title = settings.title;
      button.setAttribute("aria-label", settings.title);
    } else if (label) {
      button.setAttribute("aria-label", label);
    }
    button.innerHTML = ""
      + "<span class=\"page-action-icon\" aria-hidden=\"true\">"
      + createActionIcon(kind)
      + "</span>"
      + "<span class=\"page-action-label\">"
      + String(label || "")
      + "</span>";
    return button;
  }

  function buildAssetSharePayload(assetData) {
    var fallbackTitle = String(document.title || "Infographic").trim();
    var label = String((assetData && assetData.label) || "").trim();
    return {
      title: label || fallbackTitle,
      text: label || fallbackTitle,
      url: String((assetData && assetData.url) || window.location.href)
    };
  }

  function getFileNameFromUrl(rawUrl, fallbackName) {
    var fallback = String(fallbackName || "download").trim() || "download";
    try {
      var parsed = new URL(String(rawUrl || ""), window.location.href);
      var segments = parsed.pathname.split("/");
      var lastSegment = decodeURIComponent(String(segments.pop() || "").trim());
      return lastSegment || fallback;
    } catch (err) {
      return fallback;
    }
  }

  function isDownloadableAssetUrl(rawUrl) {
    return /\.(?:svg|png|jpe?g|webp|gif|pdf)(?:[?#].*)?$/i.test(String(rawUrl || ""));
  }

  function resolvePrimaryAssetUrl(imageNode) {
    if (!imageNode) {
      return "";
    }
    var parentLink = imageNode.closest("a");
    var linkHref = parentLink ? String(parentLink.getAttribute("href") || "").trim() : "";
    if (linkHref && isDownloadableAssetUrl(linkHref)) {
      return new URL(linkHref, window.location.href).href;
    }
    var source = String(imageNode.currentSrc || imageNode.getAttribute("src") || "").trim();
    return source ? new URL(source, window.location.href).href : "";
  }

  function isPipelineActionableAssetUrl(rawUrl) {
    try {
      var parsed = new URL(String(rawUrl || ""), window.location.href);
      var pathname = decodeURIComponent(String(parsed.pathname || ""));
      if (pathname.indexOf("/assets/images/") === -1) {
        return false;
      }
      return /(?:-overview\.(?:svg|png|jpe?g|webp)|-image1\.(?:png|jpe?g|webp)|-(?:photo|archive)\d+\.(?:png|jpe?g|webp|gif)|-Illustration-[123](?:-(?:dark|light))?\.(?:svg|png|jpe?g|webp))$/i.test(pathname);
    } catch (err) {
      return false;
    }
  }

  function getImageActionHost(imageNode, article) {
    if (!imageNode || !article) {
      return null;
    }
    var galleryItem = imageNode.closest(".svg-gallery-item");
    if (galleryItem && article.contains(galleryItem)) {
      return galleryItem;
    }
    var figure = imageNode.closest("figure");
    if (figure && article.contains(figure)) {
      if (figure.querySelector("figcaption")) {
        return imageNode;
      }
      return figure;
    }

    var parent = imageNode.parentElement;
    if (parent && parent.tagName === "A") {
      return parent;
    }
    return imageNode;
  }

  function ensureMediaActionHost(hostNode) {
    if (!hostNode) {
      return null;
    }
    if (hostNode.classList && hostNode.classList.contains("article-hero-media")) {
      return hostNode;
    }
    if (hostNode.classList && hostNode.classList.contains("page-media-action-shell")) {
      return hostNode;
    }
    var tagName = String(hostNode.tagName || "").toUpperCase();
    if (tagName === "IMG" || tagName === "A") {
      var wrapper = document.createElement("div");
      wrapper.className = "page-media-action-shell page-media-action-shell-direct";
      hostNode.parentNode.insertBefore(wrapper, hostNode);
      wrapper.appendChild(hostNode);
      return wrapper;
    }
    hostNode.classList.add("page-media-action-shell");
    return hostNode;
  }

  function triggerFileDownload(downloadUrl, filename) {
    if (!downloadUrl) {
      return false;
    }
    var link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename || "";
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }

  function getArticleAssets(article) {
    if (!article) {
      return [];
    }
    var assets = [];
    var images = article.querySelectorAll("img");
    Array.prototype.forEach.call(images, function (imageNode) {
      if (!imageNode) {
        return;
      }
      if (imageNode.closest(".related-reports, .image-lightbox, .topic-card-media")) {
        return;
      }
      var assetUrl = resolvePrimaryAssetUrl(imageNode);
      if (!assetUrl || !isPipelineActionableAssetUrl(assetUrl)) {
        return;
      }
      var figure = imageNode.closest("figure");
      var figureCaption = figure ? figure.querySelector("figcaption") : null;
      var displayLabel = String(
        (figureCaption && figureCaption.textContent)
        || imageNode.getAttribute("alt")
        || document.title
        || "Infographic"
      ).replace(/\s+/g, " ").trim();
      assets.push({
        image: imageNode,
        host: getImageActionHost(imageNode, article),
        url: assetUrl,
        downloadName: getFileNameFromUrl(assetUrl, "image"),
        label: displayLabel
      });
    });
    return assets;
  }

  function getHeroPreviewAsset() {
    var heroMedia = document.querySelector(".article-hero-media");
    if (!heroMedia) {
      return null;
    }
    var heroImage = heroMedia.querySelector("img");
    if (!heroImage) {
      return null;
    }
    var assetUrl = resolvePrimaryAssetUrl(heroImage);
    if (!assetUrl || !isPipelineActionableAssetUrl(assetUrl)) {
      return null;
    }
    return {
      image: heroImage,
      host: heroMedia,
      url: assetUrl,
      downloadName: getFileNameFromUrl(assetUrl, "image"),
          label: String(heroImage.getAttribute("alt") || document.title || "Page preview").trim()
    };
  }

  function isSvgAssetUrl(rawUrl) {
    try {
      var parsed = new URL(String(rawUrl || ""), window.location.href);
      return /\.svg$/i.test(String(parsed.pathname || ""));
    } catch (err) {
      return false;
    }
  }

  function getResolvedImageDisplayUrl(imageNode) {
    if (!imageNode) {
      return "";
    }
    var current = String(imageNode.currentSrc || imageNode.getAttribute("src") || "").trim();
    if (!current) {
      return "";
    }
    try {
      return new URL(current, window.location.href).href;
    } catch (err) {
      return "";
    }
  }

  function canExpandImageAsset(asset) {
    if (!asset || !asset.image) {
      return false;
    }
    var assetUrl = String(asset.url || "").trim();
    if (!assetUrl) {
      return false;
    }
    if (isSvgAssetUrl(assetUrl)) {
      return true;
    }
    var displayedUrl = getResolvedImageDisplayUrl(asset.image);
    if (displayedUrl && displayedUrl !== assetUrl) {
      return true;
    }
    var renderedWidth = 0;
    var renderedHeight = 0;
    if (asset.image.getBoundingClientRect) {
      var rect = asset.image.getBoundingClientRect();
      renderedWidth = Number(rect.width || 0);
      renderedHeight = Number(rect.height || 0);
    }
    var naturalWidth = Number(asset.image.naturalWidth || 0);
    var naturalHeight = Number(asset.image.naturalHeight || 0);
    if (!(naturalWidth > 0 && naturalHeight > 0 && renderedWidth > 0 && renderedHeight > 0)) {
      return false;
    }
    return naturalWidth > renderedWidth * 1.12 || naturalHeight > renderedHeight * 1.12;
  }

  function initPageActionButtons() {
    var shareButtons = document.querySelectorAll("[data-page-share]");
    var copyLinkButtons = document.querySelectorAll("[data-page-copy-link]");
    var socialDownloadButtons = document.querySelectorAll("[data-page-download-social]");
    var copyCitationButtons = document.querySelectorAll("[data-page-copy-citation]");
    var printButtons = document.querySelectorAll("[data-page-print]");
    if (
      !shareButtons.length
      && !copyLinkButtons.length
      && !socialDownloadButtons.length
      && !copyCitationButtons.length
      && !printButtons.length
    ) {
      return;
    }

    function getCanonicalPageUrl() {
      var canonical = document.querySelector('link[rel="canonical"]');
      var rawUrl = canonical ? String(canonical.getAttribute("href") || "").trim() : "";
      try {
        var parsed = new URL(rawUrl || window.location.href, window.location.href);
        parsed.hash = "";
        return parsed.href;
      } catch (err) {
        return String(window.location.href || "").split("#")[0];
      }
    }

    function buildPageCitation() {
      var heading = document.querySelector(".article-hero h1, .article-content h1, h1");
      var siteTitle = document.querySelector(".site-title-full")
        || document.querySelector(".site-title-short")
        || document.querySelector(".site-title");
      var pageTitle = String(heading ? heading.textContent : document.title || "Untitled report")
        .replace(/\s+/g, " ")
        .trim();
      var collectionTitle = String(siteTitle ? siteTitle.textContent : "")
        .replace(/\s+/g, " ")
        .trim();
      var language = String(document.documentElement.lang || "en").trim() || "en";
      var accessedLabel = language.toLowerCase().indexOf("fr") === 0 ? "consulté le" : "accessed";
      var accessedDate = "";
      try {
        accessedDate = new Intl.DateTimeFormat(language, {
          year: "numeric",
          month: "long",
          day: "numeric"
        }).format(new Date());
      } catch (err) {
        accessedDate = new Date().toISOString().slice(0, 10);
      }
      var parts = [pageTitle];
      if (collectionTitle && collectionTitle.toLowerCase() !== pageTitle.toLowerCase()) {
        parts.push(collectionTitle);
      }
      parts.push(getCanonicalPageUrl());
      return parts.join(". ") + " (" + accessedLabel + " " + accessedDate + ").";
    }

    function getPageTitle() {
      var heading = document.querySelector(".article-hero h1, .article-content h1, h1");
      return String(heading ? heading.textContent : document.title || "Untitled report")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getPageShareText() {
      var description = document.querySelector(
        'meta[property="og:image:alt"], meta[name="description"]'
      );
      return String(description ? description.getAttribute("content") || "" : "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getPageSocialImageUrl() {
      var socialImage = document.querySelector('meta[property="og:image"]');
      var rawUrl = socialImage ? String(socialImage.getAttribute("content") || "").trim() : "";
      if (!rawUrl) {
        return "";
      }
      try {
        return new URL(rawUrl, window.location.href).href;
      } catch (err) {
        return "";
      }
    }

    function trackPageDistributionAction(actionName, method) {
      var detail = {
        action: String(actionName || ""),
        method: String(method || ""),
        page_path: String(window.location.pathname || ""),
        page_title: getPageTitle().slice(0, 120)
      };
      document.dispatchEvent(new CustomEvent("phoenix:page-distribution", { detail: detail }));
      if (typeof window.gtag === "function") {
        window.gtag("event", String(actionName || "page_action"), Object.assign({}, detail, {
          transport_type: "beacon"
        }));
      }
    }

    function attachCopyAction(buttons, getValue, successMessageKey, successFallback, analyticsName) {
      Array.prototype.forEach.call(buttons, function (button) {
        button.addEventListener("click", function () {
          copyTextToClipboard(getValue()).then(function () {
            showPageActionToast(getUiString(successMessageKey, successFallback));
            if (analyticsName) {
              trackPageDistributionAction(analyticsName, "clipboard");
            }
          }).catch(function () {
            showPageActionToast(getUiString("copy-failed", "Copy failed"));
          });
        });
      });
    }

    Array.prototype.forEach.call(shareButtons, function (button) {
      button.addEventListener("click", function () {
        var payload = {
          title: getPageTitle(),
          text: getPageShareText(),
          url: getCanonicalPageUrl()
        };
        if (navigator.share && typeof navigator.share === "function") {
          navigator.share(payload).then(function () {
            trackPageDistributionAction("content_share", "native");
            showPageActionToast(getUiString("share-opened", "Share dialog opened"));
          }).catch(function (err) {
            if (err && err.name === "AbortError") {
              return;
            }
            copyTextToClipboard(payload.url).then(function () {
              trackPageDistributionAction("content_share", "clipboard_fallback");
              showPageActionToast(getUiString("share-unavailable", "Sharing unavailable; link copied"));
            }).catch(function () {
              showPageActionToast(getUiString("copy-failed", "Copy failed"));
            });
          });
          return;
        }
        copyTextToClipboard(payload.url).then(function () {
          trackPageDistributionAction("content_share", "clipboard_fallback");
          showPageActionToast(getUiString("share-unavailable", "Sharing unavailable; link copied"));
        }).catch(function () {
          showPageActionToast(getUiString("copy-failed", "Copy failed"));
        });
      });
    });

    Array.prototype.forEach.call(socialDownloadButtons, function (button) {
      button.addEventListener("click", function () {
        var socialImageUrl = getPageSocialImageUrl();
        if (!socialImageUrl || !triggerFileDownload(
          socialImageUrl,
          getFileNameFromUrl(socialImageUrl, "social-image")
        )) {
          showPageActionToast(getUiString("copy-failed", "Download failed"));
          return;
        }
        trackPageDistributionAction("social_asset_download", "download");
        showPageActionToast(getUiString("social-image-downloaded", "Image download started"));
      });
    });

    attachCopyAction(
      copyLinkButtons,
      getCanonicalPageUrl,
      "link-copied",
      "Link copied",
      "copy_link"
    );
    attachCopyAction(copyCitationButtons, buildPageCitation, "citation-copied", "Citation copied");
    Array.prototype.forEach.call(printButtons, function (button) {
      button.addEventListener("click", function () {
        window.print();
      });
    });
  }

  function initImageLightbox() {
    var body = document.body;
    var article = document.querySelector(".article-body");
    if (!article || !body || body.classList.contains("page-home")) {
      return;
    }

    var actionableAssets = getArticleAssets(article);
    var heroPreviewAsset = getHeroPreviewAsset();
    if (heroPreviewAsset) {
      actionableAssets.unshift(heroPreviewAsset);
    }
    if (!actionableAssets.length) {
      return;
    }

    var overlay = document.createElement("div");
    overlay.className = "image-lightbox";
    overlay.setAttribute("hidden", "hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Expanded image viewer");
    overlay.innerHTML = ""
      + "<div class=\"image-lightbox-stage\" role=\"document\">"
      + "<button type=\"button\" class=\"image-lightbox-close\" aria-label=\"Close image viewer\">Close</button>"
      + "<img class=\"image-lightbox-image\" alt=\"\">"
      + "</div>"
      + "<p class=\"image-lightbox-caption\"></p>";
    document.body.appendChild(overlay);

    var closeButton = overlay.querySelector(".image-lightbox-close");
    var stageImage = overlay.querySelector(".image-lightbox-image");
    var stageCaption = overlay.querySelector(".image-lightbox-caption");
    var previousOverflow = "";
    var previouslyFocusedElement = null;

    function closeOverlay(restoreFocus) {
      overlay.setAttribute("hidden", "hidden");
      overlay.setAttribute("aria-hidden", "true");
      stageImage.removeAttribute("src");
      stageImage.removeAttribute("data-theme-src-dark");
      stageImage.removeAttribute("data-theme-src-light");
      stageImage.alt = "";
      if (stageCaption) {
        stageCaption.textContent = "";
      }
      document.body.style.overflow = previousOverflow || "";
      previousOverflow = "";
      if (restoreFocus !== false && previouslyFocusedElement && typeof previouslyFocusedElement.focus === "function") {
        previouslyFocusedElement.focus();
      }
      previouslyFocusedElement = null;
    }

    function openOverlay(asset) {
      if (!asset || !asset.image) {
        return;
      }
      if (!overlay.hasAttribute("hidden")) {
        return;
      }
      var src = String(asset.url || "").trim();
      var darkSrc = String(asset.image.getAttribute("data-theme-src-dark") || "").trim();
      var lightSrc = String(asset.image.getAttribute("data-theme-src-light") || "").trim();
      if (darkSrc && lightSrc) {
        src = document.documentElement.getAttribute("data-theme") === "dark" ? darkSrc : lightSrc;
      }
      if (!src) {
        return;
      }
      var alt = String(asset.label || asset.image.getAttribute("alt") || "").trim();
      previouslyFocusedElement = document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : asset.image;
      previousOverflow = document.body.style.overflow || "";
      stageImage.src = src;
      if (darkSrc && lightSrc) {
        stageImage.setAttribute("data-theme-src-dark", darkSrc);
        stageImage.setAttribute("data-theme-src-light", lightSrc);
      } else {
        stageImage.removeAttribute("data-theme-src-dark");
        stageImage.removeAttribute("data-theme-src-light");
      }
      stageImage.alt = alt;
      if (stageCaption) {
        stageCaption.textContent = alt;
      }
      overlay.removeAttribute("hidden");
      overlay.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      window.requestAnimationFrame(function () {
        if (closeButton && typeof closeButton.focus === "function") {
          closeButton.focus();
        }
      });
    }

    function attachImageHandler(asset) {
      if (!asset || !asset.image) {
        return;
      }
      var imageNode = asset.image;
      if (imageNode.classList.contains("zoomable-image")) {
        return;
      }
      var hostNode = ensureMediaActionHost(asset.host || getImageActionHost(imageNode, article));
        if (hostNode && hostNode.classList) {
          hostNode.classList.add("has-lightbox-affordance");
          if (!hostNode.querySelector("[data-lightbox-affordance]")) {
            var affordance = document.createElement("span");
            affordance.className = "image-lightbox-affordance";
            affordance.setAttribute("data-lightbox-affordance", "true");
            affordance.innerHTML = '<span class="image-lightbox-affordance-icon" aria-hidden="true">+</span><span class="image-lightbox-affordance-label">View Large</span>';
            hostNode.appendChild(affordance);
          }
        }
      imageNode.classList.add("zoomable-image");
      var parentLink = imageNode.closest("a");
      var altText = String(imageNode.getAttribute("alt") || "").trim();
      var accessibleLabel = altText ? ("Expand image: " + altText) : "Expand image";
      if (parentLink) {
        parentLink.setAttribute("aria-label", accessibleLabel);
        imageNode.removeAttribute("tabindex");
        imageNode.removeAttribute("role");
      } else {
        imageNode.setAttribute("tabindex", "0");
        imageNode.setAttribute("role", "button");
        if (!imageNode.getAttribute("aria-label")) {
          imageNode.setAttribute("aria-label", accessibleLabel);
        }
      }

      imageNode.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openOverlay(asset);
      });

      imageNode.addEventListener("keydown", function (event) {
        var key = String(event.key || "");
        if (key === "Enter" || key === " ") {
          event.preventDefault();
          event.stopPropagation();
          openOverlay(asset);
        }
      });

      if (parentLink) {
        parentLink.addEventListener("click", function (event) {
          if (event.target === imageNode) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          openOverlay(asset);
        });
      }
    }

    Array.prototype.forEach.call(actionableAssets, function (asset) {
      if (!asset || !asset.image) {
        return;
      }
      var evaluateExpandability = function () {
        if (canExpandImageAsset(asset)) {
          attachImageHandler(asset);
        }
      };
      if (asset.image.complete) {
        evaluateExpandability();
        return;
      }
      asset.image.addEventListener("load", evaluateExpandability, { once: true });
    });

    if (closeButton) {
      closeButton.addEventListener("click", function () {
        closeOverlay(true);
      });
    }

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        closeOverlay(true);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (overlay.hasAttribute("hidden")) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlay(true);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        if (closeButton && typeof closeButton.focus === "function") {
          closeButton.focus();
        }
      }
    });
  }

  PhoenixUI.initializers.articleToc = buildPageToc;
  PhoenixUI.initializers.articleEndnotes = initEndnotesCollapsing;
  PhoenixUI.initializers.articleActions = initPageActionButtons;
  PhoenixUI.initializers.articleLightbox = initImageLightbox;
})();
