(function () {
	'use strict';

	var PREVIEW_LIMIT = 3;

	function setVisible(el, visible) {
		if (!el) return;
		el.classList.toggle('d-none', !visible);
	}

	function initBlogPreview() {
		var listEl = document.getElementById('blogPreviewList');
		if (!listEl || !window.BlogCommon) return;

		var loadingEl = document.getElementById('blogPreviewLoading');
		var emptyEl = document.getElementById('blogPreviewEmpty');
		var errorEl = document.getElementById('blogPreviewError');

		setVisible(loadingEl, true);
		setVisible(emptyEl, false);
		setVisible(errorEl, false);
		listEl.innerHTML = '';

		window.BlogCommon.fetchPublishedPosts(PREVIEW_LIMIT)
			.then(function (snapshot) {
				setVisible(loadingEl, false);
				if (snapshot.empty) {
					setVisible(emptyEl, true);
					return;
				}
				var html = '';
				snapshot.forEach(function (doc) {
					html += window.BlogCommon.renderPostCard(doc);
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
		document.addEventListener('DOMContentLoaded', initBlogPreview);
	} else {
		initBlogPreview();
	}
})();
