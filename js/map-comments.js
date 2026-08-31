(function () {
	'use strict';

	var COLLECTION = 'mapComments';
	var VISIBILITY_KEY = 'mapCommentsVisible';
	var MAX_TEXT = 255;

	var db = null;
	var commentsVisible = true;
	var commentLayer = null;
	var allCommentsUnsubscribe = null;
	var commentsById = {};
	var userVotes = {};
	var pendingCoords = null;
	var pendingCreatures = [];
	var commentsControlEl = null;
	var commentToastEl = null;
	var commentToastTimer = null;
	var allCommentsCache = [];
	var currentFloorZ = 7;
	var didAutoPanForFloor = {};
	var openPopupCommentId = null;

	function $(id) {
		return document.getElementById(id);
	}

	function escapeHtml(str) {
		var div = document.createElement('div');
		div.textContent = str == null ? '' : String(str);
		return div.innerHTML;
	}

	function formatDate(ts) {
		if (!ts || typeof ts.toDate !== 'function') return '';
		return ts.toDate().toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function isLoggedIn() {
		return Boolean(window.AndarilhosAuth && window.AndarilhosAuth.getCurrentUser());
	}

	function canComment() {
		var member = window.AndarilhosAuth.getCachedMember();
		return window.AndarilhosAuth.hasPermission(member, 'mapComments');
	}

	function showLoginModal() {
		if (window.jQuery) {
			var configNotice = $('mapLoginConfigNotice');
			if (configNotice && window.AndarilhosAuth && !window.AndarilhosAuth.isConfigured()) {
				configNotice.classList.remove('d-none');
			}
			window.jQuery('#mapLoginModal').modal('show');
		}
	}

	function showCommentToast(message) {
		if (!commentToastEl) {
			commentToastEl = document.createElement('div');
			commentToastEl.className = 'map-comment-toast';
			commentToastEl.setAttribute('role', 'status');
			var mapRoot = document.getElementById('tibia-map');
			if (mapRoot) {
				mapRoot.appendChild(commentToastEl);
			}
		}
		if (!commentToastEl.parentNode) {
			var root = document.getElementById('tibia-map');
			if (root) root.appendChild(commentToastEl);
		}
		commentToastEl.textContent = message;
		commentToastEl.classList.add('is-visible');
		if (commentToastTimer) clearTimeout(commentToastTimer);
		commentToastTimer = setTimeout(function () {
			commentToastEl.classList.remove('is-visible');
		}, 3500);
	}

	function getSelectedCreatures() {
		if (window.TibiaMapApi && typeof window.TibiaMapApi.getSelectedCreatureNames === 'function') {
			return window.TibiaMapApi.getSelectedCreatureNames();
		}
		return [];
	}

	function syncComposeCreatures(names) {
		var el = $('mapCommentCreatures');
		if (!el) return;
		if (!names || !names.length) {
			el.innerHTML = '';
			el.hidden = true;
			return;
		}
		el.hidden = false;
		el.innerHTML = names.map(function (name) {
			return '<span class="map-comment-modal__creature">' + escapeHtml(name) + '</span>';
		}).join('');
	}

	function formatCreaturesHtml(creatures) {
		if (!creatures || !creatures.length) return '';
		return (
			'<div class="tibia-comment-popup__creatures">' +
			creatures.map(function (name) {
				return '<span class="tibia-comment-popup__creature">' + escapeHtml(name) + '</span>';
			}).join('') +
			'</div>'
		);
	}

	function showComposeModal(coords, creatures) {
		pendingCoords = coords;
		pendingCreatures = Array.isArray(creatures) ? creatures.slice() : [];
		var textarea = $('mapCommentText');
		var counter = $('mapCommentCounter');
		var error = $('mapCommentError');
		if (textarea) {
			textarea.value = '';
		}
		if (counter) {
			counter.textContent = '0/' + MAX_TEXT;
			counter.classList.remove('is-warning');
		}
		if (error) error.textContent = '';
		syncComposeCreatures(pendingCreatures);
		if (window.jQuery) {
			window.jQuery('#mapCommentModal').modal('show');
			setTimeout(function () {
				if (textarea) textarea.focus();
			}, 300);
		}
	}

	function readVisibilityPref() {
		try {
			var stored = localStorage.getItem(VISIBILITY_KEY);
			if (stored === 'false') return false;
			if (stored === 'true') return true;
		} catch (e) {
			/* ignore */
		}
		return true;
	}

	function saveVisibilityPref(visible) {
		try {
			localStorage.setItem(VISIBILITY_KEY, visible ? 'true' : 'false');
		} catch (e) {
			/* ignore */
		}
	}

	function syncCommentsControlUi() {
		if (!commentsControlEl) return;
		var count = getCommentsList().length;
		var label = 'Comentários';
		if (count > 0) {
			label += ' (' + count + ')';
		}
		if (!commentsVisible && count > 0) {
			label += ' · ocultos';
		}
		commentsControlEl.innerHTML = label;
		commentsControlEl.classList.toggle('is-off', !commentsVisible);
		commentsControlEl.setAttribute('aria-pressed', commentsVisible ? 'true' : 'false');
		commentsControlEl.title = commentsVisible ? 'Ocultar comentários' : 'Mostrar comentários';
	}

	function createCommentIcon() {
		return window.L.divIcon({
			className: 'tibia-comment-marker',
			html:
				'<span class="tibia-comment-marker__bubble" aria-hidden="true">' +
				'<svg class="tibia-comment-marker__svg" viewBox="0 0 24 24" width="18" height="18" focusable="false">' +
				'<path fill="currentColor" d="M12 2C6.48 2 2 5.94 2 10.6c0 2.13 1.02 4.04 2.62 5.34-.1.82-.37 2.22-.95 3.22a.44.44 0 0 0 .34.66c.1 0 .19-.03.27-.08 1.6-.74 2.84-1.47 3.6-1.98 1.03.42 2.16.64 3.32.64 5.52 0 10-3.94 10-8.6S17.52 2 12 2z"/>' +
				'</svg></span>',
			iconSize: [32, 36],
			iconAnchor: [16, 34]
		});
	}

	function getCreatedAtMs(comment) {
		if (!comment || !comment.createdAt) return 0;
		if (typeof comment.createdAt.toMillis === 'function') {
			return comment.createdAt.toMillis();
		}
		if (typeof comment.createdAt.toDate === 'function') {
			return comment.createdAt.toDate().getTime();
		}
		return 0;
	}

	function normalizeComment(doc) {
		var data = doc.data() || {};
		return {
			id: doc.id,
			text: data.text || '',
			authorUid: data.authorUid || '',
			authorName: data.authorName || 'Anônimo',
			worldX: Number(data.worldX),
			worldY: Number(data.worldY),
			z: Math.floor(Number(data.z)),
			creatures: Array.isArray(data.creatures) ? data.creatures : [],
			upCount: Number(data.upCount) || 0,
			downCount: Number(data.downCount) || 0,
			createdAt: data.createdAt || null
		};
	}

	function isCommentOwner(comment) {
		var user = window.AndarilhosAuth && window.AndarilhosAuth.getCurrentUser();
		return Boolean(user && comment.authorUid && comment.authorUid === user.uid);
	}

	function isAdminUser() {
		var member = window.AndarilhosAuth && window.AndarilhosAuth.getCachedMember();
		return Boolean(window.AndarilhosAuth && window.AndarilhosAuth.isAdmin(member));
	}

	function canDeleteComment(comment) {
		return (isCommentOwner(comment) && canComment()) || isAdminUser();
	}

	function buildPopupContent(comment) {
		var id = comment.id;
		var up = comment.upCount || 0;
		var down = comment.downCount || 0;
		var score = up - down;
		var canDelete = canDeleteComment(comment);
		var footerHtml;
		if (canDelete) {
			footerHtml =
				'<div class="tibia-comment-popup__actions">' +
				'<button type="button" class="tibia-comment-popup__delete" data-action="delete">Excluir</button>' +
				'</div>';
		} else {
			var userVote = userVotes[id];
			var upActive = userVote === 1 ? ' is-active' : '';
			var downActive = userVote === -1 ? ' is-active' : '';
			footerHtml =
				'<div class="tibia-comment-popup__votes">' +
				'<button type="button" class="tibia-comment-popup__vote tibia-comment-popup__vote--up' + upActive + '" data-vote="1" aria-label="Voto positivo">▲</button>' +
				'<span class="tibia-comment-popup__score">' + score + '</span>' +
				'<button type="button" class="tibia-comment-popup__vote tibia-comment-popup__vote--down' + downActive + '" data-vote="-1" aria-label="Voto negativo">▼</button>' +
				'</div>';
		}

		return (
			'<div class="tibia-comment-popup" data-comment-id="' + escapeHtml(id) + '">' +
			'<div class="tibia-comment-popup__meta">' +
			'<span class="tibia-comment-popup__author">' + escapeHtml(comment.authorName || 'Anônimo') + '</span>' +
			'<time class="tibia-comment-popup__date">' + escapeHtml(formatDate(comment.createdAt)) + '</time>' +
			'</div>' +
			formatCreaturesHtml(comment.creatures) +
			'<p class="tibia-comment-popup__text">' + escapeHtml(comment.text || '') + '</p>' +
			footerHtml +
			'</div>'
		);
	}

	function bindPopupActions(marker, commentId) {
		marker.on('popupopen', function () {
			var popup = marker.getPopup();
			if (!popup || typeof popup.getElement !== 'function') return;
			var el = popup.getElement();
			if (!el) return;
			var content = el.querySelector('.leaflet-popup-content');
			if (!content || content._tibiaActionsBound) return;
			content._tibiaActionsBound = true;
			content.addEventListener('click', function (e) {
				var popupRoot = e.target.closest('.tibia-comment-popup');
				if (!popupRoot) return;

				var deleteBtn = e.target.closest('[data-action="delete"]');
				if (deleteBtn) {
					e.preventDefault();
					handleDeleteComment(commentId, marker);
					return;
				}

				var voteBtn = e.target.closest('[data-vote]');
				if (!voteBtn) return;
				e.preventDefault();
				e.stopPropagation();
				if (window.L && window.L.DomEvent) {
					window.L.DomEvent.stopPropagation(e);
				}
				var value = parseInt(voteBtn.getAttribute('data-vote'), 10);
				handleVote(commentId, value, marker);
			});
		});
	}

	function getCommentsList() {
		return Object.keys(commentsById).map(function (key) {
			return commentsById[key];
		});
	}

	function commentLatLng(comment) {
		var pixel = window.TibiaMapApi.toPixelFromWorld(comment.worldX, comment.worldY);
		return window.L.latLng(pixel.y, pixel.x);
	}

	function anyCommentInView(comments) {
		if (!comments.length || !window.TibiaMapApi) return false;
		var map = window.TibiaMapApi.getMap();
		if (!map || !map.getBounds) return false;
		var bounds = map.getBounds();
		return comments.some(function (comment) {
			return bounds.contains(commentLatLng(comment));
		});
	}

	function ensureCommentsInView(comments, floorZ) {
		if (!comments.length || !window.TibiaMapApi || !window.L) return;
		var floorKey = String(floorZ);
		if (didAutoPanForFloor[floorKey]) return;
		if (anyCommentInView(comments)) {
			didAutoPanForFloor[floorKey] = true;
			return;
		}

		var map = window.TibiaMapApi.getMap();
		if (!map) return;

		didAutoPanForFloor[floorKey] = true;
		var latlngs = comments.map(commentLatLng);
		if (latlngs.length === 1) {
			map.panTo(latlngs[0], { animate: true, duration: 0.35 });
			return;
		}
		map.fitBounds(window.L.latLngBounds(latlngs).pad(0.35), {
			animate: true,
			duration: 0.35,
			maxZoom: Math.max(map.getZoom(), 0)
		});
	}

	function renderMarkers() {
		if (!commentLayer || !window.TibiaMapApi) return;
		commentLayer.clearLayers();
		if (!commentsVisible) {
			syncCommentsControlUi();
			return;
		}

		var comments = getCommentsList().slice().sort(function (a, b) {
			return getCreatedAtMs(b) - getCreatedAtMs(a);
		});

		var reopenId = openPopupCommentId;
		var markerToReopen = null;

		var map = commentLayer._map || window.TibiaMapApi.getMap();
		var useCommentPane = map && map.getPane('commentPane');

		comments.forEach(function (comment) {
			if (!isFinite(comment.worldX) || !isFinite(comment.worldY)) return;

			var pixel = window.TibiaMapApi.toPixelFromWorld(comment.worldX, comment.worldY);
			if (!isFinite(pixel.x) || !isFinite(pixel.y)) return;

			var latlng = window.L.latLng(pixel.y, pixel.x);
			var markerOpts = {
				icon: createCommentIcon(),
				keyboard: false,
				interactive: true,
				zIndexOffset: 1500
			};
			if (useCommentPane) {
				markerOpts.pane = 'commentPane';
			}

			var marker = window.L.marker(latlng, markerOpts);
			marker.bindPopup(buildPopupContent(comment), {
				className: 'tibia-comment-popup-wrap',
				maxWidth: 280,
				minWidth: 200,
				autoPan: false,
				closeButton: true,
				autoClose: false,
				closeOnClick: false
			});
			bindPopupActions(marker, comment.id);
			marker.on('popupopen', function () {
				openPopupCommentId = comment.id;
			});
			marker.on('popupclose', function () {
				if (openPopupCommentId === comment.id) {
					openPopupCommentId = null;
				}
			});
			marker.on('click', function (e) {
				if (window.L && window.L.DomEvent) {
					window.L.DomEvent.stopPropagation(e);
				}
				marker.openPopup();
			});
			if (comment.id === reopenId) {
				markerToReopen = marker;
			}
			marker.addTo(commentLayer);
		});

		syncCommentsControlUi();

		if (reopenId && markerToReopen) {
			setTimeout(function () {
				if (markerToReopen && commentLayer.hasLayer(markerToReopen)) {
					markerToReopen.openPopup();
				}
			}, 0);
		}

		if (comments.length > 0) {
			ensureCommentsInView(comments, currentFloorZ);
		}
	}

	function applyCommentsForFloor(floorZ) {
		var z = Math.floor(Number(floorZ));
		if (!isFinite(z)) {
			z = window.TibiaMapApi ? Math.floor(Number(window.TibiaMapApi.getZ())) : 7;
		}
		currentFloorZ = z;
		commentsById = {};
		allCommentsCache.forEach(function (item) {
			if (Math.floor(Number(item.z)) === z) {
				commentsById[item.id] = item;
			}
		});
		renderMarkers();
		refreshUserVotes();
	}

	function subscribeAllComments() {
		if (allCommentsUnsubscribe) {
			allCommentsUnsubscribe();
			allCommentsUnsubscribe = null;
		}
		if (!db) return;

		var firstSnapshot = true;
		allCommentsUnsubscribe = db.collection(COLLECTION).onSnapshot(function (snap) {
			allCommentsCache = [];
			snap.forEach(function (doc) {
				allCommentsCache.push(normalizeComment(doc));
			});
			applyCommentsForFloor(currentFloorZ);
			if (firstSnapshot) {
				firstSnapshot = false;
				var count = getCommentsList().length;
				if (count > 0 && commentsVisible) {
					showCommentToast(count === 1
						? '1 comentário neste andar — clique no ícone de chat.'
						: count + ' comentários neste andar — clique nos ícones de chat.');
				}
			}
		}, function (err) {
			console.error('Comments snapshot failed', err);
			showCommentToast('Não foi possível carregar os comentários.');
		});
	}

	function subscribeComments(z) {
		var nextZ = Math.floor(Number(z));
		if (!isFinite(nextZ)) {
			nextZ = window.TibiaMapApi ? Math.floor(Number(window.TibiaMapApi.getZ())) : 7;
		}
		currentFloorZ = nextZ;
		if (!allCommentsUnsubscribe) {
			subscribeAllComments();
			return;
		}
		applyCommentsForFloor(currentFloorZ);
	}

	function setupCommentsOnMap() {
		if (!window.TibiaMapApi || commentLayer) return;
		if (!window.AndarilhosAuth || !window.AndarilhosAuth.isConfigured()) return;

		window.AndarilhosAuth.init();
		db = window.AndarilhosAuth.getDb();
		if (!db) return;

		var map = window.TibiaMapApi.getMap();
		if (!map.getPane('commentPane')) {
			map.createPane('commentPane');
			var commentPane = map.getPane('commentPane');
			commentPane.style.zIndex = 1250;
			commentPane.classList.add('leaflet-comment-pane');
		}
		var popupPane = map.getPane('popupPane');
		if (popupPane) {
			popupPane.style.zIndex = 1300;
		}

		commentLayer = window.L.layerGroup().addTo(map);

		addCommentsToggleControl(map);

		window.TibiaMapApi.onFloorChange(function (nextZ) {
			subscribeComments(nextZ);
		});

		subscribeComments(window.TibiaMapApi.getZ());

		if (typeof window.AndarilhosAuth.whenAuthReady === 'function') {
			window.AndarilhosAuth.whenAuthReady().then(function () {
				refreshUserVotes();
			});
			window.AndarilhosAuth.onAuthStateChanged(function () {
				refreshUserVotes();
			});
		}
	}

	function refreshUserVotes() {
		var user = window.AndarilhosAuth && window.AndarilhosAuth.getCurrentUser();
		if (!user || !db) {
			userVotes = {};
			return Promise.resolve();
		}

		var comments = getCommentsList();
		if (!comments.length) {
			userVotes = {};
			return Promise.resolve();
		}

		return Promise.all(comments.map(function (comment) {
			return db.collection(COLLECTION).doc(comment.id).collection('votes').doc(user.uid).get()
				.then(function (snap) {
					if (snap.exists) {
						userVotes[comment.id] = snap.data().value;
					} else {
						delete userVotes[comment.id];
					}
				});
		}));
	}

	function handleVote(commentId, value, marker) {
		if (!isLoggedIn()) {
			showLoginModal();
			return;
		}
		if (!canComment()) return;
		if (!db) return;

		var comment = commentsById[commentId];
		if (comment && isCommentOwner(comment)) return;

		var user = window.AndarilhosAuth.getCurrentUser();
		if (!user) return;

		var commentRef = db.collection(COLLECTION).doc(commentId);
		var voteRef = commentRef.collection('votes').doc(user.uid);
		var resolvedVote = value;
		var newUpCount = 0;
		var newDownCount = 0;

		db.runTransaction(function (transaction) {
			return transaction.get(voteRef).then(function (voteSnap) {
				return transaction.get(commentRef).then(function (commentSnap) {
					if (!commentSnap.exists) {
						throw new Error('Comment not found');
					}

					var comment = commentSnap.data();
					var upCount = comment.upCount || 0;
					var downCount = comment.downCount || 0;
					var oldVote = voteSnap.exists ? voteSnap.data().value : null;
					var newVote = value;

					if (oldVote === newVote) {
						newVote = null;
					}

					if (oldVote === 1) upCount -= 1;
					if (oldVote === -1) downCount -= 1;

					if (newVote === 1) upCount += 1;
					if (newVote === -1) downCount += 1;

					if (newVote === null) {
						transaction.delete(voteRef);
					} else {
						transaction.set(voteRef, {
							value: newVote,
							updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
						});
					}

					transaction.update(commentRef, {
						upCount: upCount,
						downCount: downCount
					});

					resolvedVote = newVote;
					newUpCount = upCount;
					newDownCount = downCount;
				});
			});
		}).then(function () {
			if (resolvedVote === null) {
				delete userVotes[commentId];
			} else {
				userVotes[commentId] = resolvedVote;
			}

			var comment = commentsById[commentId];
			if (comment) {
				comment.upCount = newUpCount;
				comment.downCount = newDownCount;
			}

			if (comment && marker && marker.getPopup) {
				marker.setPopupContent(buildPopupContent(comment));
			}
		}).catch(function (err) {
			console.error('Vote failed', err);
		});
	}

	function handleDeleteComment(commentId, marker) {
		var comment = commentsById[commentId];
		if (!comment) return;

		if (!isLoggedIn()) {
			showLoginModal();
			return;
		}
		if (!canDeleteComment(comment) || !db) return;

		if (!window.confirm('Excluir este comentário?')) return;

		db.collection(COLLECTION).doc(commentId).delete()
			.then(function () {
				if (marker && typeof marker.closePopup === 'function') {
					marker.closePopup();
				}
			})
			.catch(function (err) {
				console.error('Comment delete failed', err);
				showCommentToast('Não foi possível excluir o comentário.');
			});
	}

	function getCoordsFromPointMarker() {
		if (!window.TibiaMapApi) return null;
		var latlng = window.TibiaMapApi.getPointMarkerLatLng();
		if (!latlng) return null;
		var world = window.TibiaMapApi.toWorldFromPixel(latlng.lng, latlng.lat);
		return {
			worldX: Math.round(world.worldX),
			worldY: Math.round(world.worldY),
			z: window.TibiaMapApi.getZ()
		};
	}

	function onPlusClick() {
		var coords = getCoordsFromPointMarker();
		if (!coords) {
			showCommentToast('Clique no mapa para marcar o local antes de comentar.');
			return;
		}

		if (!window.AndarilhosAuth || !window.AndarilhosAuth.isConfigured()) {
			showLoginModal();
			return;
		}

		if (!isLoggedIn()) {
			showLoginModal();
			return;
		}
		if (!canComment()) {
			showLoginModal();
			return;
		}

		showComposeModal(coords, getSelectedCreatures());
	}

	function submitComment() {
		var textarea = $('mapCommentText');
		var error = $('mapCommentError');
		var submitBtn = $('mapCommentSubmit');
		if (!textarea || !pendingCoords || !db) return;

		var text = String(textarea.value || '').trim();
		if (!text) {
			if (error) error.textContent = 'Escreva um comentário.';
			return;
		}
		if (text.length > MAX_TEXT) {
			if (error) error.textContent = 'Máximo de ' + MAX_TEXT + ' caracteres.';
			return;
		}

		var user = window.AndarilhosAuth.getCurrentUser();
		if (!user || !canComment()) {
			showLoginModal();
			return;
		}

		if (submitBtn) submitBtn.disabled = true;

		db.collection(COLLECTION).add({
			text: text,
			authorUid: user.uid,
			authorName: user.displayName || user.email || 'Membro',
			worldX: pendingCoords.worldX,
			worldY: pendingCoords.worldY,
			z: pendingCoords.z,
			creatures: pendingCreatures || [],
			upCount: 0,
			downCount: 0,
			createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
		}).then(function () {
			pendingCoords = null;
			pendingCreatures = [];
			if (error) error.textContent = '';
			if (window.jQuery) {
				window.jQuery('#mapCommentModal').modal('hide');
			}
		}).catch(function (err) {
			console.error('Comment create failed', err);
			if (error) error.textContent = 'Não foi possível publicar. Tente novamente.';
		}).finally(function () {
			if (submitBtn) submitBtn.disabled = false;
		});
	}

	function bindComposeModal() {
		var textarea = $('mapCommentText');
		var counter = $('mapCommentCounter');
		var submitBtn = $('mapCommentSubmit');

		if (textarea && counter) {
			textarea.addEventListener('input', function () {
				var len = textarea.value.length;
				counter.textContent = len + '/' + MAX_TEXT;
				counter.classList.toggle('is-warning', len >= MAX_TEXT - 20);
			});
		}

		if (submitBtn) {
			submitBtn.addEventListener('click', function (e) {
				e.preventDefault();
				submitComment();
			});
		}
	}

	function addCommentsToggleControl(map) {
		var CommentsControl = window.L.Control.extend({
			options: { position: 'topleft' },
			onAdd: function () {
				var container = window.L.DomUtil.create('div', 'leaflet-bar leaflet-control tibia-comments-control');
				var btn = window.L.DomUtil.create('a', 'tibia-comments-control__btn', container);
				btn.href = '#';
				btn.innerHTML = 'Comentários';
				btn.setAttribute('role', 'button');
				btn.setAttribute('aria-label', 'Mostrar ou ocultar comentários');
				commentsControlEl = btn;

				window.L.DomEvent.disableClickPropagation(container);
				window.L.DomEvent.disableScrollPropagation(container);

				window.L.DomEvent.on(btn, 'click', function (e) {
					window.L.DomEvent.preventDefault(e);
					window.L.DomEvent.stop(e);
					commentsVisible = !commentsVisible;
					saveVisibilityPref(commentsVisible);
					syncCommentsControlUi();
					renderMarkers();
				});

				syncCommentsControlUi();
				return container;
			}
		});

		map.addControl(new CommentsControl());
	}

	function waitForTibiaMapApi() {
		return new Promise(function (resolve) {
			function tryReady() {
				if (window.TibiaMapApi && typeof window.TibiaMapApi.whenReady === 'function') {
					window.TibiaMapApi.whenReady(resolve);
					return;
				}
				setTimeout(tryReady, 20);
			}
			tryReady();
		});
	}

	function initCommentsModule() {
		commentsVisible = readVisibilityPref();
		bindComposeModal();

		waitForTibiaMapApi().then(function () {
			window.TibiaMapApi.onPointMarkerPlusClick(onPlusClick);
			setupCommentsOnMap();
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initCommentsModule);
	} else {
		initCommentsModule();
	}
})();
