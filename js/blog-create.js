(function () {
	'use strict';

	var quill = null;
	var editingPostId = null;
	var editingPostAuthorUid = null;
	var editingPostAuthorName = null;
	var currentUser = null;
	var formInitialized = false;

	function setVisible(el, visible) {
		if (!el) return;
		el.classList.toggle('d-none', !visible);
	}

	function setStatus(msg, isError) {
		var el = document.getElementById('blogCreateStatus');
		if (!el) return;
		el.textContent = msg || '';
		el.classList.toggle('text-danger', Boolean(isError));
		el.classList.toggle('text-success', Boolean(msg && !isError));
	}

	function getPostIdFromUrl() {
		return (new URLSearchParams(window.location.search).get('id') || '').trim();
	}

	function initQuill() {
		var container = document.getElementById('blogCreateEditor');
		if (!container || quill || !window.Quill) return;
		quill = new window.Quill(container, {
			theme: 'snow',
			modules: {
				toolbar: [
					[{ header: [2, 3, false] }],
					['bold', 'italic', 'underline', 'strike'],
					[{ list: 'ordered' }, { list: 'bullet' }],
					['blockquote', 'link', 'image', 'video'],
					['clean']
				]
			}
		});
	}

	function updateStatusBadge(status) {
		var badge = document.getElementById('blogCreateStatusBadge');
		if (!badge) return;
		badge.classList.remove('is-published', 'is-draft');
		if (status === 'published') {
			badge.textContent = 'Publicado';
			badge.classList.add('is-published');
			setVisible(badge, true);
		} else if (status === 'draft') {
			badge.textContent = 'Rascunho';
			badge.classList.add('is-draft');
			setVisible(badge, true);
		} else {
			badge.textContent = '';
			setVisible(badge, false);
		}
	}

	function updateCoverPreview(url) {
		var previewWrap = document.getElementById('blogCreateCoverPreviewWrap');
		var previewImg = document.getElementById('blogCreateCoverPreview');
		var clearBtn = document.getElementById('blogCreateCoverClear');
		var value = (url || '').trim();
		if (previewImg && previewWrap) {
			if (value) {
				previewImg.src = value;
				setVisible(previewWrap, true);
			} else {
				previewImg.removeAttribute('src');
				setVisible(previewWrap, false);
			}
		}
		setVisible(clearBtn, Boolean(value));
	}

	function initCoverUpload() {
		var fileInput = document.getElementById('blogCreateCoverFile');
		var pickBtn = document.getElementById('blogCreateCoverPick');
		var clearBtn = document.getElementById('blogCreateCoverClear');
		var coverUrlEl = document.getElementById('blogCreateCoverUrl');

		if (pickBtn && fileInput) {
			pickBtn.addEventListener('click', function () {
				fileInput.click();
			});
		}

		if (fileInput) {
			fileInput.addEventListener('change', function () {
				var file = fileInput.files && fileInput.files[0];
				fileInput.value = '';
				if (!file) return;

				if (!window.ImgbbUpload) {
					setStatus('Upload de imagem indisponível.', true);
					return;
				}

				setStatus('Enviando capa…', false);
				if (pickBtn) pickBtn.disabled = true;

				window.ImgbbUpload.uploadImage(file)
					.then(function (url) {
						if (coverUrlEl) coverUrlEl.value = url;
						updateCoverPreview(url);
						setStatus('Capa enviada.', false);
					})
					.catch(function (e) {
						setStatus((e && e.message) || 'Erro ao enviar capa.', true);
					})
					.finally(function () {
						if (pickBtn) pickBtn.disabled = false;
					});
			});
		}

		if (clearBtn) {
			clearBtn.addEventListener('click', function () {
				if (coverUrlEl) coverUrlEl.value = '';
				updateCoverPreview('');
			});
		}

		if (coverUrlEl) {
			coverUrlEl.addEventListener('change', function () {
				updateCoverPreview(coverUrlEl.value);
			});
			coverUrlEl.addEventListener('blur', function () {
				updateCoverPreview(coverUrlEl.value);
			});
		}
	}

	function fillForm(data) {
		var titleEl = document.getElementById('blogCreateTitle');
		var slugEl = document.getElementById('blogCreateSlug');
		var excerptEl = document.getElementById('blogCreateExcerpt');
		var coverEl = document.getElementById('blogCreateCoverUrl');
		if (titleEl) titleEl.value = data.title || '';
		if (slugEl) slugEl.value = data.slug || '';
		if (excerptEl) excerptEl.value = data.excerpt || '';
		if (coverEl) coverEl.value = data.coverUrl || '';
		updateCoverPreview(data.coverUrl || '');
		if (quill) {
			quill.root.innerHTML = data.contentHtml || '';
		}
		var deleteBtn = document.getElementById('blogCreateDelete');
		setVisible(deleteBtn, Boolean(editingPostId));
		setVisible(document.getElementById('blogCreateNewLink'), Boolean(editingPostId));
		updateStatusBadge(data.status || (editingPostId ? 'draft' : null));
		document.title = (editingPostId ? 'Editar post' : 'Novo post') + ' | Andarilhos das Terras Livres';
		var banner = document.getElementById('blogCreateBannerTitle');
		if (banner) banner.textContent = editingPostId ? 'Editar publicação' : 'Nova publicação';
	}

	function readForm() {
		var titleEl = document.getElementById('blogCreateTitle');
		var slugEl = document.getElementById('blogCreateSlug');
		var excerptEl = document.getElementById('blogCreateExcerpt');
		var coverEl = document.getElementById('blogCreateCoverUrl');
		var title = (titleEl && titleEl.value || '').trim();
		var slug = (slugEl && slugEl.value || '').trim();
		if (!slug && title) {
			slug = window.BlogCommon.slugify(title);
			if (slugEl) slugEl.value = slug;
		}
		return {
			title: title,
			slug: slug,
			excerpt: (excerptEl && excerptEl.value || '').trim(),
			coverUrl: (coverEl && coverEl.value || '').trim(),
			contentHtml: quill ? quill.root.innerHTML : ''
		};
	}

	function validateForm(data) {
		if (!data.title) return 'Informe o título.';
		if (!data.slug) return 'Informe o slug (URL).';
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) {
			return 'Slug inválido — use letras minúsculas, números e hífens.';
		}
		if (data.coverUrl && !/^https:\/\/.+/i.test(data.coverUrl) && !/^images\//.test(data.coverUrl)) {
			return 'URL de capa inválida.';
		}
		var plain = data.contentHtml.replace(/<[^>]+>/g, '').trim();
		if (!plain) return 'Escreva o conteúdo do post.';
		return '';
	}

	function renderPostListItem(doc, options) {
		var data = doc.data();
		var title = window.BlogCommon.escapeHtml(data.title || 'Sem título');
		var slug = window.BlogCommon.escapeHtml(data.slug || doc.id);
		var editHref = 'blog-create.html?id=' + encodeURIComponent(doc.id);
		var viewHref = 'blog-post.html?slug=' + encodeURIComponent(data.slug || doc.id);
		var isCurrent = editingPostId === doc.id;
		var actions = '';

		if (options.showView) {
			actions += '<a href="' + viewHref + '" class="site-button-link" target="_blank" rel="noopener">Ver</a>';
		}
		if (isCurrent) {
			actions += '<span class="font-14 text-muted">Editando</span>';
		} else {
			actions += '<a href="' + editHref + '" class="site-button-link">Editar</a>';
		}

		return '<li>' +
			'<div>' +
			'<div class="blog-create-drafts__title">' + title + '</div>' +
			'<div class="blog-create-drafts__meta">' + slug + '</div>' +
			'</div>' +
			'<div class="blog-create-drafts__actions">' + actions + '</div>' +
			'</li>';
	}

	function loadAuthorPostList(status, wrapId, listId, emptyId, options) {
		if (!currentUser) return;
		var wrap = document.getElementById(wrapId);
		var listEl = document.getElementById(listId);
		var emptyEl = document.getElementById(emptyId);
		if (!wrap || !listEl) return;

		window.BlogCommon.fetchAuthorPosts(currentUser.uid, status, 20)
			.then(function (snapshot) {
				setVisible(wrap, true);
				if (snapshot.empty) {
					listEl.innerHTML = '';
					setVisible(emptyEl, true);
					return;
				}
				setVisible(emptyEl, false);
				var html = '';
				snapshot.forEach(function (doc) {
					html += renderPostListItem(doc, options || {});
				});
				listEl.innerHTML = html;
			})
			.catch(function (err) {
				if (err && err.code === 'failed-precondition') {
					setVisible(wrap, true);
					setVisible(emptyEl, false);
					listEl.innerHTML = '<li class="text-danger font-14">' +
						window.BlogCommon.escapeHtml(window.BlogCommon.indexErrorMessage()) + '</li>';
				}
			});
	}

	function loadDraftsList() {
		loadAuthorPostList('draft', 'blogCreateDrafts', 'blogCreateDraftsList', 'blogCreateDraftsEmpty', {});
	}

	function loadPublishedList() {
		loadAuthorPostList('published', 'blogCreatePublished', 'blogCreatePublishedList', 'blogCreatePublishedEmpty', { showView: true });
	}

	function refreshPostLists() {
		loadDraftsList();
		loadPublishedList();
	}

	function canUseBlogEditor(member) {
		return window.AndarilhosAuth.hasPermission(member, 'blog')
			|| window.AndarilhosAuth.isAdmin(member);
	}

	function savePost(status) {
		var member = window.AndarilhosAuth.getCachedMember();
		if (!currentUser || !canUseBlogEditor(member)) {
			setStatus('Sem permissão para publicar.', true);
			return Promise.resolve();
		}
		var data = readForm();
		var err = validateForm(data);
		if (err) {
			setStatus(err, true);
			return Promise.resolve();
		}

		var db = window.AndarilhosAuth.getDb();
		if (!db) {
			setStatus('Firebase não configurado.', true);
			return Promise.resolve();
		}

		var payload = {
			title: data.title,
			slug: data.slug,
			excerpt: data.excerpt,
			coverUrl: data.coverUrl || null,
			contentHtml: window.BlogCommon.sanitizeContentHtml(data.contentHtml),
			authorUid: currentUser.uid,
			authorName: currentUser.displayName || currentUser.email || 'Andarilhos Free',
			status: status,
			updatedAt: firebase.firestore.FieldValue.serverTimestamp()
		};

		if (editingPostId && editingPostAuthorUid && editingPostAuthorUid !== currentUser.uid) {
			payload.authorUid = editingPostAuthorUid;
			payload.authorName = editingPostAuthorName || payload.authorName;
		}

		setStatus('Salvando…', false);
		var publishBtn = document.getElementById('blogCreatePublish');
		var draftBtn = document.getElementById('blogCreateDraft');
		if (publishBtn) publishBtn.disabled = true;
		if (draftBtn) draftBtn.disabled = true;

		var promise;
		if (editingPostId) {
			promise = db.collection('posts').doc(editingPostId).update(payload);
		} else {
			payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
			promise = db.collection('posts').add(payload).then(function (ref) {
				editingPostId = ref.id;
				var deleteBtn = document.getElementById('blogCreateDelete');
				setVisible(deleteBtn, true);
				setVisible(document.getElementById('blogCreateNewLink'), true);
				if (window.history && window.history.replaceState) {
					window.history.replaceState({}, '', 'blog-create.html?id=' + encodeURIComponent(editingPostId));
				}
			});
		}

		return promise
			.then(function () {
				updateStatusBadge(status);
				setStatus(status === 'published' ? 'Publicado com sucesso!' : 'Rascunho salvo.', false);
				refreshPostLists();
				if (status === 'published') {
					setTimeout(function () {
						window.location.href = 'blog-post.html?slug=' + encodeURIComponent(data.slug);
					}, 600);
				}
			})
			.catch(function (e) {
				setStatus((e && e.message) || 'Erro ao salvar.', true);
			})
			.finally(function () {
				if (publishBtn) publishBtn.disabled = false;
				if (draftBtn) draftBtn.disabled = false;
			});
	}

	function deletePost() {
		if (!editingPostId || !currentUser) return;
		if (!window.confirm('Excluir este post permanentemente?')) return;
		var db = window.AndarilhosAuth.getDb();
		if (!db) return;
		setStatus('Excluindo…', false);
		db.collection('posts').doc(editingPostId).delete()
			.then(function () {
				window.location.href = 'blog-create.html';
			})
			.catch(function (e) {
				setStatus((e && e.message) || 'Erro ao excluir.', true);
			});
	}

	function loadPostForEdit(postId, user, member) {
		return window.BlogCommon.fetchPostById(postId).then(function (snap) {
			if (!snap.exists) {
				throw new Error('Post não encontrado.');
			}
			var data = snap.data();
			if (data.authorUid !== user.uid && !window.AndarilhosAuth.isAdmin(member)) {
				throw new Error('Você só pode editar seus próprios posts.');
			}
			editingPostId = postId;
			editingPostAuthorUid = data.authorUid || null;
			editingPostAuthorName = data.authorName || null;
			fillForm(data);
			refreshPostLists();
		});
	}

	function showGate(kind) {
		setVisible(document.getElementById('blogCreateFormWrap'), false);
		var gate = document.getElementById('blogCreateGate');
		setVisible(gate, true);
		var msg = document.getElementById('blogCreateGateMessage');
		if (!msg) return;
		if (kind === 'config') {
			msg.textContent = 'Firebase não configurado neste ambiente.';
		} else if (kind === 'login') {
			msg.textContent = 'Entre com Google para criar posts.';
		} else {
			msg.textContent = 'Sua conta não tem permissão para criar posts.';
		}
	}

	function bootEditor(user, member) {
		setVisible(document.getElementById('blogCreateLoading'), false);

		if (!user) {
			formInitialized = false;
			editingPostId = null;
			editingPostAuthorUid = null;
			editingPostAuthorName = null;
			currentUser = null;
			showGate('login');
			return;
		}

		if (!window.AndarilhosAuth.hasPermission(member, 'blog') && !window.AndarilhosAuth.isAdmin(member)) {
			formInitialized = false;
			currentUser = null;
			showGate('permission');
			return;
		}

		setVisible(document.getElementById('blogCreateGate'), false);
		currentUser = user;
		initQuill();
		setVisible(document.getElementById('blogCreateFormWrap'), true);

		if (!formInitialized) {
			formInitialized = true;
			var postId = getPostIdFromUrl();
			if (postId) {
				loadPostForEdit(postId, user, member).catch(function (e) {
					setStatus((e && e.message) || 'Erro ao carregar post.', true);
					fillForm({});
					refreshPostLists();
				});
			} else {
				editingPostId = null;
				editingPostAuthorUid = null;
				editingPostAuthorName = null;
				fillForm({});
				refreshPostLists();
			}
		} else {
			refreshPostLists();
		}
	}

	function initBlogCreate() {
		if (!window.AndarilhosAuth || !window.BlogCommon) return;

		var titleInput = document.getElementById('blogCreateTitle');
		var slugInput = document.getElementById('blogCreateSlug');
		if (titleInput && slugInput) {
			titleInput.addEventListener('blur', function () {
				if (!slugInput.value.trim() && titleInput.value.trim()) {
					slugInput.value = window.BlogCommon.slugify(titleInput.value);
				}
			});
		}

		document.getElementById('blogCreatePublish').addEventListener('click', function () {
			savePost('published');
		});
		document.getElementById('blogCreateDraft').addEventListener('click', function () {
			savePost('draft');
		});
		document.getElementById('blogCreateDelete').addEventListener('click', deletePost);
		initCoverUpload();

		if (!window.AndarilhosAuth.isConfigured()) {
			setVisible(document.getElementById('blogCreateLoading'), false);
			showGate('config');
			return;
		}

		window.AndarilhosAuth.init();
		window.AndarilhosAuth.whenAuthReady().then(function (state) {
			bootEditor(state.user, state.member);
			window.AndarilhosAuth.onAuthStateChanged(bootEditor);
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initBlogCreate);
	} else {
		initBlogCreate();
	}
})();
