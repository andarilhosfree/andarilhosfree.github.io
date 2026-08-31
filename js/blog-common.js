(function (global) {
	'use strict';

	var DEFAULT_LIST_COVER = 'images/blog/default-cover.jpg';

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

	function coverForListing(coverUrl) {
		if (coverUrl) {
			return coverUrl;
		}
		return DEFAULT_LIST_COVER;
	}

	function coverForPost(coverUrl) {
		return coverUrl || null;
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

	function fetchPublishedPostsPage(options) {
		var db = getFirestore();
		if (!db) {
			return Promise.reject(new Error('Firebase não configurado.'));
		}
		var opts = options || {};
		var pageSize = opts.pageSize || 12;
		var afterDoc = opts.afterDoc || null;
		var query = db.collection('posts')
			.where('status', '==', 'published')
			.orderBy('createdAt', 'desc')
			.limit(pageSize + 1);
		if (afterDoc) {
			query = query.startAfter(afterDoc);
		}
		return query.get().then(function (snapshot) {
			var docs = [];
			snapshot.forEach(function (doc) {
				docs.push(doc);
			});
			var hasMore = docs.length > pageSize;
			var pageDocs = docs.slice(0, pageSize);
			return {
				docs: pageDocs,
				hasMore: hasMore,
				lastDoc: pageDocs.length ? pageDocs[pageDocs.length - 1] : null,
				empty: pageDocs.length === 0
			};
		});
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

	function renderPostCard(doc) {
		var data = doc.data();
		var slug = data.slug || doc.id;
		var href = 'blog-post.html?slug=' + encodeURIComponent(slug);
		var date = formatPostDate(data.createdAt);
		var title = escapeHtml(data.title || 'Sem título');
		var excerpt = escapeHtml(data.excerpt || '');
		var author = escapeHtml(data.authorName || 'Andarilhos Free');
		var cover = escapeHtml(coverForListing(data.coverUrl));

		return (
			'<div class="col-lg-4 col-md-6 col-sm-12 m-b30">' +
			'<div class="blog-post blog-grid blog-rounded blog-effect1">' +
			'<div class="dlab-post-media dlab-img-effect">' +
			'<a href="' + href + '"><img src="' + cover + '" alt="' + title + '"></a>' +
			'</div>' +
			'<div class="dlab-info p-a20 border-1">' +
			'<div class="dlab-post-meta">' +
			'<ul>' +
			'<li class="post-date"><strong>' + date.day + ' ' + date.month + '</strong> <span>' + date.year + '</span></li>' +
			'<li class="post-author">Por <span>' + author + '</span></li>' +
			'</ul>' +
			'</div>' +
			'<div class="dlab-post-title">' +
			'<h4 class="post-title"><a href="' + href + '">' + title + '</a></h4>' +
			'</div>' +
			(excerpt ? '<div class="dlab-post-text"><p>' + excerpt + '</p></div>' : '') +
			'<div class="dlab-post-readmore">' +
			'<a href="' + href + '" title="Leia mais" rel="bookmark" class="site-button-link">Leia mais</a>' +
			'</div>' +
			'</div></div></div>'
		);
	}

	global.BlogCommon = {
		escapeHtml: escapeHtml,
		formatPostDate: formatPostDate,
		coverForListing: coverForListing,
		coverForPost: coverForPost,
		defaultListCover: DEFAULT_LIST_COVER,
		renderPostCard: renderPostCard,
		fetchPublishedPosts: fetchPublishedPosts,
		fetchPublishedPostsPage: fetchPublishedPostsPage,
		fetchPublishedPostBySlug: fetchPublishedPostBySlug,
		indexErrorMessage: indexErrorMessage,
		slugify: slugify,
		sanitizeContentHtml: sanitizeContentHtml,
		fetchPostById: fetchPostById,
		fetchAuthorPosts: fetchAuthorPosts,
		fetchAuthorDrafts: fetchAuthorDrafts
	};
})(window);
