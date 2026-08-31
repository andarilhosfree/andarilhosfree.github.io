(function (global) {
	'use strict';

	var DEFAULT_COVERS = [
		'images/blog/grid/pic1.jpg',
		'images/blog/grid/pic2.jpg',
		'images/blog/grid/pic3.jpg'
	];

	var MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

	function escapeHtml(text) {
		var div = document.createElement('div');
		div.textContent = text == null ? '' : String(text);
		return div.innerHTML;
	}

	function formatPostDate(value) {
		if (!value) {
			return { day: '--', month: '---', year: '' };
		}
		var date = value.toDate ? value.toDate() : new Date(value);
		if (isNaN(date.getTime())) {
			return { day: '--', month: '---', year: '' };
		}
		return {
			day: String(date.getDate()).padStart(2, '0'),
			month: MONTHS_PT[date.getMonth()] || '---',
			year: String(date.getFullYear())
		};
	}

	function coverForIndex(index, coverUrl) {
		if (coverUrl) {
			return coverUrl;
		}
		return DEFAULT_COVERS[index % DEFAULT_COVERS.length];
	}

	function getFirestore() {
		if (!global.AndarilhosAuth || !global.AndarilhosAuth.isConfigured()) {
			return null;
		}
		global.AndarilhosAuth.init();
		return global.AndarilhosAuth.getDb();
	}

	function fetchPublishedPosts(limit) {
		var db = getFirestore();
		if (!db) {
			return Promise.reject(new Error('Firebase não configurado.'));
		}
		return db.collection('posts')
			.where('status', '==', 'published')
			.orderBy('createdAt', 'desc')
			.limit(limit || 24)
			.get();
	}

	function fetchPublishedPostBySlug(slug) {
		var db = getFirestore();
		if (!db) {
			return Promise.reject(new Error('Firebase não configurado.'));
		}
		return db.collection('posts')
			.where('slug', '==', slug)
			.where('status', '==', 'published')
			.limit(1)
			.get();
	}

	function indexErrorMessage() {
		return 'Não foi possível carregar os dados. Tente novamente mais tarde.';
	}


	function slugify(title) {
		var s = String(title || '').trim().toLowerCase();
		if (!s) return 'post';
		try {
			s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
		} catch (e) { /* ignore */ }
		s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
		return (s || 'post').slice(0, 80);
	}

	function sanitizeContentHtml(html) {
		if (!html) return '';
		if (global.DOMPurify) {
			return global.DOMPurify.sanitize(html, {
				ADD_TAGS: ['iframe'],
				ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'target', 'rel']
			});
		}
		return html;
	}

	function fetchPostById(postId) {
		var db = getFirestore();
		if (!db) {
			return Promise.reject(new Error('Firebase não configurado.'));
		}
		return db.collection('posts').doc(postId).get();
	}

	function timestampMs(value) {
		if (!value) return 0;
		if (value.toMillis) return value.toMillis();
		var date = new Date(value);
		return isNaN(date.getTime()) ? 0 : date.getTime();
	}

	function snapshotFromDocs(docs) {
		return {
			empty: docs.length === 0,
			forEach: function (fn) {
				docs.forEach(fn);
			}
		};
	}

	function fetchAuthorPosts(authorUid, status, limit) {
		var db = getFirestore();
		if (!db) {
			return Promise.reject(new Error('Firebase não configurado.'));
		}
		var max = limit || 20;
		// Single-field query — no composite index required; filter/sort client-side.
		return db.collection('posts')
			.where('authorUid', '==', authorUid)
			.limit(100)
			.get()
			.then(function (snapshot) {
				var docs = [];
				snapshot.forEach(function (doc) {
					if ((doc.data().status || '') === status) {
						docs.push(doc);
					}
				});
				docs.sort(function (a, b) {
					return timestampMs(b.data().updatedAt) - timestampMs(a.data().updatedAt);
				});
				return snapshotFromDocs(docs.slice(0, max));
			});
	}

	function fetchAuthorDrafts(authorUid, limit) {
		return fetchAuthorPosts(authorUid, 'draft', limit);
	}

	global.BlogCommon = {
		escapeHtml: escapeHtml,
		formatPostDate: formatPostDate,
		coverForIndex: coverForIndex,
		fetchPublishedPosts: fetchPublishedPosts,
		fetchPublishedPostBySlug: fetchPublishedPostBySlug,
		indexErrorMessage: indexErrorMessage,
		slugify: slugify,
		sanitizeContentHtml: sanitizeContentHtml,
		fetchPostById: fetchPostById,
		fetchAuthorPosts: fetchAuthorPosts,
		fetchAuthorDrafts: fetchAuthorDrafts
	};
})(window);
