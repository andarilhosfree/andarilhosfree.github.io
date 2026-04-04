(function () {
    var button = document.querySelector('.btn-fly');
    var listContainer = document.querySelector('.other-job-list');
    var charactersSection = listContainer ? listContainer.closest('.section-full') : null;
    var filterTabs = charactersSection ? charactersSection.querySelector('.job-search-tabs') : null;
    var filterForm = filterTabs ? filterTabs.querySelector('form') : null;
    var nameInput = filterForm ? filterForm.querySelector('input[placeholder="Nome do personagem"]') : null;
    var vocationSelect = filterForm ? filterForm.querySelector('select[title="Vocação"]') : null;
    var worldInput = filterForm ? filterForm.querySelector('input[placeholder="Mundo"]') : null;
    var searchButton = filterForm ? filterForm.querySelector('button.site-button.btn-block') : null;
    var charactersApiUrl = 'https://script.google.com/macros/s/AKfycbyhDUdN2CYmLAeFkzadd1Be3n8jCZEg8HN1LeEqodVVzHO8Y5df014aYpopMO-_oKeT/exec';
    var uploadApiUrl = charactersApiUrl;
    var spriteUpdateWebAppUrl = 'https://script.google.com/macros/s/AKfycbx1JeyObkZwAOw-eFksB90Xky4B09BGtj8MlOKdK04ZE0CV76X57-dpBZgezZtKVDgz/exec';
    var imgbbApiKey = '4bcd2691cf719e87b29a5d28e7077918';
    var fetchTimeoutMs = 12000;
    var csvPath = 'ANDARILHOS FREE ACCOUNT - Página1.csv';
    var initialVisibleCount = 6;
    var allRows = [];
    var isExpanded = false;
    var debounceTimer = null;
    var requiredColumns = ['NOME', 'VOCAÇÃO', 'MUNDO', 'LEVEL', 'Cidade', 'SPRITE'];
    var columnAliases = {
        NOME: 'NOME',
        VOCACAO: 'VOCAÇÃO',
        MUNDO: 'MUNDO',
        LEVEL: 'LEVEL',
        CIDADE: 'Cidade',
        SPRITE: 'SPRITE',
        LASTLOGIN: 'LAST LOGIN'
    };
    var filterState = {
        name: '',
        vocation: '',
        world: ''
    };
    var clearFilterButton = null;
    var lastUpdateTargets = Array.prototype.slice.call(document.querySelectorAll('.js-last-update-text'));
    var lastUpdateFieldName = 'LAST UPDATE';

    if (!button || !listContainer) {
        return;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function parseCsvLine(line) {
        var result = [];
        var current = '';
        var inQuotes = false;

        for (var i = 0; i < line.length; i++) {
            var char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current);
        return result;
    }

    function normalizeValue(value) {
        var normalized = (value || '').trim();
        return normalized ? normalized : '-';
    }

    function normalizeText(value) {
        return String(value || '').trim().toLowerCase();
    }

    function normalizeComparableKey(value) {
        return normalizeHeaderKey(value).replace(/[^A-Z0-9]/g, '');
    }

    function getCharacterFieldValue(character, fieldName) {
        var normalizedFieldName = normalizeComparableKey(fieldName);
        var keys = Object.keys(character || {});

        for (var i = 0; i < keys.length; i++) {
            if (normalizeComparableKey(keys[i]) === normalizedFieldName) {
                return String(character[keys[i]] || '').trim();
            }
        }

        return '';
    }

    function getLastUpdateRawFromRows(rows) {
        if (!rows || !rows.length) {
            return '';
        }

        for (var i = 0; i < rows.length; i++) {
            var candidate = getCharacterFieldValue(rows[i], lastUpdateFieldName);
            if (String(candidate || '').trim()) {
                return candidate;
            }
        }

        return '';
    }

    function pad2(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function toDisplayDate(datePart) {
        var parts = datePart.split(/[-/]/);

        if (parts.length === 3 && parts[0].length === 4) {
            // yyyy-mm-dd -> dd/mm/yyyy
            return parts[2] + '/' + parts[1] + '/' + parts[0];
        }

        return datePart;
    }

    function formatLastUpdateText(rawValue) {
        var value = String(rawValue || '').trim();

        if (!value) {
            return '';
        }

        var parsedDate = new Date(value);
        if (!isNaN(parsedDate.getTime())) {
            var day = pad2(parsedDate.getDate());
            var month = pad2(parsedDate.getMonth() + 1);
            var year = parsedDate.getFullYear();
            var hours = pad2(parsedDate.getHours());
            var minutes = pad2(parsedDate.getMinutes());
            var seconds = pad2(parsedDate.getSeconds());

            return 'Última Atualização - ' + day + '/' + month + '/' + year + ' às ' + hours + ':' + minutes + ':' + seconds;
        }

        var normalizedValue = value.replace('T', ' ').replace('Z', '');
        var parts = normalizedValue.split(/\s+/);
        var datePart = parts[0] || '';
        var timePart = parts[1] || '';

        if (datePart && timePart) {
            return 'Última Atualização - ' + toDisplayDate(datePart) + ' às ' + timePart;
        }

        return 'Última Atualização - ' + value;
    }

    function formatLastLogin(rawValue) {
        var value = String(rawValue || '').trim();

        if (!value) {
            return '';
        }

        var parsedDate = new Date(value);
        if (!isNaN(parsedDate.getTime())) {
            var day = pad2(parsedDate.getDate());
            var month = pad2(parsedDate.getMonth() + 1);
            var year = parsedDate.getFullYear();
            var hours = pad2(parsedDate.getHours());
            var minutes = pad2(parsedDate.getMinutes());

            return 'Último Login - ' + day + '/' + month + '/' + year + ' - ' + hours + ':' + minutes;
        }

        var normalizedValue = value.replace('T', ' ').replace('Z', '');
        var parts = normalizedValue.split(/\s+/);
        var datePart = parts[0] || '';
        var timePart = parts[1] || '';

        if (datePart && timePart) {
            return 'Último Login - ' + toDisplayDate(datePart) + ' - ' + timePart;
        }

        return 'Último Login - ' + value;
    }

    function setLastUpdateText(rows, fallbackRawValue) {
        if (!lastUpdateTargets.length) {
            return false;
        }

        var rawValue = getLastUpdateRawFromRows(rows) || String(fallbackRawValue || '').trim();
        var formatted = formatLastUpdateText(rawValue);

        if (!formatted) {
            return false;
        }

        lastUpdateTargets.forEach(function (element) {
            element.textContent = formatted;
        });
        return true;
    }

    function hasSingleWordVocation(rawVocation) {
        var words = String(rawVocation || '')
            .trim()
            .split(/\s+/)
            .filter(function (word) {
                return word !== '';
            });

        return words.length === 1;
    }

    function shouldShowFreeSeal(character) {
        var alwaysFreeValue = normalizeText(getCharacterFieldValue(character, 'SEMPRE FOI FREE?'));
        var isSingleWord = hasSingleWordVocation(character['VOCAÇÃO']);

        if (!isSingleWord) {
            return false;
        }

        if (!alwaysFreeValue) {
            return true;
        }

        if (alwaysFreeValue.indexOf('sim') === 0) {
            return true;
        }

        if (alwaysFreeValue.charAt(0) === 'n' || alwaysFreeValue.indexOf('nao') === 0 || alwaysFreeValue.indexOf('não') === 0) {
            return false;
        }

        return false;
    }

    function fetchWithTimeout(url, options, timeoutMs) {
        var requestTimeout = timeoutMs || fetchTimeoutMs;

        if (typeof AbortController === 'function') {
            var controller = new AbortController();
            var timerId = window.setTimeout(function () {
                controller.abort();
            }, requestTimeout);

            var fetchOptions = Object.assign({}, options || {}, {
                signal: controller.signal
            });

            return fetch(url, fetchOptions)
                .then(function (response) {
                    window.clearTimeout(timerId);
                    return response;
                })
                .catch(function (error) {
                    window.clearTimeout(timerId);
                    throw error;
                });
        }

        return new Promise(function (resolve, reject) {
            var finished = false;
            var timer = window.setTimeout(function () {
                if (finished) {
                    return;
                }

                finished = true;
                reject(new Error('Tempo limite ao carregar dados.'));
            }, requestTimeout);

            fetch(url, options || {})
                .then(function (response) {
                    if (finished) {
                        return;
                    }

                    finished = true;
                    window.clearTimeout(timer);
                    resolve(response);
                })
                .catch(function (error) {
                    if (finished) {
                        return;
                    }

                    finished = true;
                    window.clearTimeout(timer);
                    reject(error);
                });
        });
    }

    function parseJsonResponse(response) {
        return response.text().then(function (text) {
            if (!text) {
                return {};
            }

            try {
                return JSON.parse(text);
            } catch (error) {
                throw new Error('Resposta inválida do servidor.');
            }
        });
    }

    function uploadToImgBB(imageFile) {
        if (!imgbbApiKey) {
            return Promise.reject(new Error('ImgBB API key não configurada.'));
        }

        var formData = new FormData();
        formData.append('key', imgbbApiKey);
        formData.append('image', imageFile);

        return fetchWithTimeout('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        }, fetchTimeoutMs)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Falha no upload para o ImgBB');
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
                throw new Error('Falha no upload para o ImgBB: ' + message);
            });
    }

    function submitSpriteUrlViaTransport(characterName, spriteUrl) {
        return new Promise(function (resolve, reject) {
            if (!spriteUpdateWebAppUrl) {
                reject(new Error('URL do Apps Script (spriteUpdateWebAppUrl) não configurada.'));
                return;
            }

            var form = document.getElementById('sprite-upload-transport-form');
            var nomeInput = document.getElementById('sprite-upload-transport-nome');
            var spriteUrlInput = document.getElementById('sprite-upload-transport-spriteUrl');
            var frame = document.getElementById('sprite-upload-transport-frame');

            if (!form || !nomeInput || !spriteUrlInput || !frame) {
                reject(new Error('Transporte de upload não encontrado na página (form/iframe ocultos).'));
                return;
            }

            form.action = spriteUpdateWebAppUrl;
            nomeInput.value = String(characterName || '').trim();
            spriteUrlInput.value = String(spriteUrl || '').trim();

            try {
                form.submit();
            } catch (error) {
                reject(new Error('Erro ao enviar para a planilha: ' + (error && error.message ? error.message : String(error))));
                return;
            } finally {
                spriteUrlInput.value = '';
            }

            resolve({ success: true });
        });
    }

    function uploadCharacterSprite(characterName, imageFile) {
        return new Promise(function (resolve, reject) {
            if (!characterName || !imageFile) {
                reject(new Error('Nome do personagem e imagem são obrigatórios'));
                return;
            }

            if (!imageFile.type || imageFile.type.indexOf('image/') !== 0) {
                reject(new Error('Por favor, selecione um arquivo de imagem (PNG, JPG, etc.)'));
                return;
            }

            if (imageFile.size > 32 * 1024 * 1024) {
                reject(new Error('A imagem deve ter no máximo 32MB. Por favor, comprima ou use uma imagem menor.'));
                return;
            }

            uploadToImgBB(imageFile)
                .then(function (imageUrl) {
                    return submitSpriteUrlViaTransport(characterName, imageUrl)
                        .then(function () {
                            return imageUrl;
                        });
                })
                .then(function (imageUrl) {
                    resolve({ success: true, imageUrl: imageUrl });
                })
                .catch(function (error) {
                    reject(new Error((error && error.message) ? error.message : String(error)));
                });
        });
    }

    function normalizeHeaderKey(header) {
        return String(header || '')
            .trim()
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function normalizeCharacterRows(rows) {
        return rows
            .map(function (row) {
                var normalizedRow = {};

                Object.keys(row || {}).forEach(function (key) {
                    var canonicalKey = columnAliases[normalizeHeaderKey(key)] || key;
                    var value = String(row[key] || '').trim();
                    var currentValue = String(normalizedRow[canonicalKey] || '').trim();

                    if (!currentValue || value) {
                        normalizedRow[canonicalKey] = value;
                    }
                });

                return normalizedRow;
            })
            .filter(function (row) {
                return String(row.NOME || '').trim() !== '';
            });
    }

    function warnMissingColumns(rows, sourceName) {
        var missingColumns = requiredColumns.filter(function (column) {
            return !rows.some(function (row) {
                return String(row[column] || '').trim() !== '';
            });
        });

        if (missingColumns.length) {
            console.warn('Colunas ausentes em ' + sourceName + ':', missingColumns.join(', '));
        }
    }

    function getCharacterSpriteSrc(rawSprite) {
        var sprite = String(rawSprite || '').trim();

        if (!sprite) {
            return 'images/logo/logo.jpeg';
        }

        return sprite;
    }

    function getVocationBadge(rawVocation) {
        var vocation = (rawVocation || '').trim();

        if (!vocation) {
            return '';
        }

        var normalizedVocation = normalizeText(vocation);
        var vocationClass = '';

        if (normalizedVocation.indexOf('knight') !== -1) {
            vocationClass = 'vocation-knight';
        } else if (normalizedVocation.indexOf('paladin') !== -1) {
            vocationClass = 'vocation-paladin';
        } else if (normalizedVocation.indexOf('sorcerer') !== -1) {
            vocationClass = 'vocation-sorcerer';
        } else if (normalizedVocation.indexOf('druid') !== -1) {
            vocationClass = 'vocation-druid';
        } else if (normalizedVocation.indexOf('monk') !== -1) {
            vocationClass = 'vocation-monk';
        }

        if (!vocationClass) {
            return '';
        }

        return '<span class="site-button radius-xl button-sm ' + vocationClass + '">' + escapeHtml(vocation) + '</span>';
    }

    var didInjectCharacterCardStyles = false;

    function ensureCharacterCardStyles() {
        if (didInjectCharacterCardStyles) {
            return;
        }

        var style = document.createElement('style');
        style.id = 'character-card-mobile-style';
        style.textContent = [
            '.job-box-list .character-last-login {',
            '  display: block;',
            '  text-align: center;',
            '  font-size: 12px;',
            '  margin-top: 6px;',
            '  color: #555;',
            '}',
            '@media (max-width: 767.98px) {',
            '  .job-box-list .title-head {',
            '    display: block;',
            '  }',
            '  .job-box-list .character-card-name {',
            '    font-size: 20px;',
            '    padding-right: 50px;',
            '    display: block !important;',
            '    line-height: 1.2;',
            '  }',
            '  .job-box-list .character-card-badge {',
            '    display: block !important;',
            '    margin-top: 6px;',
            '    width: 100%;',
            '  }',
            '}',
            '.job-box-list .character-image-wrapper {',
            '  display: inline-block;',
            '}',
            '.job-box-list .character-image-stage {',
            '  position: relative;',
            '  display: inline-block;',
            '}',
            '.job-box-list .character-image-edit {',
            '  position: absolute;',
            '  top: 6px;',
            '  right: 6px;',
            '  z-index: 3;',
            '  width: 32px;',
            '  height: 32px;',
            '  min-width: 0;',
            '  padding: 0;',
            '  display: none;',
            '  align-items: center;',
            '  justify-content: center;',
            '  border-radius: 4px;',
            '}',
            '.job-box-list .character-image-edit i {',
            '  font-size: 20px;',
            '  line-height: 1;',
            '}',
            '.job-box-list .character-image-wrapper.is-edit-visible .character-image-edit {',
            '  display: inline-flex;',
            '}',
            '.job-box-list .character-image-pressarea {',
            '  position: absolute;',
            '  top: 0;',
            '  left: 0;',
            '  right: 0;',
            '  bottom: 0;',
            '  z-index: 1;',
            '  background: transparent;',
            '  -webkit-touch-callout: none;',
            '  -webkit-user-select: none;',
            '  user-select: none;',
            '  touch-action: none;',
            '  pointer-events: auto;',
            '  -webkit-tap-highlight-color: transparent;',
            '}',
            '.job-box-list .character-sprite-img {',
            '  -webkit-user-drag: none;',
            '  -webkit-user-select: none;',
            '  user-select: none;',
            '  -webkit-touch-callout: none;',
            '  pointer-events: none;',
            '}',
            ''
        ].join('\n');

        document.head.appendChild(style);
        didInjectCharacterCardStyles = true;
    }

    function buildJobCard(character) {
        ensureCharacterCardStyles();

        var rawName = (character.NOME || '').trim();
        var tibiaProfileUrl = 'https://www.tibia.com/community/?name=' + encodeURIComponent(rawName).replace(/%20/g, '+');
        var characterNameAttribute = escapeHtml(rawName);
        var nome = escapeHtml(normalizeValue(character.NOME));
        var vocationBadge = getVocationBadge(character['VOCAÇÃO']);
        var mundo = escapeHtml(normalizeValue(character.MUNDO));
        var level = escapeHtml(normalizeValue(character.LEVEL));
        var cidade = escapeHtml(normalizeValue(character.Cidade));
        var spriteSrc = escapeHtml(getCharacterSpriteSrc(character.SPRITE));
        var lastLogin = formatLastLogin(getCharacterFieldValue(character, 'LAST LOGIN'));
        var showFreeSeal = shouldShowFreeSeal(character);
        var freeSealDesktopMarkup = showFreeSeal
            ? '<a href="#seal-disclaimer" class="d-none d-md-inline-block" aria-label="Ir para disclaimer do selo"><img src="images/freeseal.png" alt="Selo Free Account" style="width:200px;max-width:200px;max-height:140px;height:140px;margin-right:10px;"></a>'
            : '';
        var freeSealMobileMarkup = showFreeSeal
            ? '<a href="#seal-disclaimer" class="d-inline-block d-md-none" aria-label="Ir para disclaimer do selo" style="position:absolute;top:0;left:-50px;top:-10px;z-index:2;"><img src="images/freeseal.png" alt="Selo Free Account" style="width:120px;max-width:120px;height:auto;display:block;"></a>'
            : '';

        return '' +
            '<div class="job-box-list">' +
            '<div class="job-info-box" style="padding-right:10px;">' +
            '<h3 class="m-t0 font-weight-600 title-head">' +
            '<a href="' + tibiaProfileUrl + '" class="text-secondry character-card-name" target="_blank" rel="noopener noreferrer">' + nome + '</a>' +
            (vocationBadge ? '<div class="character-card-badge">' + vocationBadge + '</div>' : '') +
            '</h3>' +
            '<ul class="job-info">' +
            '<li><strong>Mundo: </strong> ' + mundo + '</li>' +
            '<li><strong>Level:</strong> ' + level + '</li>' +
            '<li><i class="ti-location-pin text-black m-r10"></i> ' + cidade + ' </li>' +
            '</ul>' +
            '</div>' +
            '<div class="job-company-logo" style="display:flex;align-items:center;justify-content:flex-end;">' +
            freeSealDesktopMarkup +
            '<div class="character-image-wrapper js-character-image-wrapper" data-character-name="' + characterNameAttribute + '">' +
            '<div class="character-image-stage">' +
            '<button type="button" class="site-button button-sm character-image-edit js-character-image-edit" aria-label="Editar imagem" title="Editar imagem">' +
            '<i class="ti-pencil"></i>' +
            '</button>' +
            '<input type="file" class="js-character-image-input" accept="image/*" style="display:none;">' +
            '<span class="character-image-pressarea js-character-image-pressarea" aria-hidden="true"></span>' +
            '<img src="' + spriteSrc + '" alt="" class="character-sprite-img js-character-sprite" style="max-width:150px;max-height:150px;width:auto;height:auto;display:block;" draggable="false">' +
            freeSealMobileMarkup +
            '</div>' +
            (lastLogin ? '<span class="character-last-login">' + escapeHtml(lastLogin) + '</span>' : '') +
            '</div>' +
            '</div>' +
            '</div>';
    }

    var characterImageHoldDurationMs = 10000;

    function bindCharacterImageUploadUi() {
        var wrappers = listContainer.querySelectorAll('.js-character-image-wrapper');

        Array.prototype.forEach.call(wrappers, function (wrapper) {
            var pressArea = wrapper.querySelector('.js-character-image-pressarea');
            var editButton = wrapper.querySelector('.js-character-image-edit');
            var fileInput = wrapper.querySelector('.js-character-image-input');
            var spriteImg = wrapper.querySelector('.js-character-sprite');
            var pressTarget = pressArea || wrapper;
            var characterName = String(wrapper.getAttribute('data-character-name') || '').trim();

            if (!pressTarget || !editButton || !fileInput) {
                return;
            }

            var holdTimerId = null;

            function clearHoldTimer() {
                if (holdTimerId === null) {
                    return;
                }

                window.clearTimeout(holdTimerId);
                holdTimerId = null;
            }

            function startHoldTimer(event) {
                if (wrapper.classList.contains('is-edit-visible')) {
                    return;
                }

                if (event && event.pointerType === 'mouse' && typeof event.button === 'number' && event.button !== 0) {
                    return;
                }

                if (event && event.cancelable && (event.pointerType === 'touch' || event.type === 'touchstart')) {
                    event.preventDefault();
                }

                clearHoldTimer();
                holdTimerId = window.setTimeout(function () {
                    if (!wrapper.isConnected) {
                        return;
                    }

                    wrapper.classList.add('is-edit-visible');
                }, characterImageHoldDurationMs);
            }

            function cancelHoldTimer() {
                clearHoldTimer();
            }

            function preventIosDefault(event) {
                if (event && event.cancelable) {
                    event.preventDefault();
                }
            }

            if (typeof window.PointerEvent !== 'undefined') {
                pressTarget.addEventListener('pointerdown', startHoldTimer);
                pressTarget.addEventListener('pointerup', cancelHoldTimer);
                pressTarget.addEventListener('pointerleave', cancelHoldTimer);
                pressTarget.addEventListener('pointercancel', cancelHoldTimer);
            } else {
                pressTarget.addEventListener('mousedown', startHoldTimer);
                pressTarget.addEventListener('mouseup', cancelHoldTimer);
                pressTarget.addEventListener('mouseleave', cancelHoldTimer);
                pressTarget.addEventListener('touchstart', startHoldTimer);
                pressTarget.addEventListener('touchend', cancelHoldTimer);
                pressTarget.addEventListener('touchcancel', cancelHoldTimer);
            }

            // iOS Safari: prevent native image preview/callout/zoom on long press.
            pressTarget.addEventListener('touchstart', preventIosDefault, { passive: false });
            pressTarget.addEventListener('touchend', preventIosDefault, { passive: false });
            pressTarget.addEventListener('touchcancel', preventIosDefault, { passive: false });
            pressTarget.addEventListener('gesturestart', preventIosDefault, { passive: false });
            pressTarget.addEventListener('gesturechange', preventIosDefault, { passive: false });
            pressTarget.addEventListener('gestureend', preventIosDefault, { passive: false });

            pressTarget.addEventListener('contextmenu', function (event) {
                event.preventDefault();
            });

            pressTarget.addEventListener('dragstart', function (event) {
                event.preventDefault();
            });

            editButton.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                fileInput.click();
            });

            fileInput.addEventListener('change', function () {
                var file = fileInput.files && fileInput.files[0];
                fileInput.value = '';

                if (!file) {
                    return;
                }

                if (!file.type || file.type.indexOf('image/') !== 0) {
                    window.alert('Por favor, selecione um arquivo de imagem válido.');
                    return;
                }

                if (file.size > 32 * 1024 * 1024) {
                    window.alert('A imagem deve ter no máximo 32MB. Por favor, comprima ou use uma imagem menor.');
                    return;
                }

                if (!characterName) {
                    window.alert('Não foi possível identificar o nome do personagem.');
                    return;
                }

                if (spriteImg) {
                    spriteImg.style.opacity = '0.5';
                }

                uploadCharacterSprite(characterName, file)
                    .then(function (result) {
                        if (spriteImg && result && result.imageUrl) {
                            spriteImg.src = result.imageUrl + '?t=' + Date.now();
                        }

                        if (spriteImg) {
                            spriteImg.style.opacity = '1';
                        }

                        wrapper.classList.remove('is-edit-visible');
                        window.alert('Sprite enviado para atualização! (A confirmação pode demorar alguns segundos)');
                    })
                    .catch(function (error) {
                        if (spriteImg) {
                            spriteImg.style.opacity = '1';
                        }
                        window.alert('Erro: ' + (error && error.message ? error.message : String(error)));
                    });
            });
        });
    }

    function csvToObjects(csvText) {
        var lines = csvText
            .replace(/^\uFEFF/, '')
            .split(/\r?\n/)
            .filter(function (line) {
                return line.trim() !== '';
            });

        if (!lines.length) {
            return [];
        }

        var headers = parseCsvLine(lines[0]).map(function (header) {
            return header.trim();
        });

        var rows = [];

        for (var i = 1; i < lines.length; i++) {
            var values = parseCsvLine(lines[i]);
            var item = {};

            for (var j = 0; j < headers.length; j++) {
                item[headers[j]] = (values[j] || '').trim();
            }

            rows.push(item);
        }

        return normalizeCharacterRows(rows);
    }

    function renderAllCharacters(rows) {
        var cards = rows.map(function (character) {
            return buildJobCard(character);
        });

        listContainer.innerHTML = cards.join('');
        bindCharacterImageUploadUi();
    }

    function getCurrentVocationValue() {
        if (!vocationSelect) {
            return '';
        }

        return normalizeText(vocationSelect.value);
    }

    function hasActiveFilters() {
        return !!(filterState.name || filterState.vocation || filterState.world);
    }

    function applyFilters(rows) {
        var filteredRows = rows.slice();

        if (filterState.name) {
            filteredRows = filteredRows.filter(function (character) {
                return normalizeText(character.NOME).indexOf(filterState.name) !== -1;
            });
        }

        if (filterState.world) {
            filteredRows = filteredRows.filter(function (character) {
                return normalizeText(character.MUNDO).indexOf(filterState.world) !== -1;
            });
        }

        if (filterState.vocation) {
            var vocationMatchRows = [];
            var withoutVocationRows = [];

            filteredRows.forEach(function (character) {
                var characterVocation = normalizeText(character['VOCAÇÃO']);

                if (!characterVocation) {
                    withoutVocationRows.push(character);
                    return;
                }

                if (characterVocation === filterState.vocation) {
                    vocationMatchRows.push(character);
                }
            });

            filteredRows = vocationMatchRows.concat(withoutVocationRows);
        }

        return filteredRows;
    }

    function updateActionButtonsVisibility() {
        var isFiltering = hasActiveFilters();

        button.style.display = isFiltering ? 'none' : '';

        if (clearFilterButton) {
            clearFilterButton.style.display = isFiltering ? 'block' : 'none';
        }
    }

    function renderFilteredState() {
        var filteredRows = applyFilters(allRows);
        renderAllCharacters(filteredRows);
        button.setAttribute('aria-expanded', 'false');
        updateActionButtonsVisibility();
    }

    function renderByState() {
        if (hasActiveFilters()) {
            renderFilteredState();
            return;
        }

        var visibleRows = isExpanded ? allRows : allRows.slice(0, initialVisibleCount);
        renderAllCharacters(visibleRows);
        button.textContent = isExpanded ? 'Mostrar menos' : 'Todos os personagens';
        button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        updateActionButtonsVisibility();
    }

    function setSelectPickerValue(selectElement, value) {
        if (!selectElement) {
            return;
        }

        var hasJQuery = typeof window.jQuery !== 'undefined';
        var hasSelectPicker = hasJQuery && typeof window.jQuery(selectElement).selectpicker === 'function';

        if (hasSelectPicker) {
            window.jQuery(selectElement).selectpicker('val', value);
            return;
        }

        selectElement.value = value;
    }

    function clearFilters() {
        filterState.name = '';
        filterState.vocation = '';
        filterState.world = '';
        isExpanded = false;

        if (nameInput) {
            nameInput.value = '';
        }

        if (worldInput) {
            worldInput.value = '';
        }

        setSelectPickerValue(vocationSelect, '');
        renderByState();
    }

    function createClearFilterButton() {
        if (!searchButton || clearFilterButton) {
            return;
        }

        clearFilterButton = document.createElement('button');
        clearFilterButton.type = 'button';
        clearFilterButton.className = 'site-button-secondry btn-block';
        clearFilterButton.textContent = 'LIMPAR FILTRO';
        clearFilterButton.style.marginTop = '10px';
        clearFilterButton.style.display = 'none';

        searchButton.insertAdjacentElement('afterend', clearFilterButton);

        clearFilterButton.addEventListener('click', function (event) {
            event.preventDefault();
            clearFilters();
        });
    }

    function bindFilterEvents() {
        if (!filterForm) {
            return;
        }

        if (nameInput) {
            nameInput.addEventListener('input', function () {
                window.clearTimeout(debounceTimer);
                debounceTimer = window.setTimeout(function () {
                    filterState.name = normalizeText(nameInput.value);
                    isExpanded = false;
                    renderByState();
                }, 2000);
            });
        }

        if (vocationSelect) {
            vocationSelect.addEventListener('change', function () {
                filterState.vocation = getCurrentVocationValue();
                isExpanded = false;
                renderByState();
            });

            if (typeof window.jQuery !== 'undefined') {
                window.jQuery(vocationSelect).on('changed.bs.select', function () {
                    filterState.vocation = getCurrentVocationValue();
                    isExpanded = false;
                    renderByState();
                });
            }
        }

        filterForm.addEventListener('submit', function (event) {
            event.preventDefault();

            filterState.world = worldInput ? normalizeText(worldInput.value) : '';
            if (nameInput) {
                filterState.name = normalizeText(nameInput.value);
            }
            filterState.vocation = getCurrentVocationValue();
            isExpanded = false;
            renderByState();
        });

        if (searchButton) {
            searchButton.addEventListener('click', function (event) {
                event.preventDefault();

                filterState.world = worldInput ? normalizeText(worldInput.value) : '';
                if (nameInput) {
                    filterState.name = normalizeText(nameInput.value);
                }
                filterState.vocation = getCurrentVocationValue();
                isExpanded = false;
                renderByState();
            });
        }
    }

    function fetchCharactersFromApi() {
        return fetchWithTimeout(charactersApiUrl, {}, fetchTimeoutMs)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Não foi possível carregar os dados da API.');
                }

                return response.json();
            })
            .then(function (data) {
                if (!Array.isArray(data)) {
                    throw new Error('Resposta inválida da API.');
                }

                var rows = normalizeCharacterRows(data);

                if (!rows.length) {
                    throw new Error('API sem personagens válidos.');
                }

                warnMissingColumns(rows, 'API');
                return rows;
            });
    }

    function fetchCharactersFromCsv() {
        return fetchWithTimeout(encodeURI(csvPath), {}, fetchTimeoutMs)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Não foi possível carregar o arquivo CSV.');
                }
                return response.text();
            })
            .then(function (csvText) {
                var rows = csvToObjects(csvText);

                if (!rows.length) {
                    throw new Error('CSV sem personagens válidos.');
                }

                warnMissingColumns(rows, 'CSV');
                return rows;
            });
    }

    function fetchLastUpdateFromCsv() {
        return fetchCharactersFromCsv()
            .then(function (rows) {
                return getLastUpdateRawFromRows(rows) || '';
            })
            .catch(function () {
                return '';
            });
    }

    function loadCharactersData() {
        var csvLastUpdatePromise = fetchLastUpdateFromCsv();

        // Set fallback as soon as CSV last update is known
        csvLastUpdatePromise.then(function (rawFallback) {
            if (rawFallback) {
                setLastUpdateText([], rawFallback);
            }
        });

        return fetchCharactersFromApi()
            .then(function (rows) {
                allRows = rows;
                isExpanded = false;
                var updatedFromApi = setLastUpdateText(rows);

                csvLastUpdatePromise.then(function (rawFallback) {
                    if (!updatedFromApi && rawFallback) {
                        setLastUpdateText([], rawFallback);
                    }
                });

                console.info('Personagens carregados via API:', rows.length);
                renderByState();
            })
            .catch(function (apiError) {
                console.warn('Falha na API. Usando CSV local.', apiError);

                return fetchCharactersFromCsv().then(function (rows) {
                    allRows = rows;
                    isExpanded = false;

                    csvLastUpdatePromise.then(function (rawFallback) {
                        if (!setLastUpdateText(rows) && rawFallback) {
                            setLastUpdateText([], rawFallback);
                        }
                    });

                    console.info('Personagens carregados via CSV fallback:', rows.length);
                    renderByState();
                });
            });
    }

    button.addEventListener('click', function (event) {
        event.preventDefault();

        if (!allRows.length || hasActiveFilters()) {
            return;
        }

        isExpanded = !isExpanded;
        renderByState();
    });

    createClearFilterButton();
    bindFilterEvents();

    loadCharactersData().catch(function (error) {
        console.error(error);
        button.textContent = 'Erro ao carregar personagens';
        button.disabled = true;
    });
})();
