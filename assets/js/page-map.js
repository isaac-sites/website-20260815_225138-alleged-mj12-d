(function() {
  "use strict";

  var PhoenixUI = window.PhoenixUI = window.PhoenixUI || { initializers: {} };
  PhoenixUI.initializers = PhoenixUI.initializers || {};
  var escapeHtml = PhoenixUI.escapeHtml;

  function initUapWorldMap() {
    var roots = document.querySelectorAll('[data-interactive-map], [data-uap-world-map]');
    if (!roots.length) {
      return;
    }
    Array.prototype.forEach.call(roots, function(root) {
    if (root.__interactiveMapInitialized) {
      return;
    }
    root.__interactiveMapInitialized = true;
    var canvas = root.querySelector('[data-interactive-map-canvas], [data-uap-world-map-canvas]');
    var preview = root.querySelector('[data-interactive-map-preview], [data-uap-world-map-preview]');
    var mapSrc = root.getAttribute('data-map-src');
    var dataSrc = root.getAttribute('data-map-data-src');
    var itemType = root.getAttribute('data-map-item-type') || 'country';
    var itemTypeTitle = itemType.charAt(0).toUpperCase() + itemType.slice(1);
    var mapLabel = root.getAttribute('data-map-label') || 'Interactive map';
    var fallbackSummary = root.getAttribute('data-map-fallback-summary') || 'Open this item from the map.';
    var previewPreloadLimit = root.getAttribute('data-map-preview-preload') || 'all';
    var mapFitMode = root.getAttribute('data-map-fit') || '';
    var mapLayout = String(root.getAttribute('data-map-layout') || '').trim().toLowerCase();
    var initialItemId = String(root.getAttribute('data-map-initial-item') || '').trim().toUpperCase();
    if (!canvas || !mapSrc || !dataSrc) {
      return;
    }
    var loadText = function(url) {
      if (typeof fetch === 'function') {
        return fetch(url, { credentials: 'same-origin' }).then(function(res) {
          if (!res.ok) {
            throw new Error('Failed to load ' + url);
          }
          return res.text();
        });
      }
      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.responseText);
          } else {
            reject(new Error('Failed to load ' + url));
          }
        };
        xhr.onerror = function() { reject(new Error('Failed to load ' + url)); };
        xhr.send();
      });
    };
    var loadTextWithRetry = function(url) {
      return loadText(url).catch(function(firstError) {
        return new Promise(function(resolve) {
          window.setTimeout(resolve, 180);
        }).then(function() {
          return loadText(url);
        }).catch(function() {
          throw firstError;
        });
      });
    };

    var siteAssetBase = (function() {
      var source = String(mapSrc || dataSrc || '').trim();
      try {
        var sourceUrl = new URL(source || '.', document.baseURI);
        var path = sourceUrl.pathname || '';
        var marker = path.indexOf('/assets/');
        if (marker !== -1) {
          sourceUrl.pathname = path.slice(0, marker + 1);
          sourceUrl.search = '';
          sourceUrl.hash = '';
          return sourceUrl.href;
        }
      } catch (err) {
        return document.baseURI;
      }
      return document.baseURI;
    })();

    var resolveSiteAssetUrl = function(url) {
      var value = String(url || '').trim();
      if (!value) {
        return '';
      }
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) {
        return value;
      }
      try {
        return new URL(value.replace(/^\/+/, ''), siteAssetBase).href;
      } catch (err) {
        return value;
      }
    };
    var cp1252ReverseMap = {
      0x20AC: 0x80,
      0x201A: 0x82,
      0x0192: 0x83,
      0x201E: 0x84,
      0x2026: 0x85,
      0x2020: 0x86,
      0x2021: 0x87,
      0x02C6: 0x88,
      0x2030: 0x89,
      0x0160: 0x8A,
      0x2039: 0x8B,
      0x0152: 0x8C,
      0x017D: 0x8E,
      0x2018: 0x91,
      0x2019: 0x92,
      0x201C: 0x93,
      0x201D: 0x94,
      0x2022: 0x95,
      0x2013: 0x96,
      0x2014: 0x97,
      0x02DC: 0x98,
      0x2122: 0x99,
      0x0161: 0x9A,
      0x203A: 0x9B,
      0x0153: 0x9C,
      0x017E: 0x9E,
      0x0178: 0x9F
    };
    var repairMojibakeText = function(value) {
      var text = String(value || '');
      if (!/[ÃÂâ�]/.test(text)) {
        return text;
      }
      try {
        if (typeof TextDecoder === 'function') {
          var bytes = [];
          for (var i = 0; i < text.length; i += 1) {
            var code = text.charCodeAt(i);
            if (code <= 0xFF) {
              bytes.push(code);
            } else if (cp1252ReverseMap[code]) {
              bytes.push(cp1252ReverseMap[code]);
            } else {
              return text;
            }
          }
          var decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
          if (decoded && !/[ÃÂâ�]\uFFFD?/.test(decoded)) {
            return decoded;
          }
        }
      } catch (err) {}
      return text
        .replace(/\u00e2\u20ac\u2122/g, '\u2019')
        .replace(/\u00e2\u20ac\u0153/g, '\u201c')
        .replace(/\u00e2\u20ac\u009d/g, '\u201d')
        .replace(/\u00e2\u20ac\u009d/g, '\u201d')
        .replace(/\u00e2\u20ac\u2018/g, '-')
        .replace(/\u00e2\u20ac\u2011/g, '-')
        .replace(/\u00e2\u20ac\u201d/g, '\u2014')
        .replace(/\u00e2\u20ac\u201c/g, '\u2013')
        .replace(/\u00e2\u20ac\u00a6/g, '\u2026')
        .replace(/\u00c3\u00bc/g, '\u00fc')
        .replace(/\u00c3\u00b4/g, '\u00f4')
        .replace(/\u00c3\u00a9/g, '\u00e9')
        .replace(/\u00c3\u00a3/g, '\u00e3');
    };
    var normaliseMapItemText = function(item) {
      if (!item || typeof item !== 'object') {
        return item;
      }
      Object.keys(item).forEach(function(key) {
        if (typeof item[key] === 'string') {
          item[key] = repairMojibakeText(item[key]);
        }
      });
      return item;
    };
    var getItemLabel = function(item) {
      return item && (item.displayLabel || item.label || item.country || item.mapName || itemTypeTitle);
    };
    var getItemTitle = function(item) {
      return item && (item.displayTitle || item.title || item.displayLabel || item.label || item.country || itemTypeTitle);
    };
    var normalisePreviewHeadingText = function(value) {
      return String(value || '').toLowerCase().replace(/&amp;/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
    };
    var shouldShowPreviewKicker = function(label, title) {
      var labelKey = normalisePreviewHeadingText(label);
      var titleKey = normalisePreviewHeadingText(title);
      if (!labelKey || !titleKey || labelKey === titleKey) {
        return false;
      }
      if (labelKey.length > 8 && titleKey.indexOf(labelKey) !== -1) {
        return false;
      }
      if (titleKey.length > 8 && labelKey.indexOf(titleKey) !== -1) {
        return false;
      }
      return true;
    };
    var getItemSummary = function(item) {
      return item && (item.displaySummary || item.summary || fallbackSummary);
    };
    var getItemCode = function(item) {
      if (item && item.hideCode) {
        return '';
      }
      return item && (item.displayCode || item.code || item.iso || item.id || '');
    };
    var getItemRegionLabel = function(item) {
      if (!item) {
        return '';
      }
      return item.displayRegion || item.regionLabel || item.region || item.subregion || '';
    };
    var normaliseRegionKey = function(value) {
      return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    };
    var getItemRegionKey = function(item) {
      if (!item) {
        return '';
      }
      return normaliseRegionKey(item.regionKey || item.region || item.displayRegion || item.regionLabel || item.subregion);
    };
    var getItemCountLabel = function(item) {
      if (!item) {
        return '';
      }
      var rawCount = item.displayCount || item.countLabel || item.pageCount || item.count || item.pages || item.total;
      if (rawCount === null || typeof rawCount === 'undefined' || rawCount === '') {
        return '';
      }
      if (typeof rawCount === 'string' && /\D/.test(rawCount)) {
        return rawCount;
      }
      var count = Number(rawCount);
      if (!isFinite(count) || count < 1) {
        return '';
      }
      return String(count) + (count === 1 ? ' page' : ' pages');
    };
    var getPreviewMetaHtml = function(item) {
      var chips = [];
      var code = String(getItemCode(item) || '').trim();
      var region = String(getItemRegionLabel(item) || '').trim();
      var count = String(getItemCountLabel(item) || '').trim();
      if (code) {
        chips.push('<span class="interactive-map-preview-chip uap-world-map-preview-chip">' + escapeHtml(code) + '</span>');
      }
      if (region) {
        var regionKey = getItemRegionKey(item);
        if (regionKey) {
          chips.push(
            '<button type="button" class="interactive-map-preview-chip uap-world-map-preview-chip interactive-map-preview-chip-action uap-world-map-preview-chip-action" '
            + 'data-interactive-map-continent-focus="' + escapeHtml(regionKey) + '" '
            + 'data-uap-world-map-region-focus="' + escapeHtml(regionKey) + '" '
            + 'aria-label="Focus map on ' + escapeHtml(region) + '">' + escapeHtml(region) + '</button>'
          );
        } else {
          chips.push('<span class="interactive-map-preview-chip uap-world-map-preview-chip">' + escapeHtml(region) + '</span>');
        }
      }
      if (count) {
        chips.push('<span class="interactive-map-preview-count uap-world-map-preview-count">' + escapeHtml(count) + '</span>');
      }
      return chips.length ? '<span class="interactive-map-preview-meta uap-world-map-preview-meta">' + chips.join('') + '</span>' : '';
    };
    var warmedPreviewImages = {};
    var warmPreviewImage = function(item) {
      var imageUrl = item && resolveSiteAssetUrl(item.image);
      if (!imageUrl || warmedPreviewImages[imageUrl]) {
        return;
      }
      warmedPreviewImages[imageUrl] = true;
      var image = new Image();
      image.decoding = 'async';
      image.loading = 'eager';
      image.src = imageUrl;
    };
    var preloadPreviewImages = function(items) {
      if (!items || !items.length) {
        return;
      }
      var limit = String(previewPreloadLimit || '').toLowerCase() === 'all'
        ? items.length
        : Math.max(0, parseInt(previewPreloadLimit, 10) || 0);
      var queue = items.filter(function(item) { return item && item.image; }).slice(0, limit);
      if (!queue.length) {
        return;
      }
      var preloadNext = function() {
        var started = 0;
        while (queue.length && started < 4) {
          warmPreviewImage(queue.shift());
          started += 1;
        }
        if (!queue.length) {
          return;
        }
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(preloadNext, { timeout: 1800 });
        } else {
          window.setTimeout(preloadNext, 140);
        }
      };
      window.setTimeout(preloadNext, 450);
    };
    var bindPreviewImageFallback = function() {
      if (!preview) {
        return;
      }
      var image = preview.querySelector('img');
      if (!image) {
        preview.classList.remove('is-image-loading');
        preview.removeAttribute('aria-busy');
        preview.classList.add('is-image-missing');
        return;
      }
      var removeBrokenImage = function() {
        if (image.parentNode === preview) {
          preview.removeChild(image);
        }
        preview.classList.remove('is-image-loading');
        preview.removeAttribute('aria-busy');
        preview.classList.add('is-image-missing');
      };
      image.addEventListener('load', function() {
        preview.classList.remove('is-image-loading');
        preview.removeAttribute('aria-busy');
        preview.classList.remove('is-image-missing');
      }, { once: true });
      image.addEventListener('error', removeBrokenImage, { once: true });
      if (image.complete && !image.naturalWidth) {
        removeBrokenImage();
      } else if (!image.complete) {
        preview.classList.add('is-image-loading');
        preview.setAttribute('aria-busy', 'true');
      }
    };
    bindPreviewImageFallback();

    var inlineDataNode = root.querySelector('[data-interactive-map-data], [data-uap-world-map-data]');
    var inlineSvg = canvas.querySelector('svg');
    var setMapState = function(state, message) {
      root.setAttribute('data-map-state', state);
      var currentStatus = canvas.querySelector('.interactive-map-status, .uap-world-map-status');
      if (!message) {
        if (currentStatus && currentStatus.parentNode === canvas) {
          canvas.removeChild(currentStatus);
        }
        return;
      }
      if (!currentStatus) {
        currentStatus = document.createElement('span');
        currentStatus.className = 'interactive-map-status uap-world-map-status';
        currentStatus.setAttribute('role', 'status');
        currentStatus.setAttribute('aria-live', 'polite');
        canvas.appendChild(currentStatus);
      }
      currentStatus.textContent = message;
    };
    if (inlineSvg) {
      setMapState('initializing', 'Preparing map…');
    } else {
      setMapState('loading', 'Loading map…');
    }
    var countryAliases = {
      UK: 'GB',
      EL: 'GR'
    };
    var timezoneCountryRules = [
      [/^Europe\/London$/i, 'GB'],
      [/^Europe\/Dublin$/i, 'IE'],
      [/^America\/(New_York|Detroit|Kentucky|Indiana|Chicago|North_Dakota|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Adak|Honolulu)$/i, 'US'],
      [/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Regina|Halifax|St_Johns|Moncton|Whitehorse|Yellowknife|Iqaluit)$/i, 'CA'],
      [/^Australia\//i, 'AU'],
      [/^Pacific\/(Auckland|Chatham)$/i, 'NZ'],
      [/^Europe\/Paris$/i, 'FR'],
      [/^Europe\/Berlin$/i, 'DE'],
      [/^Europe\/Madrid$/i, 'ES'],
      [/^Europe\/Rome$/i, 'IT'],
      [/^Europe\/Amsterdam$/i, 'NL'],
      [/^Europe\/Brussels$/i, 'BE'],
      [/^Europe\/Zurich$/i, 'CH'],
      [/^Europe\/Stockholm$/i, 'SE'],
      [/^Europe\/Oslo$/i, 'NO'],
      [/^Europe\/Copenhagen$/i, 'DK'],
      [/^Europe\/Helsinki$/i, 'FI'],
      [/^Europe\/Warsaw$/i, 'PL'],
      [/^Europe\/Prague$/i, 'CZ'],
      [/^Europe\/Vienna$/i, 'AT'],
      [/^Europe\/Lisbon$/i, 'PT'],
      [/^America\/Mexico_City$/i, 'MX'],
      [/^America\/Sao_Paulo$/i, 'BR'],
      [/^America\/Buenos_Aires$/i, 'AR'],
      [/^America\/Santiago$/i, 'CL'],
      [/^Asia\/(Tokyo)$/i, 'JP'],
      [/^Asia\/(Seoul)$/i, 'KR'],
      [/^Asia\/(Shanghai|Hong_Kong)$/i, 'CN'],
      [/^Asia\/(Kolkata|Calcutta)$/i, 'IN'],
      [/^Asia\/Singapore$/i, 'SG'],
      [/^Asia\/Dubai$/i, 'AE'],
      [/^Africa\/Johannesburg$/i, 'ZA'],
      [/^Africa\/Lagos$/i, 'NG']
    ];
    var normaliseCountryIso = function(value) {
      var iso = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
      if (countryAliases[iso]) {
        iso = countryAliases[iso];
      }
      return iso.length === 2 ? iso : '';
    };
    var inferCountryFromTimezone = function(availableCountries) {
      var timezone = '';
      try {
        timezone = String(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
      } catch (err) {}
      if (!timezone) {
        return '';
      }
      for (var i = 0; i < timezoneCountryRules.length; i += 1) {
        var rule = timezoneCountryRules[i];
        if (rule[0].test(timezone) && availableCountries[rule[1]]) {
          return rule[1];
        }
      }
      return '';
    };
    var inferCountryFromLocale = function(availableCountries) {
      var languages = [];
      try {
        if (navigator.languages && navigator.languages.length) {
          languages = Array.prototype.slice.call(navigator.languages);
        } else if (navigator.language) {
          languages = [navigator.language];
        }
      } catch (err) {}
      for (var i = 0; i < languages.length; i += 1) {
        var parts = String(languages[i] || '').replace(/_/g, '-').split('-');
        if (parts.length < 2) {
          continue;
        }
        var iso = normaliseCountryIso(parts[parts.length - 1]);
        if (iso && availableCountries[iso]) {
          return iso;
        }
      }
      return '';
    };
    var guessVisitorCountryIso = function(availableCountries) {
      return inferCountryFromTimezone(availableCountries) || inferCountryFromLocale(availableCountries) || '';
    };
    var mapDataUnavailable = false;
    var dataPromise = inlineDataNode && inlineSvg
      ? Promise.resolve([null, JSON.parse(inlineDataNode.textContent || '{}'), true])
      : Promise.all([
        loadTextWithRetry(mapSrc).then(function(svgText) {
          // Insert the base map as soon as it arrives. A slow or temporarily
          // unavailable metadata request must not leave the mobile canvas blank.
          canvas.innerHTML = svgText;
          return svgText;
        }),
        loadTextWithRetry(dataSrc).then(function(text) {
          return JSON.parse(text);
        }).catch(function() {
          mapDataUnavailable = true;
          return { items: [], countries: [] };
        }),
        Promise.resolve(false)
      ]);

    dataPromise.then(function(results) {
      var svgText = results[0];
      var mapData = results[1] || {};
      var isInline = !!results[2];
      var byIso = {};
      (mapData.items || mapData.countries || []).forEach(function(item) {
        item = normaliseMapItemText(item);
        var id = item && (item.id || item.iso);
        if (id) {
          byIso[String(id).toUpperCase()] = item;
        }
      });
      preloadPreviewImages(Object.keys(byIso).map(function(iso) { return byIso[iso]; }));
      if (!isInline) {
        // The SVG was inserted as soon as it loaded so it remained visible
        // while the metadata request completed.
      }
      var svg = canvas.querySelector('svg');
      if (!svg) {
        throw new Error('Map SVG did not contain an svg element.');
      }
      var contextShapeMapLayouts = {
        'world': true,
        'canada': true,
        'australia': true,
        'france-departments': true,
        'spain-provinces': true,
        'italy-regions': true,
        'germany-states': true
      };
      root.addEventListener('click', function(event) {
        event.stopPropagation();
      });
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', mapLabel);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      var zoomState = { scale: 1, x: 0, y: 0 };
      var minZoom = 1;
      var maxZoom = 6;
      var panButtons = {};
      var getPanLimits = function() {
        var rect = canvas.getBoundingClientRect();
        var width = rect.width || 0;
        var height = rect.height || 0;
        return {
          maxX: Math.max(0, width * (zoomState.scale - 1)),
          maxY: Math.max(0, height * (zoomState.scale - 1))
        };
      };
      var setPanButtonState = function(direction, isAvailable) {
        var button = panButtons[direction];
        if (!button) {
          return;
        }
        button.hidden = !isAvailable;
        button.disabled = !isAvailable;
        button.classList.toggle('is-available', Boolean(isAvailable));
        button.setAttribute('aria-hidden', isAvailable ? 'false' : 'true');
        button.setAttribute('tabindex', isAvailable ? '0' : '-1');
      };
      var updatePanControls = function() {
        var limits = getPanLimits();
        var isZoomed = zoomState.scale > 1.01;
        var tolerance = 1;
        setPanButtonState('left', isZoomed && zoomState.x < -tolerance);
        setPanButtonState('right', isZoomed && zoomState.x > -limits.maxX + tolerance);
        setPanButtonState('up', isZoomed && zoomState.y < -tolerance);
        setPanButtonState('down', isZoomed && zoomState.y > -limits.maxY + tolerance);
      };
      var applyZoom = function() {
        svg.style.transform = 'translate(' + zoomState.x + 'px, ' + zoomState.y + 'px) scale(' + zoomState.scale + ')';
        svg.style.transformOrigin = '0 0';
        root.setAttribute('data-interactive-map-zoom', zoomState.scale > 1.01 ? 'zoomed' : 'default');
        root.setAttribute('data-uap-world-map-zoom', zoomState.scale > 1.01 ? 'zoomed' : 'default');
        updatePanControls();
      };
      var clampPan = function() {
        var limits = getPanLimits();
        zoomState.x = Math.min(0, Math.max(-limits.maxX, zoomState.x));
        zoomState.y = Math.min(0, Math.max(-limits.maxY, zoomState.y));
      };
      var setZoom = function(nextScale, originX, originY) {
        var rect = canvas.getBoundingClientRect();
        var oldScale = zoomState.scale;
        var scale = Math.max(minZoom, Math.min(maxZoom, nextScale));
        var localX = typeof originX === 'number' ? originX : rect.width / 2;
        var localY = typeof originY === 'number' ? originY : rect.height / 2;
        if (Math.abs(scale - oldScale) < 0.001) {
          return;
        }
        zoomState.x = localX - ((localX - zoomState.x) * scale / oldScale);
        zoomState.y = localY - ((localY - zoomState.y) * scale / oldScale);
        zoomState.scale = scale;
        clampPan();
        applyZoom();
      };
      var resetZoom = function() {
        zoomState = { scale: 1, x: 0, y: 0 };
        applyZoom();
      };
      var panBy = function(deltaX, deltaY) {
        if (zoomState.scale <= 1.01) {
          return;
        }
        zoomState.x += deltaX;
        zoomState.y += deltaY;
        clampPan();
        applyZoom();
      };
      var zoomToNode = function(node, nextScale) {
        var canvasRect = canvas.getBoundingClientRect();
        var nodeRect = node.getBoundingClientRect();
        if (!canvasRect.width || !canvasRect.height || !nodeRect.width || !nodeRect.height) {
          return;
        }
        var screenX = nodeRect.left - canvasRect.left + nodeRect.width / 2;
        var screenY = nodeRect.top - canvasRect.top + nodeRect.height / 2;
        var worldX = (screenX - zoomState.x) / zoomState.scale;
        var worldY = (screenY - zoomState.y) / zoomState.scale;
        zoomState.scale = Math.max(minZoom, Math.min(maxZoom, nextScale));
        zoomState.x = canvasRect.width / 2 - worldX * zoomState.scale;
        zoomState.y = canvasRect.height / 2 - worldY * zoomState.scale;
        clampPan();
        applyZoom();
      };
      var controls = document.createElement('div');
      controls.className = 'interactive-map-controls uap-world-map-controls';
      controls.setAttribute('aria-label', 'Map zoom controls');
      controls.setAttribute('role', 'group');
      var panControls = document.createElement('div');
      panControls.className = 'interactive-map-pan-controls uap-world-map-pan-controls';
      panControls.setAttribute('aria-label', 'Map pan controls');
      panControls.setAttribute('role', 'group');
      var makeZoomButton = function(label, ariaLabel, handler) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'interactive-map-control uap-world-map-control';
        button.textContent = label;
        button.setAttribute('aria-label', ariaLabel);
        button.addEventListener('click', function(event) {
          event.preventDefault();
          handler();
        });
        return button;
      };
      var makePanButton = function(direction, label, ariaLabel, handler) {
        var button = makeZoomButton(label, ariaLabel, handler);
        button.className += ' interactive-map-pan-control uap-world-map-pan-control interactive-map-pan-control-' + direction;
        button.hidden = true;
        button.disabled = true;
        button.setAttribute('aria-hidden', 'true');
        panButtons[direction] = button;
        return button;
      };
      controls.appendChild(makeZoomButton('+', 'Zoom in', function() { setZoom(zoomState.scale * 1.35); }));
      controls.appendChild(makeZoomButton('-', 'Zoom out', function() { setZoom(zoomState.scale / 1.35); }));
      controls.appendChild(makeZoomButton('Reset', 'Reset map zoom', resetZoom));
      panControls.appendChild(makePanButton('left', '\u2190', 'Move map view left', function() {
        panBy(Math.max(80, canvas.getBoundingClientRect().width * 0.18), 0);
      }));
      panControls.appendChild(makePanButton('up', '\u2191', 'Move map view up', function() {
        panBy(0, Math.max(70, canvas.getBoundingClientRect().height * 0.18));
      }));
      panControls.appendChild(makePanButton('down', '\u2193', 'Move map view down', function() {
        panBy(0, -Math.max(70, canvas.getBoundingClientRect().height * 0.18));
      }));
      panControls.appendChild(makePanButton('right', '\u2192', 'Move map view right', function() {
        panBy(-Math.max(80, canvas.getBoundingClientRect().width * 0.18), 0);
      }));
      canvas.appendChild(controls);
      canvas.appendChild(panControls);
      canvas.addEventListener('wheel', function(event) {
        event.preventDefault();
        var rect = canvas.getBoundingClientRect();
        var factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
        setZoom(zoomState.scale * factor, event.clientX - rect.left, event.clientY - rect.top);
      }, { passive: false });
      window.addEventListener('resize', function() {
        clampPan();
        applyZoom();
      });
      var dragState = null;
      var activePointers = {};
      var pinchState = null;
      var lastPointerCountryIso = '';
      var lastPointerMoved = false;
      var getActivePointerList = function() {
        return Object.keys(activePointers).map(function(pointerId) {
          return activePointers[pointerId];
        }).filter(Boolean);
      };
      var getPointerDistance = function(first, second) {
        var dx = Number(second.clientX || 0) - Number(first.clientX || 0);
        var dy = Number(second.clientY || 0) - Number(first.clientY || 0);
        return Math.sqrt(dx * dx + dy * dy);
      };
      var getPointerCenter = function(first, second) {
        var rect = canvas.getBoundingClientRect();
        return {
          x: ((Number(first.clientX || 0) + Number(second.clientX || 0)) / 2) - rect.left,
          y: ((Number(first.clientY || 0) + Number(second.clientY || 0)) / 2) - rect.top
        };
      };
      var beginPinchZoom = function(pointerList) {
        if (!pointerList || pointerList.length < 2) {
          pinchState = null;
          return;
        }
        var first = pointerList[0];
        var second = pointerList[1];
        var distance = getPointerDistance(first, second);
        if (!(distance > 0)) {
          pinchState = null;
          return;
        }
        var center = getPointerCenter(first, second);
        pinchState = {
          pointerIds: [String(first.pointerId), String(second.pointerId)],
          distance: distance,
          scale: zoomState.scale,
          worldX: (center.x - zoomState.x) / zoomState.scale,
          worldY: (center.y - zoomState.y) / zoomState.scale
        };
        dragState = null;
        canvas.classList.add('is-panning');
      };
      var updatePinchZoom = function() {
        if (!pinchState) {
          return false;
        }
        var first = activePointers[pinchState.pointerIds[0]];
        var second = activePointers[pinchState.pointerIds[1]];
        if (!first || !second) {
          pinchState = null;
          return false;
        }
        var distance = getPointerDistance(first, second);
        if (!(distance > 0)) {
          return false;
        }
        var center = getPointerCenter(first, second);
        zoomState.scale = Math.max(minZoom, Math.min(maxZoom, pinchState.scale * (distance / pinchState.distance)));
        zoomState.x = center.x - pinchState.worldX * zoomState.scale;
        zoomState.y = center.y - pinchState.worldY * zoomState.scale;
        lastPointerMoved = true;
        lastPointerCountryIso = '';
        clampPan();
        applyZoom();
        return true;
      };
      var clearPointer = function(event) {
        if (!event || typeof event.pointerId === 'undefined') {
          return;
        }
        delete activePointers[String(event.pointerId)];
      };
      var capturePointer = function(pointerId) {
        try {
          canvas.setPointerCapture(pointerId);
        } catch (err) {}
      };
      var navigateToItem = function(item) {
        if (item && item.url) {
          window.location.href = resolveSiteAssetUrl(item.url);
        }
      };
      canvas.addEventListener('pointerdown', function(event) {
        if (event.target && event.target.closest && event.target.closest('.interactive-map-controls, .uap-world-map-controls, .interactive-map-pan-controls, .uap-world-map-pan-controls')) {
          return;
        }
        activePointers[String(event.pointerId)] = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerType: event.pointerType || ''
        };
        var pointerList = getActivePointerList();
        if (pointerList.length >= 2) {
          event.preventDefault();
          pointerList.forEach(function(pointerInfo) {
            capturePointer(pointerInfo.pointerId);
          });
          lastPointerMoved = true;
          lastPointerCountryIso = '';
          beginPinchZoom(pointerList);
          return;
        }
        lastPointerMoved = false;
        lastPointerCountryIso = '';
        if (event.target && event.target.closest) {
          var countryTarget = event.target.closest('[data-interactive-map-item], [data-uap-country]');
          if (countryTarget) {
            lastPointerCountryIso = String(countryTarget.getAttribute('data-interactive-map-item') || countryTarget.getAttribute('data-uap-country') || '').toUpperCase();
          }
        }
        if (zoomState.scale <= 1.01) {
          return;
        }
        if (event.pointerType === 'touch') {
          return;
        }
        dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: zoomState.x,
          originY: zoomState.y
        };
        capturePointer(event.pointerId);
        canvas.classList.add('is-panning');
      });
      canvas.addEventListener('pointermove', function(event) {
        if (activePointers[String(event.pointerId)]) {
          activePointers[String(event.pointerId)].clientX = event.clientX;
          activePointers[String(event.pointerId)].clientY = event.clientY;
        }
        if (pinchState) {
          event.preventDefault();
          updatePinchZoom();
          return;
        }
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }
        if (Math.abs(event.clientX - dragState.startX) > 5 || Math.abs(event.clientY - dragState.startY) > 5) {
          lastPointerMoved = true;
        }
        zoomState.x = dragState.originX + event.clientX - dragState.startX;
        zoomState.y = dragState.originY + event.clientY - dragState.startY;
        clampPan();
        applyZoom();
      });
      var endPan = function(event) {
        clearPointer(event);
        if (pinchState) {
          if (getActivePointerList().length >= 2) {
            beginPinchZoom(getActivePointerList());
          } else {
            pinchState = null;
            dragState = null;
            canvas.classList.remove('is-panning');
          }
          return;
        }
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }
        dragState = null;
        canvas.classList.remove('is-panning');
      };
      canvas.addEventListener('pointerup', endPan);
      canvas.addEventListener('pointercancel', endPan);
      canvas.addEventListener('pointerleave', function(event) {
        if (event.pointerType === 'touch') {
          endPan(event);
        }
      });
      canvas.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        if (lastPointerMoved) {
          lastPointerMoved = false;
          lastPointerCountryIso = '';
          return;
        }
        var countryNode = event.target && event.target.closest ? event.target.closest('[data-interactive-map-item], [data-uap-country]') : null;
        var iso = countryNode
          ? String(countryNode.getAttribute('data-interactive-map-item') || countryNode.getAttribute('data-uap-country') || '').toUpperCase()
          : lastPointerCountryIso;
        lastPointerCountryIso = '';
        if (iso && byIso[iso]) {
          navigateToItem(byIso[iso]);
        }
      });
      applyZoom();
      var active = null;
      var activeItem = null;
      var nodesByIso = {};
      var fitSvgToLinkedBounds = function() {
        if (mapFitMode !== 'linked-bounds' || !svg.createSVGPoint) {
          return;
        }
        var matrix = null;
        try {
          matrix = svg.getScreenCTM();
        } catch (err) {
          matrix = null;
        }
        if (!matrix) {
          return;
        }
        var inverse = matrix.inverse();
        var point = svg.createSVGPoint();
        var bounds = null;
        var addClientPoint = function(clientX, clientY) {
          point.x = clientX;
          point.y = clientY;
          var svgPoint = point.matrixTransform(inverse);
          if (!bounds) {
            bounds = {
              left: svgPoint.x,
              top: svgPoint.y,
              right: svgPoint.x,
              bottom: svgPoint.y
            };
            return;
          }
          bounds.left = Math.min(bounds.left, svgPoint.x);
          bounds.top = Math.min(bounds.top, svgPoint.y);
          bounds.right = Math.max(bounds.right, svgPoint.x);
          bounds.bottom = Math.max(bounds.bottom, svgPoint.y);
        };
        Object.keys(nodesByIso).forEach(function(iso) {
          forEachMapNode(nodesByIso[iso], function(node) {
            if (!node || !node.getBoundingClientRect) {
              return;
            }
            var rect = node.getBoundingClientRect();
            if (!rect || !rect.width || !rect.height) {
              return;
            }
            addClientPoint(rect.left, rect.top);
            addClientPoint(rect.right, rect.top);
            addClientPoint(rect.right, rect.bottom);
            addClientPoint(rect.left, rect.bottom);
          });
        });
        if (!bounds || bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
          return;
        }
        var width = bounds.right - bounds.left;
        var height = bounds.bottom - bounds.top;
        var canvasRect = canvas.getBoundingClientRect();
        var canvasAspect = canvasRect && canvasRect.width && canvasRect.height
          ? canvasRect.width / canvasRect.height
          : 0;
        if (canvasAspect > 0 && width > 0 && height > 0) {
          var boundsAspect = width / height;
          if (canvasAspect > boundsAspect) {
            var expandedWidth = height * canvasAspect;
            var extraWidth = expandedWidth - width;
            bounds.left -= extraWidth / 2;
            bounds.right += extraWidth / 2;
            width = expandedWidth;
          } else if (canvasAspect < boundsAspect) {
            var expandedHeight = width / canvasAspect;
            var extraHeight = expandedHeight - height;
            bounds.top -= extraHeight / 2;
            bounds.bottom += extraHeight / 2;
            height = expandedHeight;
          }
        }
        if (root.getAttribute('data-map-layout') === 'canada') {
          // The source Canada SVG is dominated by far-northern islands.  After
          // fitting the linked province/territory bounds, trim a little of that
          // northern extent so the reset/initial view reads as Canada rather
          // than as an Arctic close-up.  Keep the crop modest: territories
          // should remain visible and clickable in the overview.
          var canadaNorthernTrim = height * 0.10;
          bounds.top += canadaNorthernTrim;
          height -= canadaNorthernTrim;
        }
        var pad = Math.max(width, height) * 0.035;
        svg.setAttribute(
          'viewBox',
          [
            bounds.left - pad,
            bounds.top - pad,
            width + pad * 2,
            height + pad * 2
          ].map(function(value) { return Number(value).toFixed(3); }).join(' ')
        );
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('data-map-fit-applied', 'linked-bounds');
        zoomState = { scale: 1, x: 0, y: 0 };
        applyZoom();
      };
      var zoomToScreenBounds = function(bounds, nextScale) {
        var canvasRect = canvas.getBoundingClientRect();
        if (!bounds || !canvasRect.width || !canvasRect.height || bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
          return;
        }
        var centerX = bounds.left - canvasRect.left + (bounds.right - bounds.left) / 2;
        var centerY = bounds.top - canvasRect.top + (bounds.bottom - bounds.top) / 2;
        var worldX = (centerX - zoomState.x) / zoomState.scale;
        var worldY = (centerY - zoomState.y) / zoomState.scale;
        zoomState.scale = Math.max(minZoom, Math.min(maxZoom, nextScale));
        zoomState.x = canvasRect.width / 2 - worldX * zoomState.scale;
        zoomState.y = canvasRect.height / 2 - worldY * zoomState.scale;
        clampPan();
        applyZoom();
      };
      var focusMapOnRegion = function(regionKey) {
        var targetRegionKey = normaliseRegionKey(regionKey);
        var bounds = null;
        if (!targetRegionKey) {
          return false;
        }
        Object.keys(byIso).forEach(function(iso) {
          var item = byIso[iso];
          var node = nodesByIso[iso];
          if (!item || !node || getItemRegionKey(item) !== targetRegionKey) {
            return;
          }
          var rect = getMapNodesBounds(node);
          if (!rect || !rect.right || !rect.bottom || rect.right <= rect.left || rect.bottom <= rect.top) {
            return;
          }
          if (!bounds) {
            bounds = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
            return;
          }
          bounds.left = Math.min(bounds.left, rect.left);
          bounds.top = Math.min(bounds.top, rect.top);
          bounds.right = Math.max(bounds.right, rect.right);
          bounds.bottom = Math.max(bounds.bottom, rect.bottom);
        });
        if (!bounds) {
          return false;
        }
        zoomToScreenBounds(bounds, targetRegionKey === 'americas' ? 1.75 : 2.05);
        root.setAttribute('data-interactive-map-region-focus', targetRegionKey);
        root.setAttribute('data-uap-world-map-region-focus', targetRegionKey);
        Array.prototype.forEach.call(
          root.querySelectorAll('[data-interactive-map-continent-focus], [data-uap-world-map-region-focus]'),
          function(button) {
            var buttonRegionKey = normaliseRegionKey(
              button.getAttribute('data-interactive-map-continent-focus')
              || button.getAttribute('data-uap-world-map-region-focus')
            );
            var isActive = buttonRegionKey === targetRegionKey;
            button.classList.toggle('is-active', isActive);
            if (button.classList.contains('interactive-map-region-button')) {
              button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            }
          }
        );
        return true;
      };
      var regionNav = root.querySelector('.interactive-map-region-nav');
      if (regionNav) {
        regionNav.addEventListener('click', function(event) {
          var regionFocusButton = event.target && event.target.closest
            ? event.target.closest('[data-interactive-map-continent-focus], [data-uap-world-map-region-focus]')
            : null;
          if (!regionFocusButton || !regionNav.contains(regionFocusButton)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          focusMapOnRegion(
            regionFocusButton.getAttribute('data-interactive-map-continent-focus')
            || regionFocusButton.getAttribute('data-uap-world-map-region-focus')
          );
        });
      }
      var updatePreview = function(item) {
        if (!item || !preview) {
          return;
        }
        preview.setAttribute('tabindex', item.url ? '0' : '-1');
        preview.setAttribute('role', item.url ? 'link' : 'group');
        preview.setAttribute('aria-label', item.url ? 'Open file for ' + getItemLabel(item) : itemTypeTitle + ' preview');
        var imageUrl = resolveSiteAssetUrl(item.image);
        warmPreviewImage(item);
        var imageHtml = imageUrl ? '<img src="' + escapeHtml(imageUrl) + '" alt="" loading="eager" decoding="async" fetchpriority="high">' : '';
        var previewLabel = getItemLabel(item);
        var previewTitle = getItemTitle(item);
        var kickerHtml = '<span class="interactive-map-preview-kicker uap-world-map-preview-kicker">' + escapeHtml(previewLabel) + '</span>';
        preview.innerHTML = imageHtml
          + getPreviewMetaHtml(item)
          + kickerHtml
          + '<strong data-interactive-map-preview-title data-uap-world-map-preview-title>' + escapeHtml(previewTitle) + '</strong>'
          + '<span data-interactive-map-preview-summary data-uap-world-map-preview-summary>' + escapeHtml(getItemSummary(item)) + '</span>'
          + (item.url ? '<span class="interactive-map-preview-cta uap-world-map-preview-cta">Open file</span>' : '');
        bindPreviewImageFallback();
      };
      var forEachMapNode = function(nodeOrNodes, callback) {
        if (!nodeOrNodes || typeof callback !== 'function') {
          return;
        }
        if (nodeOrNodes.length && !nodeOrNodes.nodeType) {
          Array.prototype.forEach.call(nodeOrNodes, function(node) {
            if (node) {
              callback(node);
            }
          });
          return;
        }
        callback(nodeOrNodes);
      };
      var getMapNodesBounds = function(nodeOrNodes) {
        var bounds = null;
        forEachMapNode(nodeOrNodes, function(node) {
          if (!node || !node.getBoundingClientRect) {
            return;
          }
          var rect = node.getBoundingClientRect();
          if (!rect.width || !rect.height) {
            return;
          }
          if (!bounds) {
            bounds = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
            return;
          }
          bounds.left = Math.min(bounds.left, rect.left);
          bounds.top = Math.min(bounds.top, rect.top);
          bounds.right = Math.max(bounds.right, rect.right);
          bounds.bottom = Math.max(bounds.bottom, rect.bottom);
        });
        return bounds;
      };
      var clearActive = function() {
        forEachMapNode(active, function(node) {
          node.classList.remove('is-hovered');
        });
        active = null;
      };
      if (preview) {
        preview.addEventListener('click', function(event) {
          event.preventDefault();
          event.stopPropagation();
          var regionFocusButton = event.target && event.target.closest
            ? event.target.closest('[data-interactive-map-continent-focus], [data-uap-world-map-region-focus]')
            : null;
          if (regionFocusButton) {
            focusMapOnRegion(
              regionFocusButton.getAttribute('data-interactive-map-continent-focus')
              || regionFocusButton.getAttribute('data-uap-world-map-region-focus')
            );
            return;
          }
          navigateToItem(activeItem);
        });
        preview.addEventListener('keydown', function(event) {
          if (event.target && event.target.closest && event.target.closest('[data-interactive-map-continent-focus], [data-uap-world-map-region-focus]')) {
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            navigateToItem(activeItem);
          }
        });
      }
      var focusCountry = function(node, item, options) {
        clearActive();
        active = node;
        activeItem = item;
        forEachMapNode(node, function(part) {
          part.classList.add('is-hovered');
        });
        if (!options || !options.preservePreview) {
          updatePreview(item);
        }
        if (options && options.zoom) {
          var bounds = getMapNodesBounds(node);
          if (bounds) {
            zoomToScreenBounds(bounds, options.scale || 2.7);
          }
        }
      };
      var escapeAttrValue = function(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      };
      var normaliseMapSvgLabel = function(value) {
        var text = String(value || '').trim().toLowerCase();
        if (text.normalize) {
          text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }
        return text.replace(/[^a-z0-9]+/g, ' ').trim();
      };
      var getMapNodesForItem = function(iso, item) {
        var exact = svg.getElementById ? svg.getElementById(iso) : svg.querySelector('#' + iso);
        if (exact) {
          return [exact];
        }
        var labels = [
          item && item.country,
          item && item.label,
          item && item.mapName,
          item && item.displayLabel
        ].concat((item && item.mapAliases) || []).filter(Boolean);
        var selectors = [];
        labels.forEach(function(label) {
          var safe = escapeAttrValue(label);
          selectors.push('[name="' + safe + '"]');
          selectors.push('[class="' + safe + '"]');
        });
        if (!selectors.length) {
          return [];
        }
        var seen = [];
        Array.prototype.forEach.call(svg.querySelectorAll(selectors.join(',')), function(node) {
          if (seen.indexOf(node) === -1) {
            seen.push(node);
          }
        });
        if (!seen.length) {
          var normalisedLabels = labels.map(normaliseMapSvgLabel).filter(Boolean);
          Array.prototype.forEach.call(svg.querySelectorAll('[name], [class]'), function(node) {
            var candidates = [
              normaliseMapSvgLabel(node.getAttribute('name')),
              normaliseMapSvgLabel(node.getAttribute('class'))
            ];
            if (candidates.some(function(candidate) { return normalisedLabels.indexOf(candidate) !== -1; })) {
              seen.push(node);
            }
          });
        }
        return seen;
      };
      var guessedIso = guessVisitorCountryIso(byIso);
      var guessedNode = null;
      Object.keys(byIso).forEach(function(iso) {
        var item = byIso[iso];
        var nodes = getMapNodesForItem(iso, item);
        if (!nodes.length || !item) {
          return;
        }
        if (iso === guessedIso) {
          guessedNode = nodes;
        }
        nodesByIso[iso] = nodes;
        nodes.forEach(function(node, nodeIndex) {
          node.classList.add('is-linked');
          node.setAttribute('data-uap-country', iso);
          node.setAttribute('data-interactive-map-item', iso);
          if (nodeIndex === 0) {
            node.setAttribute('tabindex', '0');
            node.setAttribute('role', 'link');
            node.setAttribute('aria-label', 'Open ' + getItemLabel(item));
          } else {
            // Multi-part countries and regions remain pointer targets, but only
            // one shape per item should enter the keyboard/accessibility tree.
            node.setAttribute('tabindex', '-1');
            node.setAttribute('aria-hidden', 'true');
            node.removeAttribute('role');
            node.removeAttribute('aria-label');
          }
          node.addEventListener('mouseenter', function() { focusCountry(nodes, item); });
          node.addEventListener('focus', function() { focusCountry(nodes, item); });
          node.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            navigateToItem(item);
          });
          node.addEventListener('keydown', function(event) {
            if ((event.key === 'Enter' || event.key === ' ') && item.url) {
              event.preventDefault();
              event.stopPropagation();
              navigateToItem(item);
            }
          });
        });
      });
      var markUnlinkedMapContextShapes = function() {
        if (!contextShapeMapLayouts[mapLayout]) {
          return;
        }
        Array.prototype.forEach.call(svg.querySelectorAll('path, polygon, polyline, rect, circle'), function(node) {
          if (node.hasAttribute('data-interactive-map-item') || node.hasAttribute('data-uap-country')) {
            return;
          }
          node.classList.add('map-context-shape');
          node.setAttribute('aria-hidden', 'true');
        });
      };
      markUnlinkedMapContextShapes();
      fitSvgToLinkedBounds();
      var resolveInitialIso = function() {
        if (initialItemId && byIso[initialItemId] && nodesByIso[initialItemId]) {
          return initialItemId;
        }
        if (root.getAttribute('data-map-layout') === 'uk-counties' && byIso['UK-HC-SUFFOLK'] && nodesByIso['UK-HC-SUFFOLK']) {
          return 'UK-HC-SUFFOLK';
        }
        var previewTitleNode = preview && preview.querySelector('[data-interactive-map-preview-title], [data-uap-world-map-preview-title]');
        var previewTitle = normaliseMapSvgLabel(previewTitleNode ? previewTitleNode.textContent : '');
        var previewKickerNode = preview && preview.querySelector('.interactive-map-preview-kicker, .uap-world-map-preview-kicker');
        var previewKicker = normaliseMapSvgLabel(previewKickerNode ? previewKickerNode.textContent : '');
        var matchedIso = '';
        Object.keys(byIso).some(function(iso) {
          var item = byIso[iso];
          var labels = [
            getItemLabel(item),
            getItemTitle(item),
            item && item.mapName,
            item && item.country,
            item && item.province,
            item && item.state,
            item && item.county
          ].concat((item && item.mapAliases) || []);
          var normalisedLabels = labels.map(normaliseMapSvgLabel).filter(Boolean);
          if (
            (previewKicker && normalisedLabels.indexOf(previewKicker) !== -1)
            || (previewTitle && normalisedLabels.some(function(label) { return previewTitle.indexOf(label) !== -1 || label.indexOf(previewTitle) !== -1; }))
          ) {
            matchedIso = iso;
            return true;
          }
          return false;
        });
        if (matchedIso && byIso[matchedIso] && nodesByIso[matchedIso]) {
          return matchedIso;
        }
        var firstIso = Object.keys(byIso).filter(function(iso) { return nodesByIso[iso]; })[0] || '';
        return firstIso;
      };
      var initialIso = resolveInitialIso();
      if (initialIso && byIso[initialIso] && nodesByIso[initialIso]) {
        focusCountry(nodesByIso[initialIso], byIso[initialIso], { preservePreview: !initialItemId });
      }
      if (root.getAttribute('data-map-auto-focus') === 'visitor' && guessedIso && guessedNode) {
        window.setTimeout(function() {
          if (!active) {
            focusCountry(guessedNode, byIso[guessedIso], { zoom: true });
          }
        }, 160);
      }
      setMapState(
        mapDataUnavailable ? 'partial' : 'ready',
        mapDataUnavailable ? 'Map links are unavailable. Use the featured file or Contents below.' : ''
      );
    }).catch(function() {
      canvas.innerHTML = '';
      var staticFallback = document.createElement('img');
      staticFallback.className = 'interactive-map-static-fallback uap-world-map-static-fallback';
      staticFallback.src = resolveSiteAssetUrl(mapSrc);
      staticFallback.alt = mapLabel;
      staticFallback.addEventListener('load', function() {
        root.setAttribute('data-map-state', 'static');
      }, { once: true });
      staticFallback.addEventListener('error', function() {
        if (staticFallback.parentNode === canvas) {
          canvas.removeChild(staticFallback);
        }
        setMapState('error', 'Map unavailable. Use the featured file or Contents below.');
      }, { once: true });
      canvas.appendChild(staticFallback);
      setMapState('fallback', 'Interactive map unavailable. Use the featured file or Contents below.');
    });
    });
  }

  PhoenixUI.initializers.map = initUapWorldMap;
})();
