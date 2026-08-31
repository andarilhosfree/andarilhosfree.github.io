(function () {
	'use strict';

	function setVisible(el, visible) {
		if (!el) return;
		el.classList.toggle('d-none', !visible);
	}

	function setBusy(btn, busy, label) {
		if (!btn) return;
		btn.disabled = Boolean(busy);
		if (label) btn.textContent = label;
	}

	function authErrorMessage(code) {
		var messages = {
			'auth/popup-closed-by-user': 'Login cancelado.',
			'auth/popup-blocked': 'O navegador bloqueou o popup. Permita popups para este site.',
			'auth/cancelled-popup-request': 'Aguarde o login anterior terminar.',
			'auth/account-exists-with-different-credential': 'Esta conta já usa outro método de login.',
			'auth/network-request-failed': 'Falha de rede. Verifique sua conexão.',
			'auth/user-disabled': 'Esta conta foi desativada.',
			'permission-denied': 'Sem permissão para esta ação.'
		};
		return messages[code] || 'Não foi possível entrar com Google. Tente novamente.';
	}

	function initMapPageAuth() {
		var loginNav = document.getElementById('mapAuthLogin');
		var userNav = document.getElementById('mapAuthUser');
		var userLabel = document.getElementById('mapAuthUserLabel');
		var logoutBtn = document.getElementById('mapAuthLogout');
		var googleBtn = document.getElementById('mapGoogleSignIn');
		var loginError = document.getElementById('mapLoginError');
		var configNotice = document.getElementById('mapLoginConfigNotice');

		if (!loginNav || !googleBtn || !window.AndarilhosAuth) return;

		if (!window.AndarilhosAuth.isConfigured()) {
			setVisible(configNotice, true);
			googleBtn.disabled = true;
			return;
		}

		setVisible(configNotice, false);
		googleBtn.disabled = false;
		window.AndarilhosAuth.init();

		function hideAuthNav() {
			setVisible(loginNav, false);
			setVisible(userNav, false);
		}

		function updateUi(user, member) {
			var signedIn = Boolean(user);

			setVisible(loginNav, !signedIn);
			setVisible(userNav, signedIn);

			if (signedIn && userLabel) {
				var label = user.displayName || user.email || 'Conta';
				if (member) {
					userLabel.textContent = label;
				} else {
					userLabel.textContent = label + ' (visitante)';
				}
			}

			if (loginError) loginError.textContent = '';
		}

		hideAuthNav();

		window.AndarilhosAuth.whenAuthReady().then(function (state) {
			updateUi(state.user, state.member);
			window.AndarilhosAuth.onAuthStateChanged(updateUi);
		});

		var loginLink = loginNav.querySelector('a');
		if (loginLink) {
			loginLink.addEventListener('click', function () {
				if (window.AndarilhosAuth.collapseMobileNav) {
					window.AndarilhosAuth.collapseMobileNav();
				}
			});
		}

		googleBtn.addEventListener('click', function () {
			if (loginError) loginError.textContent = '';
			setBusy(googleBtn, true, 'Abrindo Google…');

			window.AndarilhosAuth.signInWithGoogle()
				.then(function () {
					if (window.jQuery) {
						window.jQuery('#mapLoginModal').modal('hide');
					}
				})
				.catch(function (err) {
					if (loginError && err && err.code !== 'auth/popup-closed-by-user') {
						loginError.textContent = authErrorMessage(err.code);
					}
				})
				.finally(function () {
					setBusy(googleBtn, false, 'Continuar com Google');
				});
		});

		if (logoutBtn) {
			logoutBtn.addEventListener('click', function (e) {
				e.preventDefault();
				if (window.AndarilhosAuth.collapseMobileNav) {
					window.AndarilhosAuth.collapseMobileNav();
				}
				window.AndarilhosAuth.signOut();
			});
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initMapPageAuth);
	} else {
		initMapPageAuth();
	}
})();
