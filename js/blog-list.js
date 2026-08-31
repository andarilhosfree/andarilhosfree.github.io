(function () {
	'use strict';

	function setVisible(el, visible) {
		if (!el) return;
		el.classList.toggle('d-none', !visible);
	}

	function renderPostCard(doc, index) {
		var data = doc.data();
		var slug = data.slug || doc.id;
		var href = 'blog-post.html?slug=' + encodeURIComponent(slug);
		var date = window.BlogCommon.formatPostDate(data.createdAt);
		var title = window.BlogCommon.escapeHtml(data.title || 'Sem título');
		var excerpt = window.BlogCommon.escapeHtml(data.excerpt || '');
		var author = window.BlogCommon.escapeHtml(data.authorName || 'Andarilhos Free');
		var cover = window.BlogCommon.escapeHtml(window.BlogCommon.coverForIndex(index, data.coverUrl));

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

	function initBlogList() {
		var listEl = document.getElementById('blogPostsList');
		var loadingEl = document.getElementById('blogPostsLoading');
		var emptyEl = document.getElementById('blogPostsEmpty');
		var errorEl = document.getElementById('blogPostsError');

		if (!listEl) return;

		setVisible(loadingEl, true);
		setVisible(emptyEl, false);
		setVisible(errorEl, false);
		listEl.innerHTML = '';

		window.BlogCommon.fetchPublishedPosts(24)
			.then(function (snapshot) {
				setVisible(loadingEl, false);
				if (snapshot.empty) {
					setVisible(emptyEl, true);
					return;
				}
				var html = '';
				var index = 0;
				snapshot.forEach(function (doc) {
					html += renderPostCard(doc, index);
					index += 1;
				});
				listEl.innerHTML = html;
			})
			.catch(function (err) {
				setVisible(loadingEl, false);
				setVisible(errorEl, true);
				if (errorEl) {
					var msg = (err && err.message) || 'Não foi possível carregar os posts.';
					if (err && err.code === 'failed-precondition') {
						msg = window.BlogCommon.indexErrorMessage();
					}
					errorEl.textContent = msg;
				}
			});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initBlogList);
	} else {
		initBlogList();
	}
})();
