(function () {
	'use strict';

	var PAGE_SIZE = 12;

	var lastDoc = null;
	var loadingMore = false;

	function setVisible(el, visible) {
		if (!el) return;
		el.classList.toggle('d-none', !visible);
	}

	function setLoadMoreLoading(loading) {
		var btn = document.getElementById('blogPostsLoadMore');
		var loadingEl = document.getElementById('blogPostsLoadMoreLoading');
		if (btn) btn.disabled = loading;
		if (loadingEl) setVisible(loadingEl, loading);
	}

	function updateLoadMore(hasMore) {
		var wrap = document.getElementById('blogPostsLoadMoreWrap');
		if (!wrap) return;
		setVisible(wrap, hasMore);
	}

	function appendPosts(listEl, docs) {
		var html = '';
		docs.forEach(function (doc) {
			html += window.BlogCommon.renderPostCard(doc);
		});
		listEl.insertAdjacentHTML('beforeend', html);
	}

	function handleFetchError(err, errorEl) {
		setVisible(errorEl, true);
		if (errorEl) {
			var msg = (err && err.message) || 'Não foi possível carregar os posts.';
			if (err && err.code === 'failed-precondition') {
				msg = window.BlogCommon.indexErrorMessage();
			}
			errorEl.textContent = msg;
		}
	}

	function loadPage(isInitial) {
		var listEl = document.getElementById('blogPostsList');
		var loadingEl = document.getElementById('blogPostsLoading');
		var emptyEl = document.getElementById('blogPostsEmpty');
		var errorEl = document.getElementById('blogPostsError');

		if (!listEl) return Promise.resolve();

		if (isInitial) {
			setVisible(loadingEl, true);
			setVisible(emptyEl, false);
			setVisible(errorEl, false);
			setVisible(document.getElementById('blogPostsLoadMoreWrap'), false);
			listEl.innerHTML = '';
			lastDoc = null;
		} else {
			if (loadingMore || !lastDoc) return Promise.resolve();
			loadingMore = true;
			setLoadMoreLoading(true);
		}

		return window.BlogCommon.fetchPublishedPostsPage({
			pageSize: PAGE_SIZE,
			afterDoc: isInitial ? null : lastDoc
		})
			.then(function (page) {
				if (isInitial) {
					setVisible(loadingEl, false);
					if (page.empty) {
						setVisible(emptyEl, true);
						updateLoadMore(false);
						return;
					}
				}

				appendPosts(listEl, page.docs);
				lastDoc = page.lastDoc;
				updateLoadMore(page.hasMore);
			})
			.catch(function (err) {
				if (isInitial) {
					setVisible(loadingEl, false);
				}
				handleFetchError(err, errorEl);
			})
			.finally(function () {
				if (!isInitial) {
					loadingMore = false;
					setLoadMoreLoading(false);
				}
			});
	}

	function initBlogList() {
		var loadMoreBtn = document.getElementById('blogPostsLoadMore');
		if (loadMoreBtn) {
			loadMoreBtn.addEventListener('click', function () {
				loadPage(false);
			});
		}
		loadPage(true);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initBlogList);
	} else {
		initBlogList();
	}
})();
