(function (global) {
	'use strict';

	var MEMBERS_COLLECTION = 'members';
	var memberCache = {
		uid: null,
		data: null
	};

	function getConfig() {
		return global.ANDARILHOS_FIREBASE_CONFIG || null;
	}

	function isConfigured(config) {
		return Boolean(config && config.apiKey && config.projectId);
	}

	function ensureFirebase() {
		var config = getConfig();
		if (!isConfigured(config)) {
			return null;
		}
		if (!global.firebase) {
			return null;
		}
		if (!global.firebase.apps.length) {
			global.firebase.initializeApp(config);
		}
		return {
			auth: global.firebase.auth(),
			db: global.firebase.firestore()
		};
	}

	function normalizeMember(snap) {
		if (!snap || !snap.exists) {
			return null;
		}
		var data = snap.data() || {};
		if (data.active !== true) {
			return null;
		}
		var perms = data.permissions || {};
		return {
			uid: snap.id,
			active: true,
			email: data.email || '',
			displayName: data.displayName || '',
			permissions: {
				blog: perms.blog === true,
				mapComments: perms.mapComments === true,
				admin: perms.admin === true
			}
		};
	}

	function loadMember(db, user) {
		if (!user) {
			memberCache = { uid: null, data: null };
			return Promise.resolve(null);
		}
		if (memberCache.uid === user.uid) {
			return Promise.resolve(memberCache.data);
		}
		return db.collection(MEMBERS_COLLECTION).doc(user.uid).get()
			.then(function (snap) {
				var member = normalizeMember(snap);
				memberCache = { uid: user.uid, data: member };
				return member;
			});
	}

	function ensureMember(db, user) {
		return loadMember(db, user).then(function (member) {
			if (member) {
				return member;
			}
			var ref = db.collection(MEMBERS_COLLECTION).doc(user.uid);
			var payload = {
				active: true,
				email: user.email || '',
				displayName: user.displayName || '',
				permissions: {
					blog: false,
					mapComments: true,
					admin: false
				},
				createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
			};
			return ref.set(payload).then(function () {
				return ref.get();
			}).then(function (snap) {
				var created = normalizeMember(snap);
				memberCache = { uid: user.uid, data: created };
				return created;
			});
		});
	}

	function hasPermission(member, key) {
		return Boolean(member && member.permissions && member.permissions[key]);
	}

	function isAdmin(member) {
		return hasPermission(member, 'admin');
	}

	var authStateListeners = [];
	var initialized = false;
	var firebaseServices = null;

	function notifyAuthState(user, member) {
		authStateListeners.forEach(function (fn) {
			try {
				fn(user, member);
			} catch (e) {
				console.error(e);
			}
		});
	}

	function init() {
		if (initialized) {
			return Boolean(firebaseServices);
		}
		initialized = true;
		firebaseServices = ensureFirebase();
		if (!firebaseServices) {
			return false;
		}

		firebaseServices.auth.getRedirectResult()
			.then(function (result) {
				if (result && result.user) {
					return ensureMember(firebaseServices.db, result.user)
						.then(function (member) {
							notifyAuthState(result.user, member);
						});
				}
			})
			.catch(function (err) {
				console.error('Auth redirect failed', err);
			});

		firebaseServices.auth.onAuthStateChanged(function (user) {
			if (!user) {
				memberCache = { uid: null, data: null };
				notifyAuthState(null, null);
				return;
			}
			ensureMember(firebaseServices.db, user)
				.then(function (member) {
					notifyAuthState(user, member);
				})
				.catch(function () {
					notifyAuthState(user, null);
				});
		});
		return true;
	}

	function onAuthStateChanged(fn) {
		if (typeof fn === 'function') {
			authStateListeners.push(fn);
		}
	}

	function signInWithGoogle() {
		if (!firebaseServices) {
			return Promise.reject(new Error('Firebase not configured'));
		}
		var provider = new global.firebase.auth.GoogleAuthProvider();
		provider.setCustomParameters({ prompt: 'select_account' });
		return firebaseServices.auth.signInWithPopup(provider).catch(function (err) {
			if (err && err.code === 'auth/popup-blocked') {
				return firebaseServices.auth.signInWithRedirect(provider);
			}
			return Promise.reject(err);
		});
	}

	function signOut() {
		if (!firebaseServices) {
			return Promise.resolve();
		}
		return firebaseServices.auth.signOut();
	}

	function getAuth() {
		return firebaseServices ? firebaseServices.auth : null;
	}

	function getDb() {
		return firebaseServices ? firebaseServices.db : null;
	}

	function getCurrentUser() {
		return firebaseServices && firebaseServices.auth.currentUser;
	}

	function refreshMember() {
		var user = getCurrentUser();
		if (!user || !firebaseServices) {
			return Promise.resolve(null);
		}
		memberCache = { uid: null, data: null };
		return ensureMember(firebaseServices.db, user);
	}

	function whenAuthReady() {
		init();
		if (!firebaseServices) {
			return Promise.resolve({ user: null, member: null });
		}
		return new Promise(function (resolve) {
			var unsub = firebaseServices.auth.onAuthStateChanged(function (user) {
				unsub();
				if (!user) {
					resolve({ user: null, member: null });
					return;
				}
				ensureMember(firebaseServices.db, user).then(function (member) {
					resolve({ user: user, member: member });
				}).catch(function () {
					resolve({ user: user, member: null });
				});
			});
		});
	}

	function collapseMobileNav() {
		var navEl = document.getElementById('navbarNavDropdown');
		if (!navEl) return;

		if (global.jQuery && typeof global.jQuery.fn.collapse === 'function') {
			global.jQuery(navEl).collapse('hide');
		} else {
			navEl.classList.remove('show');
		}

		var toggler = document.querySelector('.navbar-toggler');
		if (toggler) {
			toggler.classList.add('collapsed');
			toggler.setAttribute('aria-expanded', 'false');
		}
	}

	global.AndarilhosAuth = {
		init: init,
		isConfigured: function () {
			return isConfigured(getConfig());
		},
		onAuthStateChanged: onAuthStateChanged,
		signInWithGoogle: signInWithGoogle,
		signOut: signOut,
		getAuth: getAuth,
		getDb: getDb,
		getCurrentUser: getCurrentUser,
		whenAuthReady: whenAuthReady,
		refreshMember: refreshMember,
		hasPermission: hasPermission,
		isAdmin: isAdmin,
		collapseMobileNav: collapseMobileNav,
		getCachedMember: function () {
			return memberCache.data;
		}
	};
})(window);
