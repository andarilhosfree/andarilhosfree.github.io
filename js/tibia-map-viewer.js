(function () {
    'use strict';

    var MAP_ROOT_ID = 'tibia-map';

    var CONFIG = {
        boundsUrl: 'map-data/tibia-map/bounds.json',
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
        defaultZoom: 0,
        minZoom: -2,
        maxZoom: 3
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
        return {
            worldX: pixelX + bounds.xMin,
            worldY: pixelY + bounds.yMin
        };
    }

    function toPixelFromWorld(bounds, worldX, worldY) {
        return {
            x: worldX - bounds.xMin,
            y: worldY - bounds.yMin
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
                    scrollWheelZoom: false
                });

                map.fitBounds(imageBounds);
                map.setMaxBounds(imageBounds);

                var state = {
                    bounds: bounds,
                    imageBounds: imageBounds,
                    map: map,
                    overlay: null,
                    marker: null,
                    z: CONFIG.defaultZ,
                    hasDeepLink: false
                };

                var interaction = {
                    locked: true,
                    overlayEl: null,
                    unlockInProgress: false
                };

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

                function setInteractionLocked(locked) {
                    interaction.locked = Boolean(locked);
                    if (interaction.overlayEl) {
                        interaction.overlayEl.classList.toggle('is-hidden', !interaction.locked);
                    }
                    setMapInteractivityEnabled(!interaction.locked);
                }

                function getFixedHeaderHeight() {
                    // The sticky header implementation toggles fixed positioning dynamically.
                    // Detect the actual fixed bar by reading computed styles.
                    var mainBar = document.querySelector('.main-bar');
                    if (!mainBar) return 0;
                    var style = window.getComputedStyle(mainBar);
                    if (style.position !== 'fixed') return 0;
                    var rect = mainBar.getBoundingClientRect();
                    return rect && rect.height ? rect.height : 0;
                }

                function scrollMapIntoViewIfNeeded() {
                    // Always perform an anchor-like scroll to align the map's top edge
                    // right below the sticky header (if fixed) with a small gap.
                    var container = state.map.getContainer();
                    var epsilonPx = 2;
                    var extraGapPx = 28;
                    var maxWaitMs = 2500;
                    var maxAdjustments = 3;
                    var adjustments = 0;

                    var computeDelta = function () {
                        var headerHeight = getFixedHeaderHeight();
                        // Extra gap so the sticky header never covers map controls.
                        var safeTop = headerHeight + extraGapPx;
                        var rect = container.getBoundingClientRect();
                        return {
                            delta: rect.top - safeTop,
                            safeTop: safeTop
                        };
                    };

                    var applyScroll = function () {
                        var d = computeDelta();
                        var targetScrollY = Math.max(0, window.scrollY + d.delta);
                        window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
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

                            // If smooth scroll settled but we're still misaligned (header became fixed, etc.),
                            // nudge one more time.
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

                    if (state.overlay) {
                        state.map.removeLayer(state.overlay);
                    }

                    state.overlay = window.L.imageOverlay(
                        CONFIG.floorImageUrl(floorId),
                        state.imageBounds,
                        { interactive: false }
                    );
                    state.overlay.addTo(state.map);

                    syncFloorControl();
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
                            up.href = '#';
                            up.title = 'Andar acima';
                            up.setAttribute('aria-label', 'Andar acima');
                            up.innerHTML = '&#9650;';

                            var label = window.L.DomUtil.create('a', 'tibia-floor-label', container);
                            label.href = '#';
                            label.title = 'Andar atual';
                            label.setAttribute('aria-label', 'Andar atual');
                            label.textContent = formatRelativeLevel(relativeLevelFromZ(state.z));

                            var down = window.L.DomUtil.create('a', 'tibia-floor-down', container);
                            down.href = '#';
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
                                stepFloor(-1);
                            });

                            window.L.DomEvent.on(down, 'click', function (e) {
                                window.L.DomEvent.preventDefault(e);
                                stepFloor(1);
                            });

                            window.L.DomEvent.on(label, 'click', function (e) {
                                window.L.DomEvent.preventDefault(e);
                            });

                            return container;
                        }
                    });

                    state.map.addControl(new FloorControl());
                })();

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

                        if (interaction.unlockInProgress) return;
                        interaction.unlockInProgress = true;

                        // If the header is sticky, ensure the map is fully visible below it,
                        // and only then unlock interactions.
                        scrollMapIntoViewIfNeeded()
                            .then(function () {
                                setInteractionLocked(false);
                                state.map.invalidateSize();
                            })
                            .finally(function () {
                                interaction.unlockInProgress = false;
                            });
                    });

                    // Initial state: locked so the page can scroll.
                    setInteractionLocked(true);

                    document.addEventListener('pointerdown', function (e) {
                        if (!interaction.locked && !container.contains(e.target)) {
                            setInteractionLocked(true);
                        }
                    }, true);
                })();

                function setMarkerAtPixel(pixelX, pixelY) {
                    var latlng = window.L.latLng(pixelY, pixelX);
                    if (!state.marker) {
                        state.marker = window.L.marker(latlng, { keyboard: false });
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

                var url = new URL(window.location.href);
                var point = parsePointParam(url.searchParams.get('point'));
                if (point) {
                    state.hasDeepLink = true;
                    setFloor(zFromRelativeLevel(point.level));
                    centerOnWorld(point.worldX, point.worldY, point.zoom);
                } else {
                    setFloor(CONFIG.defaultZ);
                }

                setTimeout(function () {
                    state.map.invalidateSize();
                }, 0);

                window.addEventListener('resize', function () {
                    state.map.invalidateSize();
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
