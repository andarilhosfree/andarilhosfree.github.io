(function () {
	'use strict';

	function setVisible(el, visible) {
		if (!el) return;
		el.classList.toggle('d-none', !visible);
	}

	function getSlugFromUrl() {
		var params = new URLSearchParams(window.location.search);
		return (params.get('slug') || '').trim();
	}

	function renderPost(doc) {
		var data = doc.data();
		var date = window.BlogCommon.formatPostDate(data.createdAt);
		var titleEl = document.getElementById('blogPostTitle');
		var metaEl = document.getElementById('blogPostMeta');
		var bodyEl = document.getElementById('blogPostBody');
		var breadcrumbEl = document.getElementById('blogPostBreadcrumbTitle');
		var bannerTitleEl = document.getElementById('blogPostBannerTitle');
		var coverEl = document.getElementById('blogPostCover');
		var coverWrap = document.getElementById('blogPostCoverWrap');

		var title = data.title || 'Sem título';
		if (titleEl) titleEl.textContent = title;
		if (bannerTitleEl) bannerTitleEl.textContent = title;
		if (breadcrumbEl) breadcrumbEl.textContent = title;

		if (coverEl && coverWrap) {
			coverEl.src = window.BlogCommon.coverForIndex(0, data.coverUrl);
			coverEl.alt = title;
			setVisible(coverWrap, true);
		}

		if (metaEl) {
			metaEl.innerHTML =
				'<ul>' +
				'<li class="post-date"><strong>' + date.day + ' ' + date.month + '</strong> <span>' + date.year + '</span></li>' +
				'<li class="post-author">Por <span>' + window.BlogCommon.escapeHtml(data.authorName || 'Andarilhos Free') + '</span></li>' +
				'</ul>';
		}

		if (bodyEl) {
			var html = data.contentHtml || '<p>' + window.BlogCommon.escapeHtml(data.excerpt || '') + '</p>';
			bodyEl.innerHTML = window.BlogCommon.sanitizeContentHtml(html);
		}

		var editWrap = document.getElementById('blogPostEditWrap');
		if (editWrap && window.AndarilhosAuth) {
			window.AndarilhosAuth.whenAuthReady().then(function (state) {
				var canEdit = state.user
					&& data.authorUid === state.user.uid
					&& window.AndarilhosAuth.hasPermission(state.member, 'blog');
				if (canEdit) {
					var editLink = document.getElementById('blogPostEditLink');
					if (editLink) {
						editLink.href = 'blog-create.html?id=' + encodeURIComponent(doc.id);
					}
					setVisible(editWrap, true);
				}
			});
		}

		document.title = title + ' | Andarilhos das Terras Livres';
	}

	function initBlogPostView() {
		var slug = getSlugFromUrl();
		var loadingEl = document.getElementById('blogPostLoading');
		var errorEl = document.getElementById('blogPostError');
		var articleEl = document.getElementById('blogPostArticle');

		if (!slug) {
			setVisible(loadingEl, false);
			setVisible(errorEl, true);
			if (errorEl) errorEl.textContent = 'Post não encontrado.';
			return;
		}

		window.BlogCommon.fetchPublishedPostBySlug(slug)
			.then(function (snapshot) {
				setVisible(loadingEl, false);
				if (snapshot.empty) {
					setVisible(errorEl, true);
					if (errorEl) errorEl.textContent = 'Post não encontrado.';
					return;
				}
				renderPost(snapshot.docs[0]);
				setVisible(articleEl, true);
			})
			.catch(function (err) {
				setVisible(loadingEl, false);
				setVisible(errorEl, true);
				if (errorEl) {
					var msg = (err && err.message) || 'Não foi possível carregar o post.';
					if (err && err.code === 'failed-precondition') {
						msg = window.BlogCommon.indexErrorMessage();
					}
					errorEl.textContent = msg;
				}
			});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initBlogPostView);
	} else {
		initBlogPostView();
	}
})();
