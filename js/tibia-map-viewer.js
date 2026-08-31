(function () {
    'use strict';

    var MAP_ROOT_ID = 'tibia-map';

    var CONFIG = {
        boundsUrl: 'map-data/tibia-map/bounds.json',
        creatureSpawnsUrl: 'map-data/tibia-map/creature-spawns.json',
        floorImageUrl: function (floorId) {
            return 'images/tibia-map/floor-' + floorId + '-map.png';
        },
        // In Tibia, z=7 is ground level. We expose a relative "level" where:
        // - level  0 => z=7
        // - level -1 => z=8 (one floor below ground)
        // - level +1 => z=6 (one floor above ground)
        referenceZ: 7,
        defaultZ: 7,
        minZ: 0,
        maxZ: 15,
        defaultZoom: 1,
        minZoom: -2,
        // Cap zoom-in so the floor PNG is not blown up into hard pixel blocks.
        maxZoom: 2
    };

    function floorIdFromZ(z) {
        var n = Number(z);
        if (!isFinite(n)) {
            return '07';
        }
        return String(Math.max(CONFIG.minZ, Math.min(CONFIG.maxZ, Math.floor(n)))).padStart(2, '0');
    }

    function clampZ(z) {
        var n = Number(z);
        if (!isFinite(n)) {
            return CONFIG.defaultZ;
        }
        n = Math.floor(n);
        if (n < CONFIG.minZ) return CONFIG.minZ;
        if (n > CONFIG.maxZ) return CONFIG.maxZ;
        return n;
    }

    function relativeLevelFromZ(z) {
        return CONFIG.referenceZ - clampZ(z);
    }

    function clampRelativeLevel(level) {
        var n = Number(level);
        if (!isFinite(n)) {
            return relativeLevelFromZ(CONFIG.defaultZ);
        }

        n = Math.floor(n);

        var minLevel = CONFIG.referenceZ - CONFIG.maxZ;
        var maxLevel = CONFIG.referenceZ - CONFIG.minZ;

        if (n < minLevel) return minLevel;
        if (n > maxLevel) return maxLevel;
        return n;
    }

    function zFromRelativeLevel(level) {
        return clampZ(CONFIG.referenceZ - clampRelativeLevel(level));
    }

    function formatRelativeLevel(level) {
        var n = Number(level);
        if (!isFinite(n)) return '0';
        n = Math.floor(n);
        if (n > 0) return '+' + String(n);
        return String(n);
    }

    function parsePointParam(raw) {
        if (!raw) return null;
        var parts = String(raw).split(',');
        if (parts.length < 3) return null;

        var a = Number(parts[0]);
        var b = Number(parts[1]);
        var level = Number(parts[2]);
        var zoom = parts.length >= 4 ? Number(parts[3]) : null;

        if (!isFinite(a) || !isFinite(b) || !isFinite(level)) return null;
        if (zoom !== null && !isFinite(zoom)) zoom = null;

        return {
            worldX: a,
            worldY: b,
            level: level,
            zoom: zoom
        };
    }

    function toWorldFromPixel(bounds, pixelX, pixelY) {
        // Leaflet CRS.Simple + imageOverlay([[0,0],[height,width]]) maps lat=0 to the
        // bottom of the PNG and lat=height to the top. Tibia world Y increases south
        // (down the PNG), so we invert Y when converting.
        return {
            worldX: pixelX + bounds.xMin,
            worldY: bounds.yMin + (bounds.height - pixelY)
        };
    }

    function toPixelFromWorld(bounds, worldX, worldY) {
        return {
            x: worldX - bounds.xMin,
            y: bounds.height - (worldY - bounds.yMin)
        };
    }

    function buildPointParam(worldX, worldY, z, zoom) {
        var safeZoom = isFinite(Number(zoom)) ? Number(zoom) : CONFIG.defaultZoom;
        var level = clampRelativeLevel(relativeLevelFromZ(z));
        return [
            String(Math.round(worldX)),
            String(Math.round(worldY)),
            String(level),
            String(Math.round(safeZoom))
        ].join(',');
    }

    function updateUrlPointParam(pointParam) {
        var url = new URL(window.location.href);
        url.searchParams.set('point', pointParam);
        window.history.replaceState({}, '', url.toString());
    }

    function fetchJson(url) {
        return fetch(url, { cache: 'no-cache' }).then(function (res) {
            if (!res.ok) {
                throw new Error('Failed to load ' + url + ' (' + res.status + ')');
            }
            return res.json();
        });
    }

    function createError(el, message) {
        el.innerHTML = '<div class="alert alert-danger m-b0">' + String(message) + '</div>';
    }

    function init() {
        var mapRoot = document.getElementById(MAP_ROOT_ID);
        if (!mapRoot) return;

        if (typeof window.L === 'undefined') {
            createError(mapRoot, 'Biblioteca do mapa não carregou (Leaflet).');
            return;
        }

        fetchJson(CONFIG.boundsUrl)
            .then(function (bounds) {
                var imageBounds = [
                    [0, 0],
                    [bounds.height, bounds.width]
                ];

                var map = window.L.map(MAP_ROOT_ID, {
                    crs: window.L.CRS.Simple,
                    minZoom: CONFIG.minZoom,
                    maxZoom: CONFIG.maxZoom,
                    zoomControl: true,
                    attributionControl: false,
                    scrollWheelZoom: false,
                    // Keep zoom on the map only; avoid odd bound bounce while zooming.
                    maxBoundsViscosity: 1.0
                });

                var imageLatLngBounds = window.L.latLngBounds(imageBounds);
                // Slight pad so +/- zoom does not clamp so hard that the view "jumps"
                // and covers/hides the control UI.
                map.setMaxBounds(imageLatLngBounds.pad(0.08));

                var state = {
                    bounds: bounds,
                    imageBounds: imageBounds,
                    map: map,
                    overlay: null,
                    floorOverlays: {},
                    floorsPreloaded: false,
                    marker: null,
                    z: CONFIG.defaultZ,
                    hasDeepLink: false
                };

                var creatureUi = {
                    panelEl: document.getElementById('tibia-creature-panel'),
                    inputEl: document.getElementById('tibia-creature-input'),
                    suggestionsEl: document.getElementById('tibia-creature-suggestions'),
                    selectedEl: document.getElementById('tibia-creature-selected'),
                    navEl: document.getElementById('tibia-creature-nav'),
                    navPrevEl: document.getElementById('tibia-creature-nav-prev'),
                    navNextEl: document.getElementById('tibia-creature-nav-next'),
                    navGifEl: document.getElementById('tibia-creature-nav-gif'),
                    navNameEl: document.getElementById('tibia-creature-nav-name'),
                    navInfoEl: document.getElementById('tibia-creature-nav-info')
                };

                var creatureState = {
                    data: null,
                    selectedKeys: [],
                    nameByKey: {},
                    sizeByKey: {},
                    suggestionNames: [],
                    activeSuggestionIndex: -1,
                    activeKey: null,
                    navStacks: [],
                    navIndex: 0,
                    layer: window.L.layerGroup().addTo(map)
                };

                var CREATURE_SUGGESTION_LIMIT = 10;
                var CREATURE_ICON_TARGET_HEIGHT = 48;
                // Larger cell ≈ denser stacks like the reference (~36x at OF).
                var CREATURE_NAV_CELL_SIZE = 192;
                // Push sprites further down so they sit on the tile (smaller iconAnchor.y).
                var CREATURE_ICON_ANCHOR_NUDGE_Y = 36;

                function normalizeCreatureName(name) {
                    return String(name || '').trim().toLowerCase();
                }

                function escapeRegExp(value) {
                    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                }

                function creatureGifUrlForKey(key) {
                    return 'images/monster_images/' + encodeURIComponent(String(key) + '.gif');
                }

                function cellSizeForZoom(zoom) {
                    var z = Number(zoom);
                    if (!isFinite(z)) z = CONFIG.defaultZoom;
                    // Min zoom must merge aggressively (reference stacks ~28–36).
                    if (z <= -1) return 192;
                    if (z < 1) return 96;
                    if (z < 2) return 32;
                    return 1;
                }

                function buildClusters(points, cellSize, floorFilter) {
                    var cell = Math.max(1, Number(cellSize) || 1);
                    var buckets = {};

                    (points || []).forEach(function (p) {
                        if (!p || p.length < 3) return;
                        var x = Number(p[0]);
                        var y = Number(p[1]);
                        var z = Number(p[2]);
                        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
                        if (floorFilter != null && z !== floorFilter) return;

                        var bx = Math.floor(x / cell);
                        var by = Math.floor(y / cell);
                        var key = bx + ':' + by + ':' + z;
                        if (!buckets[key]) {
                            buckets[key] = {
                                sumX: 0,
                                sumY: 0,
                                z: z,
                                count: 0
                            };
                        }
                        buckets[key].sumX += x;
                        buckets[key].sumY += y;
                        buckets[key].count += 1;
                    });

                    return Object.keys(buckets).map(function (k) {
                        var b = buckets[k];
                        return {
                            x: Math.round(b.sumX / b.count),
                            y: Math.round(b.sumY / b.count),
                            z: b.z,
                            count: b.count
                        };
                    });
                }

                function buildNavStacks(creatureKey) {
                    if (!creatureState.data || !creatureState.data.spawns) return [];
                    var points = creatureState.data.spawns[creatureKey];
                    if (!Array.isArray(points) || !points.length) return [];

                    var stacks = buildClusters(points, CREATURE_NAV_CELL_SIZE, null);
                    stacks.sort(function (a, b) {
                        if (b.count !== a.count) return b.count - a.count;
                        if (a.z !== b.z) return a.z - b.z;
                        if (a.x !== b.x) return a.x - b.x;
                        return a.y - b.y;
                    });
                    return stacks;
                }

                function rankCreatureMatch(name, query) {
                    var n = normalizeCreatureName(name);
                    var q = normalizeCreatureName(query);
                    if (!q) return Number.POSITIVE_INFINITY;
                    if (n === q) return 0;
                    if (n.indexOf(q) === 0) return 1;

                    var wordRe = new RegExp('(?:^|[\\s\\-\'_])' + escapeRegExp(q));
                    if (wordRe.test(n)) return 2;

                    var idx = n.indexOf(q);
                    if (idx >= 0) return 10 + idx;
                    return Number.POSITIVE_INFINITY;
                }

                function filterCreatureSuggestions(query) {
                    var q = normalizeCreatureName(query);
                    if (!q || !creatureState.data || !Array.isArray(creatureState.data.creatures)) {
                        return [];
                    }

                    var ranked = [];
                    creatureState.data.creatures.forEach(function (name) {
                        var score = rankCreatureMatch(name, q);
                        if (!isFinite(score)) return;
                        ranked.push({ name: String(name), score: score });
                    });

                    ranked.sort(function (a, b) {
                        if (a.score !== b.score) return a.score - b.score;
                        return a.name.localeCompare(b.name);
                    });

                    return ranked.slice(0, CREATURE_SUGGESTION_LIMIT).map(function (item) {
                        return item.name;
                    });
                }

                function hideCreatureSuggestions() {
                    if (!creatureUi.suggestionsEl || !creatureUi.inputEl) return;
                    creatureUi.suggestionsEl.hidden = true;
                    creatureUi.suggestionsEl.innerHTML = '';
                    creatureState.suggestionNames = [];
                    creatureState.activeSuggestionIndex = -1;
                    creatureUi.inputEl.setAttribute('aria-expanded', 'false');
                }

                function renderCreatureSuggestions(names) {
                    if (!creatureUi.suggestionsEl || !creatureUi.inputEl) return;

                    creatureState.suggestionNames = names || [];
                    creatureState.activeSuggestionIndex = names.length ? 0 : -1;
                    creatureUi.suggestionsEl.innerHTML = '';

                    if (!names.length) {
                        hideCreatureSuggestions();
                        return;
                    }

                    names.forEach(function (name, index) {
                        var item = document.createElement('button');
                        item.type = 'button';
                        item.className = 'tibia-creature-suggestions__item' + (index === 0 ? ' is-active' : '');
                        item.setAttribute('role', 'option');
                        item.textContent = name;
                        item.addEventListener('mousedown', function (e) {
                            e.preventDefault();
                            selectCreatureSuggestion(name);
                        });
                        creatureUi.suggestionsEl.appendChild(item);
                    });

                    creatureUi.suggestionsEl.hidden = false;
                    creatureUi.inputEl.setAttribute('aria-expanded', 'true');
                }

                function setActiveSuggestion(index) {
                    if (!creatureUi.suggestionsEl) return;
                    var items = creatureUi.suggestionsEl.querySelectorAll('.tibia-creature-suggestions__item');
                    if (!items.length) return;

                    var next = index;
                    if (next < 0) next = items.length - 1;
                    if (next >= items.length) next = 0;
                    creatureState.activeSuggestionIndex = next;

                    Array.prototype.forEach.call(items, function (el, i) {
                        if (i === next) {
                            el.classList.add('is-active');
                            if (el.scrollIntoView) {
                                el.scrollIntoView({ block: 'nearest' });
                            }
                        } else {
                            el.classList.remove('is-active');
                        }
                    });
                }

                function selectCreatureSuggestion(name) {
                    var key = normalizeCreatureName(name);
                    if (!key) return;
                    if (addCreatureKey(key)) {
                        if (creatureUi.inputEl) creatureUi.inputEl.value = '';
                        hideCreatureSuggestions();
                    }
                }

                function ensureCreatureSize(key, done) {
                    if (creatureState.sizeByKey[key]) {
                        if (done) done(creatureState.sizeByKey[key]);
                        return;
                    }

                    var probe = new Image();
                    probe.onload = function () {
                        var natW = probe.naturalWidth || 32;
                        var natH = probe.naturalHeight || 32;
                        var scale = Math.max(2, Math.round(CREATURE_ICON_TARGET_HEIGHT / natH));
                        var size = { w: natW * scale, h: natH * scale };
                        creatureState.sizeByKey[key] = size;
                        if (done) done(size);
                        updateCreatureMarkers();
                        renderCreatureNav();
                    };
                    probe.onerror = function () {
                        var size = { w: CREATURE_ICON_TARGET_HEIGHT, h: CREATURE_ICON_TARGET_HEIGHT };
                        creatureState.sizeByKey[key] = size;
                        if (done) done(size);
                    };
                    probe.src = creatureGifUrlForKey(key);
                }

                function getCreatureStackIcon(key, count) {
                    var size = creatureState.sizeByKey[key] || {
                        w: CREATURE_ICON_TARGET_HEIGHT,
                        h: CREATURE_ICON_TARGET_HEIGHT
                    };
                    var n = Number(count) || 1;
                    var badgeHtml = '';
                    if (n > 1) {
                        badgeHtml =
                            '<span class="tibia-creature-stack-badge">' +
                            String(n) +
                            '</span>';
                    }

                    var html =
                        '<div class="tibia-creature-icon-wrap">' +
                        '<img class="tibia-creature-icon-img" src="' +
                        creatureGifUrlForKey(key) +
                        '" width="' + size.w + '" height="' + size.h +
                        '" alt="" draggable="false" />' +
                        badgeHtml +
                        '</div>';

                    return window.L.divIcon({
                        className: 'tibia-creature-icon',
                        html: html,
                        iconSize: [size.w, size.h],
                        iconAnchor: [
                            Math.round(size.w / 2),
                            Math.max(1, size.h - CREATURE_ICON_ANCHOR_NUDGE_Y)
                        ]
                    });
                }

                function renderCreatureNav() {
                    if (!creatureUi.navEl) return;

                    var key = creatureState.activeKey;
                    var stacks = creatureState.navStacks;
                    if (!key || !stacks.length) {
                        creatureUi.navEl.hidden = true;
                        return;
                    }

                    var idx = creatureState.navIndex;
                    if (idx < 0) idx = 0;
                    if (idx >= stacks.length) idx = stacks.length - 1;
                    creatureState.navIndex = idx;

                    var stack = stacks[idx];
                    var name = creatureState.nameByKey[key] || key;

                    creatureUi.navEl.hidden = false;
                    if (creatureUi.navGifEl) {
                        creatureUi.navGifEl.src = creatureGifUrlForKey(key);
                        creatureUi.navGifEl.alt = name;
                    }
                    if (creatureUi.navNameEl) {
                        creatureUi.navNameEl.textContent = name;
                    }
                    if (creatureUi.navInfoEl) {
                        creatureUi.navInfoEl.textContent =
                            '#' + (idx + 1) + '/' + stacks.length +
                            ' • ' + stack.count + 'x • z=' + stack.z;
                    }
                }

                function focusNavStack(index, opts) {
                    opts = opts || {};
                    if (!creatureState.navStacks.length) return;

                    var next = index;
                    if (next < 0) next = creatureState.navStacks.length - 1;
                    if (next >= creatureState.navStacks.length) next = 0;
                    creatureState.navIndex = next;

                    var stack = creatureState.navStacks[next];
                    if (!stack) return;

                    setFloor(stack.z);
                    var zoom = state.map.getZoom();
                    if (!isFinite(zoom) || zoom < 1) {
                        zoom = Math.min(CONFIG.maxZoom, Math.max(1, CONFIG.defaultZoom));
                    }
                    centerOnWorld(stack.x, stack.y, zoom);
                    renderCreatureNav();
                    if (!opts.skipMarkers) {
                        updateCreatureMarkers();
                    }
                }

                function activateCreatureNav(key, jumpToDensest) {
                    creatureState.activeKey = key;
                    creatureState.navStacks = buildNavStacks(key);
                    creatureState.navIndex = 0;
                    renderSelectedCreatureChips();
                    renderCreatureNav();
                    if (jumpToDensest && creatureState.navStacks.length) {
                        focusNavStack(0);
                    } else {
                        updateCreatureMarkers();
                    }
                }

                function ensureFloorOverlay(z) {
                    var floorZ = clampZ(z);
                    var floorId = floorIdFromZ(floorZ);
                    if (state.floorOverlays[floorId]) {
                        return state.floorOverlays[floorId];
                    }

                    var overlay = window.L.imageOverlay(
                        CONFIG.floorImageUrl(floorId),
                        state.imageBounds,
                        {
                            interactive: false,
                            opacity: 0,
                            className: 'tibia-floor-overlay'
                        }
                    );
                    overlay.addTo(state.map);
                    state.floorOverlays[floorId] = overlay;
                    return overlay;
                }

                function preloadFloorImages() {
                    if (state.floorsPreloaded) return;
                    state.floorsPreloaded = true;

                    // Load ground first, then neighbors, then the rest so floor switches feel instant.
                    var order = [];
                    var seen = {};
                    function pushZ(z) {
                        var clamped = clampZ(z);
                        if (seen[clamped]) return;
                        seen[clamped] = true;
                        order.push(clamped);
                    }

                    pushZ(CONFIG.defaultZ);
                    for (var d = 1; d <= CONFIG.maxZ; d += 1) {
                        pushZ(CONFIG.defaultZ - d);
                        pushZ(CONFIG.defaultZ + d);
                    }

                    order.forEach(function (z) {
                        ensureFloorOverlay(z);
                        var img = new Image();
                        img.decoding = 'async';
                        img.src = CONFIG.floorImageUrl(floorIdFromZ(z));
                    });
                }

                function renderSelectedCreatureChips() {
                    if (!creatureUi.selectedEl) return;

                    creatureUi.selectedEl.innerHTML = '';

                    creatureState.selectedKeys.forEach(function (key) {
                        var name = creatureState.nameByKey[key] || key;

                        var chip = document.createElement('span');
                        chip.className = 'badge badge-primary tibia-creature-chip' +
                            (key === creatureState.activeKey ? ' is-active' : '');
                        chip.title = 'Focar áreas de ' + name;
                        chip.addEventListener('click', function (e) {
                            if (e.target && e.target.classList &&
                                e.target.classList.contains('tibia-creature-chip-remove')) {
                                return;
                            }
                            activateCreatureNav(key, true);
                        });

                        var text = document.createElement('span');
                        text.textContent = name;
                        chip.appendChild(text);

                        var removeBtn = document.createElement('button');
                        removeBtn.type = 'button';
                        removeBtn.className = 'tibia-creature-chip-remove';
                        removeBtn.setAttribute('aria-label', 'Remover ' + name);
                        removeBtn.textContent = '×';
                        removeBtn.addEventListener('click', function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            removeCreatureKey(key);
                        });
                        chip.appendChild(removeBtn);

                        creatureUi.selectedEl.appendChild(chip);
                    });
                }

                function updateCreatureMarkers() {
                    if (!creatureState.layer) return;
                    creatureState.layer.clearLayers();

                    if (!creatureState.data) return;
                    if (!creatureState.selectedKeys.length) return;

                    var z = state.z;
                    var cell = cellSizeForZoom(state.map.getZoom());

                    creatureState.selectedKeys.forEach(function (key) {
                        var points = creatureState.data.spawns && creatureState.data.spawns[key];
                        if (!Array.isArray(points) || !points.length) return;

                        ensureCreatureSize(key);
                        var clusters = buildClusters(points, cell, z);
                        var title = creatureState.nameByKey[key] || key;

                        clusters.forEach(function (cluster) {
                            var pixel = toPixelFromWorld(state.bounds, cluster.x, cluster.y);
                            var latlng = window.L.latLng(pixel.y, pixel.x);
                            var label = title + (cluster.count > 1 ? ' ×' + cluster.count : '');

                            window.L.marker(latlng, {
                                icon: getCreatureStackIcon(key, cluster.count),
                                interactive: false,
                                keyboard: false,
                                title: label,
                                alt: label
                            }).addTo(creatureState.layer);
                        });
                    });
                }

                function addCreatureKey(key) {
                    if (!creatureState.data || !creatureState.data.spawns) return false;
                    if (!creatureState.data.spawns[key]) return false;

                    var already = creatureState.selectedKeys.indexOf(key) !== -1;
                    if (!already) {
                        creatureState.selectedKeys.push(key);
                    }

                    ensureCreatureSize(key);
                    activateCreatureNav(key, true);
                    return true;
                }

                function removeCreatureKey(key) {
                    var idx = creatureState.selectedKeys.indexOf(key);
                    if (idx === -1) return;
                    creatureState.selectedKeys.splice(idx, 1);

                    if (creatureState.activeKey === key) {
                        creatureState.activeKey = creatureState.selectedKeys.length
                            ? creatureState.selectedKeys[creatureState.selectedKeys.length - 1]
                            : null;
                        creatureState.navStacks = creatureState.activeKey
                            ? buildNavStacks(creatureState.activeKey)
                            : [];
                        creatureState.navIndex = 0;
                    }

                    renderSelectedCreatureChips();
                    renderCreatureNav();
                    updateCreatureMarkers();
                }

                function tryAddCreatureFromInput() {
                    if (!creatureUi.inputEl) return;

                    if (creatureState.activeSuggestionIndex >= 0 &&
                        creatureState.suggestionNames[creatureState.activeSuggestionIndex]) {
                        selectCreatureSuggestion(
                            creatureState.suggestionNames[creatureState.activeSuggestionIndex]
                        );
                        return;
                    }

                    var matches = filterCreatureSuggestions(creatureUi.inputEl.value);
                    if (matches.length) {
                        selectCreatureSuggestion(matches[0]);
                        return;
                    }

                    var key = normalizeCreatureName(creatureUi.inputEl.value);
                    if (!key) return;
                    if (addCreatureKey(key)) {
                        creatureUi.inputEl.value = '';
                        hideCreatureSuggestions();
                    }
                }

                function initCreaturePicker() {
                    if (!creatureUi.inputEl || !creatureUi.suggestionsEl || !creatureUi.selectedEl) {
                        return;
                    }

                    if (creatureUi.panelEl && window.L && window.L.DomEvent) {
                        window.L.DomEvent.disableClickPropagation(creatureUi.panelEl);
                        window.L.DomEvent.disableScrollPropagation(creatureUi.panelEl);
                    }

                    if (creatureUi.navPrevEl) {
                        creatureUi.navPrevEl.addEventListener('mousedown', function (e) {
                            e.preventDefault();
                        });
                        creatureUi.navPrevEl.addEventListener('click', function (e) {
                            e.preventDefault();
                            focusNavStack(creatureState.navIndex - 1);
                        });
                    }
                    if (creatureUi.navNextEl) {
                        creatureUi.navNextEl.addEventListener('mousedown', function (e) {
                            e.preventDefault();
                        });
                        creatureUi.navNextEl.addEventListener('click', function (e) {
                            e.preventDefault();
                            focusNavStack(creatureState.navIndex + 1);
                        });
                    }

                    fetchJson(CONFIG.creatureSpawnsUrl)
                        .then(function (data) {
                            if (!data || !Array.isArray(data.creatures) || !data.spawns) {
                                throw new Error('Invalid creature-spawns.json');
                            }

                            creatureState.data = data;
                            creatureState.nameByKey = {};

                            data.creatures.forEach(function (name) {
                                var key = normalizeCreatureName(name);
                                if (!key) return;
                                creatureState.nameByKey[key] = String(name);
                            });

                            creatureUi.inputEl.addEventListener('input', function () {
                                renderCreatureSuggestions(filterCreatureSuggestions(creatureUi.inputEl.value));
                            });

                            creatureUi.inputEl.addEventListener('focus', function () {
                                if (creatureUi.inputEl.value) {
                                    renderCreatureSuggestions(filterCreatureSuggestions(creatureUi.inputEl.value));
                                }
                            });

                            creatureUi.inputEl.addEventListener('blur', function () {
                                setTimeout(hideCreatureSuggestions, 120);
                            });

                            creatureUi.inputEl.addEventListener('keydown', function (e) {
                                if (!e) return;
                                var key = e.key || e.keyCode;
                                var open = creatureState.suggestionNames.length > 0 &&
                                    creatureUi.suggestionsEl && !creatureUi.suggestionsEl.hidden;

                                if ((key === 'ArrowDown' || key === 40) && open) {
                                    e.preventDefault();
                                    setActiveSuggestion(creatureState.activeSuggestionIndex + 1);
                                    return;
                                }
                                if ((key === 'ArrowUp' || key === 38) && open) {
                                    e.preventDefault();
                                    setActiveSuggestion(creatureState.activeSuggestionIndex - 1);
                                    return;
                                }
                                if (key === 'Escape' || key === 27) {
                                    hideCreatureSuggestions();
                                    return;
                                }
                                if (key === 'Enter' || key === 13) {
                                    e.preventDefault();
                                    tryAddCreatureFromInput();
                                }
                            });

                            renderSelectedCreatureChips();
                            renderCreatureNav();
                            updateCreatureMarkers();
                        })
                        .catch(function (err) {
                            console.error(err);
                        });
                }

                var interaction = {
                    locked: true,
                    overlayEl: null,
                    unlockInProgress: false,
                    savedScrollY: 0,
                    scrollLocked: false
                };

                function isMobileMapUi() {
                    return window.matchMedia('(max-width: 767.98px)').matches;
                }

                function getMapSectionEl() {
                    return document.getElementById('map-content') || state.map.getContainer();
                }

                function setHandlerEnabled(handler, enabled) {
                    if (!handler) return;
                    var fn = enabled ? handler.enable : handler.disable;
                    if (typeof fn === 'function') {
                        fn.call(handler);
                    }
                }

                function setMapInteractivityEnabled(enabled) {
                    setHandlerEnabled(state.map.dragging, enabled);
                    setHandlerEnabled(state.map.touchZoom, enabled);
                    setHandlerEnabled(state.map.doubleClickZoom, enabled);
                    setHandlerEnabled(state.map.scrollWheelZoom, enabled);
                    setHandlerEnabled(state.map.boxZoom, enabled);
                    setHandlerEnabled(state.map.keyboard, enabled);
                    if (state.map.tap) {
                        setHandlerEnabled(state.map.tap, enabled);
                    }

                    // Allow page scrolling when locked (Leaflet sets touch-action:none on the container).
                    var container = state.map.getContainer();
                    if (enabled) {
                        container.style.touchAction = '';
                    } else {
                        container.style.touchAction = 'pan-y';
                    }
                }

                function setPageScrollLocked(locked) {
                    var html = document.documentElement;
                    var body = document.body;
                    if (!html || !body) return;

                    if (locked) {
                        if (interaction.scrollLocked) return;
                        interaction.scrollLocked = true;
                        interaction.savedScrollY = window.scrollY || window.pageYOffset || 0;
                        html.classList.add('tibia-map-scroll-lock');
                        body.classList.add('tibia-map-scroll-lock');
                        // Keep scroll position as-is (no position:fixed) to avoid jump.
                    } else {
                        if (!interaction.scrollLocked) return;
                        interaction.scrollLocked = false;
                        html.classList.remove('tibia-map-scroll-lock');
                        body.classList.remove('tibia-map-scroll-lock');
                        // Do not scrollTo — overflow lock never moved the viewport.
                    }
                }

                function setInteractionLocked(locked) {
                    var shouldLock = Boolean(locked);
                    var wasLocked = interaction.locked;
                    interaction.locked = shouldLock;
                    if (interaction.overlayEl) {
                        interaction.overlayEl.classList.toggle('is-hidden', !interaction.locked);
                    }
                    setMapInteractivityEnabled(!interaction.locked);

                    var mapContainer = state.map.getContainer();
                    if (mapContainer) {
                        mapContainer.classList.toggle('is-interaction-locked', interaction.locked);
                    }

                    // Restore page scroll only when leaving map interaction.
                    if (shouldLock && !wasLocked) {
                        setPageScrollLocked(false);
                    }
                }

                function neutralizeAnchor(el) {
                    if (!el) return;
                    el.setAttribute('href', 'javascript:void(0)');
                    el.setAttribute('role', 'button');
                }

                function getFixedHeaderHeight() {
                    var mainBar = document.querySelector('.main-bar');
                    if (mainBar) {
                        var style = window.getComputedStyle(mainBar);
                        if (style.position === 'fixed') {
                            var fixedRect = mainBar.getBoundingClientRect();
                            if (fixedRect && fixedRect.height) {
                                return fixedRect.height;
                            }
                        }
                        var barRect = mainBar.getBoundingClientRect();
                        if (barRect && barRect.height) {
                            return barRect.height;
                        }
                    }
                    var header = document.querySelector('.site-header');
                    if (header) {
                        var headerRect = header.getBoundingClientRect();
                        if (headerRect && headerRect.height) {
                            return headerRect.height;
                        }
                    }
                    return 0;
                }

                function scrollMapIntoViewIfNeeded() {
                    var mapSection = getMapSectionEl();
                    var mobile = isMobileMapUi();
                    var epsilonPx = mobile ? 4 : 2;
                    var extraGapPx = mobile ? 8 : 12;
                    var maxWaitMs = mobile ? 900 : 1800;
                    var maxAdjustments = mobile ? 6 : 4;
                    var scrollBehavior = mobile ? 'auto' : 'smooth';
                    var adjustments = 0;

                    var maxScrollY = function () {
                        var doc = document.documentElement;
                        return Math.max(0, (doc.scrollHeight - window.innerHeight) | 0);
                    };

                    var computeDelta = function () {
                        var headerHeight = getFixedHeaderHeight();
                        var safeTop = headerHeight + extraGapPx;
                        var rect = mapSection.getBoundingClientRect();
                        return {
                            delta: rect.top - safeTop,
                            safeTop: safeTop
                        };
                    };

                    var applyScroll = function () {
                        var d = computeDelta();
                        var targetScrollY = window.scrollY + d.delta;
                        // Clamp so we cannot overshoot into the footer.
                        var mapBottomLimit = window.scrollY + mapSection.getBoundingClientRect().bottom - window.innerHeight;
                        targetScrollY = Math.max(0, Math.min(targetScrollY, maxScrollY(), Math.max(0, mapBottomLimit)));
                        window.scrollTo({ top: targetScrollY, left: 0, behavior: scrollBehavior });
                        adjustments += 1;
                    };

                    applyScroll();

                    return new Promise(function (resolve) {
                        var start = Date.now();
                        var lastY = window.scrollY;
                        var stillFrames = 0;

                        function tick() {
                            var d = computeDelta();
                            if (Math.abs(d.delta) <= epsilonPx) {
                                resolve(true);
                                return;
                            }

                            if (Date.now() - start > maxWaitMs) {
                                resolve(true);
                                return;
                            }

                            if (window.scrollY === lastY) {
                                stillFrames += 1;
                            } else {
                                stillFrames = 0;
                                lastY = window.scrollY;
                            }

                            if (stillFrames > 10 && adjustments < maxAdjustments) {
                                applyScroll();
                                stillFrames = 0;
                            }

                            window.requestAnimationFrame(tick);
                        }

                        tick();
                    });
                }

                var floorControl = {
                    upEl: null,
                    downEl: null,
                    labelEl: null
                };

                function setButtonDisabled(el, disabled) {
                    if (!el) return;
                    if (disabled) {
                        window.L.DomUtil.addClass(el, 'leaflet-disabled');
                        el.setAttribute('aria-disabled', 'true');
                    } else {
                        window.L.DomUtil.removeClass(el, 'leaflet-disabled');
                        el.removeAttribute('aria-disabled');
                    }
                }

                function syncFloorControl() {
                    if (floorControl.labelEl) {
                        var relativeLevel = relativeLevelFromZ(state.z);
                        floorControl.labelEl.textContent = formatRelativeLevel(relativeLevel);
                        floorControl.labelEl.title = 'Andar atual (z): ' + floorIdFromZ(state.z);
                    }

                    setButtonDisabled(floorControl.upEl, state.z <= CONFIG.minZ);
                    setButtonDisabled(floorControl.downEl, state.z >= CONFIG.maxZ);
                }

                function setFloor(z) {
                    state.z = clampZ(z);
                    var floorId = floorIdFromZ(state.z);
                    var nextOverlay = ensureFloorOverlay(state.z);

                    function applyVisibility() {
                        Object.keys(state.floorOverlays).forEach(function (id) {
                            var overlay = state.floorOverlays[id];
                            if (!overlay) return;
                            if (id === floorId) {
                                overlay.setOpacity(1);
                                if (overlay.bringToBack) {
                                    overlay.bringToBack();
                                }
                            } else {
                                overlay.setOpacity(0);
                            }
                        });
                    }

                    applyVisibility();

                    // If the PNG is still decoding, keep retrying opacity once it loads.
                    if (nextOverlay && typeof nextOverlay.once === 'function') {
                        nextOverlay.once('load', function () {
                            if (floorIdFromZ(state.z) === floorId) {
                                applyVisibility();
                            }
                        });
                    }

                    state.overlay = nextOverlay;
                    syncFloorControl();
                    updateCreatureMarkers();
                    floorChangeListeners.forEach(function (fn) {
                        try {
                            fn(state.z);
                        } catch (err) {
                            console.error(err);
                        }
                    });
                }

                function stepFloor(delta) {
                    var next = clampZ(state.z + delta);
                    if (next === state.z) return;
                    setFloor(next);
                    syncUrlToCenter();
                }

                (function addFloorControl() {
                    var FloorControl = window.L.Control.extend({
                        options: { position: 'topleft' },
                        onAdd: function () {
                            var container = window.L.DomUtil.create('div', 'leaflet-bar leaflet-control tibia-floor-control');
                            var up = window.L.DomUtil.create('a', 'tibia-floor-up', container);
                            neutralizeAnchor(up);
                            up.title = 'Andar acima';
                            up.setAttribute('aria-label', 'Andar acima');
                            up.innerHTML = '&#9650;';

                            var label = window.L.DomUtil.create('a', 'tibia-floor-label', container);
                            neutralizeAnchor(label);
                            label.title = 'Andar atual';
                            label.setAttribute('aria-label', 'Andar atual');
                            label.textContent = formatRelativeLevel(relativeLevelFromZ(state.z));

                            var down = window.L.DomUtil.create('a', 'tibia-floor-down', container);
                            neutralizeAnchor(down);
                            down.title = 'Andar abaixo';
                            down.setAttribute('aria-label', 'Andar abaixo');
                            down.innerHTML = '&#9660;';

                            floorControl.upEl = up;
                            floorControl.downEl = down;
                            floorControl.labelEl = label;
                            syncFloorControl();

                            window.L.DomEvent.disableClickPropagation(container);
                            window.L.DomEvent.disableScrollPropagation(container);

                            window.L.DomEvent.on(up, 'click', function (e) {
                                window.L.DomEvent.preventDefault(e);
                                window.L.DomEvent.stop(e);
                                stepFloor(-1);
                            });

                            window.L.DomEvent.on(down, 'click', function (e) {
                                window.L.DomEvent.preventDefault(e);
                                window.L.DomEvent.stop(e);
                                stepFloor(1);
                            });

                            window.L.DomEvent.on(label, 'click', function (e) {
                                window.L.DomEvent.preventDefault(e);
                                window.L.DomEvent.stop(e);
                            });

                            return container;
                        }
                    });

                    state.map.addControl(new FloorControl());
                })();

                // Leaflet zoom +/- uses <a href="#"> which can jump the page; neutralize them.
                if (state.map.zoomControl && state.map.zoomControl.getContainer) {
                    var zoomLinks = state.map.zoomControl.getContainer().querySelectorAll('a');
                    Array.prototype.forEach.call(zoomLinks, function (link) {
                        neutralizeAnchor(link);
                    });
                }

                state.map.on('zoomend', function () {
                    updateCreatureMarkers();
                });

                function unlockMapInteraction() {
                    if (interaction.unlockInProgress || !interaction.locked) return;
                    interaction.unlockInProgress = true;

                    scrollMapIntoViewIfNeeded()
                        .then(function () {
                            setPageScrollLocked(true);
                            setInteractionLocked(false);
                            state.map.invalidateSize();
                            window.requestAnimationFrame(function () {
                                state.map.invalidateSize();
                            });
                        })
                        .finally(function () {
                            interaction.unlockInProgress = false;
                        });
                }

                function isModalUiTarget(target) {
                    if (!target || !target.closest) return false;
                    return Boolean(
                        target.closest('.modal') ||
                        target.closest('.modal-backdrop')
                    );
                }

                (function addInteractionOverlay() {
                    var container = state.map.getContainer();
                    var overlay = document.createElement('div');
                    overlay.className = 'tibia-map-interaction-overlay';
                    overlay.innerHTML =
                        '<div class="tibia-map-interaction-overlay__text">' +
                        'Pressione para interagir com o mapa' +
                        '</div>';

                    interaction.overlayEl = overlay;
                    container.appendChild(overlay);

                    overlay.addEventListener('pointerdown', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        unlockMapInteraction();
                    });

                    var mapSection = getMapSectionEl();
                    if (mapSection) {
                        mapSection.addEventListener('pointerdown', function (e) {
                            if (!interaction.locked || interaction.unlockInProgress) return;
                            if (interaction.overlayEl && interaction.overlayEl.contains(e.target)) return;
                            if (e.target && e.target.closest && e.target.closest('.tibia-creature-panel')) return;
                            if (!container.contains(e.target)) return;
                            e.preventDefault();
                            e.stopPropagation();
                            unlockMapInteraction();
                        });
                    }

                    // Initial state: locked so the page can scroll.
                    setInteractionLocked(true);

                    document.addEventListener('pointerdown', function (e) {
                        if (!interaction.locked && !container.contains(e.target)) {
                            if (isModalUiTarget(e.target)) return;
                            setInteractionLocked(true);
                        }
                    }, true);

                    document.addEventListener('keydown', function (e) {
                        if (!e) return;
                        var key = e.key || e.keyCode;
                        if (key !== 'Escape' && key !== 27) return;

                        if (document.querySelector('.modal.show')) return;

                        // Close suggestions first if the creature search is open.
                        if (creatureUi.suggestionsEl && !creatureUi.suggestionsEl.hidden) {
                            hideCreatureSuggestions();
                            return;
                        }

                        if (!interaction.locked) {
                            e.preventDefault();
                            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                                document.activeElement.blur();
                            }
                            setInteractionLocked(true);
                        }
                    });
                })();

                var floorChangeListeners = [];
                var plusClickHandlers = [];
                var readyCallbacks = [];
                var mapReady = false;

                function createPointMarkerIcon() {
                    // Classic Leaflet pin (2x asset), rendered larger, with a side "+" action.
                    var pinUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
                    return window.L.divIcon({
                        className: 'tibia-point-marker',
                        html:
                            '<img class="tibia-point-marker__pin-img" src="' + pinUrl +
                            '" width="37" height="61" alt="" draggable="false" />' +
                            '<button type="button" class="tibia-point-marker__plus" aria-label="Adicionar comentário">+</button>' +
                            '<button type="button" class="tibia-point-marker__comment">Adicionar comentário</button>',
                        iconSize: [64, 61],
                        // Tip of the default pin.
                        iconAnchor: [18, 61]
                    });
                }

                function firePointMarkerCommentClick() {
                    plusClickHandlers.forEach(function (fn) {
                        try {
                            fn();
                        } catch (err) {
                            console.error(err);
                        }
                    });
                }

                function bindPointMarkerActions(marker) {
                    if (!marker || marker._tibiaPointBound) return;
                    marker._tibiaPointBound = true;

                    marker.on('add', function () {
                        var el = marker.getElement();
                        if (!el) return;

                        function bindCommentTrigger(node) {
                            if (!node || node._tibiaBound) return;
                            node._tibiaBound = true;
                            node.addEventListener('click', function (e) {
                                e.preventDefault();
                                e.stopPropagation();
                                firePointMarkerCommentClick();
                            });
                            node.addEventListener('mousedown', function (e) {
                                e.preventDefault();
                                e.stopPropagation();
                            });
                        }

                        bindCommentTrigger(el.querySelector('.tibia-point-marker__plus'));
                        bindCommentTrigger(el.querySelector('.tibia-point-marker__comment'));
                    });
                }

                function setMarkerAtPixel(pixelX, pixelY) {
                    var latlng = window.L.latLng(pixelY, pixelX);
                    if (!state.marker) {
                        state.marker = window.L.marker(latlng, {
                            icon: createPointMarkerIcon(),
                            keyboard: false,
                            interactive: true,
                            zIndexOffset: 600
                        });
                        bindPointMarkerActions(state.marker);
                        state.marker.addTo(state.map);
                    } else {
                        state.marker.setLatLng(latlng);
                    }
                }

                function centerOnWorld(worldX, worldY, zoom) {
                    var pixel = toPixelFromWorld(state.bounds, worldX, worldY);
                    var latlng = window.L.latLng(pixel.y, pixel.x);
                    var targetZoom = isFinite(Number(zoom)) ? Number(zoom) : state.map.getZoom();
                    state.map.setView(latlng, targetZoom, { animate: false });
                    setMarkerAtPixel(pixel.x, pixel.y);
                }

                function syncUrlToCenter() {
                    if (!state.hasDeepLink) return;
                    var center = state.map.getCenter();
                    var pixelX = center.lng;
                    var pixelY = center.lat;
                    var world = toWorldFromPixel(state.bounds, pixelX, pixelY);
                    updateUrlPointParam(buildPointParam(world.worldX, world.worldY, state.z, state.map.getZoom()));
                }

                function onMapClick(e) {
                    if (interaction.locked) return;
                    var pixelX = e.latlng.lng;
                    var pixelY = e.latlng.lat;
                    var world = toWorldFromPixel(state.bounds, pixelX, pixelY);
                    setMarkerAtPixel(pixelX, pixelY);
                    state.hasDeepLink = true;
                    updateUrlPointParam(buildPointParam(world.worldX, world.worldY, state.z, state.map.getZoom()));
                }

                state.map.on('click', onMapClick);

                initCreaturePicker();

                // Keep the creature tab inside the Leaflet map container so it stays
                // usable while panning/zooming and above map panes.
                if (creatureUi.panelEl && state.map && state.map.getContainer) {
                    state.map.getContainer().appendChild(creatureUi.panelEl);
                }

                var url = new URL(window.location.href);
                var point = parsePointParam(url.searchParams.get('point'));
                if (point) {
                    state.hasDeepLink = true;
                    setFloor(zFromRelativeLevel(point.level));
                    centerOnWorld(point.worldX, point.worldY, point.zoom);
                } else {
                    setFloor(CONFIG.defaultZ);
                    // Start a bit more zoomed-in than fitBounds (whole-world postage stamp).
                    var startCenter = window.L.latLng(bounds.height / 2, bounds.width / 2);
                    state.map.setView(startCenter, CONFIG.defaultZoom, { animate: false });
                }

                preloadFloorImages();

                setTimeout(function () {
                    state.map.invalidateSize();
                }, 0);

                window.addEventListener('resize', function () {
                    state.map.invalidateSize();
                });

                window.TibiaMapApi = {
                    whenReady: function (cb) {
                        if (typeof cb !== 'function') return;
                        if (mapReady) {
                            cb();
                        } else {
                            readyCallbacks.push(cb);
                        }
                    },
                    onFloorChange: function (fn) {
                        if (typeof fn === 'function') {
                            floorChangeListeners.push(fn);
                        }
                    },
                    onPointMarkerPlusClick: function (fn) {
                        if (typeof fn === 'function') {
                            plusClickHandlers.push(fn);
                        }
                    },
                    getBounds: function () {
                        return state.bounds;
                    },
                    getZ: function () {
                        return state.z;
                    },
                    getMap: function () {
                        return state.map;
                    },
                    toPixelFromWorld: function (worldX, worldY) {
                        return toPixelFromWorld(state.bounds, worldX, worldY);
                    },
                    toWorldFromPixel: function (pixelX, pixelY) {
                        return toWorldFromPixel(state.bounds, pixelX, pixelY);
                    },
                    getPointMarkerLatLng: function () {
                        if (!state.marker) return null;
                        return state.marker.getLatLng();
                    },
                    getSelectedCreatureNames: function () {
                        if (!creatureState.selectedKeys.length) return [];
                        return creatureState.selectedKeys.map(function (key) {
                            return creatureState.nameByKey[key] || key;
                        });
                    }
                };

                mapReady = true;
                readyCallbacks.splice(0).forEach(function (cb) {
                    try {
                        cb();
                    } catch (err) {
                        console.error(err);
                    }
                });
            })
            .catch(function (err) {
                console.error(err);
                createError(mapRoot, 'Falha ao carregar os arquivos do mapa.');
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
