(function (global) {
	'use strict';

	var IMGBB_API_KEY = global.ANDARILHOS_IMGBB_API_KEY || '';
	var FETCH_TIMEOUT_MS = 12000;

	function fetchWithTimeout(url, options, timeoutMs) {
		return new Promise(function (resolve, reject) {
			var timer = window.setTimeout(function () {
				reject(new Error('Tempo esgotado no upload.'));
			}, timeoutMs || FETCH_TIMEOUT_MS);

			global.fetch(url, options)
				.then(function (response) {
					window.clearTimeout(timer);
					resolve(response);
				})
				.catch(function (error) {
					window.clearTimeout(timer);
					reject(error);
				});
		});
	}

	function parseJsonResponse(response) {
		return response.text().then(function (text) {
			if (!text) return {};
			try {
				return JSON.parse(text);
			} catch (e) {
				throw new Error('Resposta inválida do servidor de upload.');
			}
		});
	}

	function uploadImage(imageFile) {
		if (!imageFile) {
			return Promise.reject(new Error('Selecione uma imagem.'));
		}
		if (!imageFile.type || imageFile.type.indexOf('image/') !== 0) {
			return Promise.reject(new Error('Selecione um arquivo de imagem (PNG, JPG, etc.).'));
		}
		if (imageFile.size > 8 * 1024 * 1024) {
			return Promise.reject(new Error('A imagem deve ter no máximo 8 MB.'));
		}
		if (!IMGBB_API_KEY) {
			return Promise.reject(new Error('Upload de imagem não configurado.'));
		}

		var formData = new FormData();
		formData.append('key', IMGBB_API_KEY);
		formData.append('image', imageFile);

		return fetchWithTimeout('https://api.imgbb.com/1/upload', {
			method: 'POST',
			body: formData
		}, FETCH_TIMEOUT_MS)
			.then(function (response) {
				if (!response.ok) {
					throw new Error('Falha no upload da imagem.');
				}
				return parseJsonResponse(response);
			})
			.then(function (data) {
				if (data && data.success && data.data && data.data.url) {
					return data.data.url;
				}
				var message = (data && data.error && data.error.message)
					? data.error.message
					: 'Erro desconhecido';
				throw new Error('Falha no upload: ' + message);
			});
	}

	global.ImgbbUpload = {
		uploadImage: uploadImage
	};
})(window);
