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
        SPRITE: 'SPRITE'
    };
    var filterState = {
        name: '',
        vocation: '',
        world: ''
    };
    var clearFilterButton = null;

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

    function buildJobCard(character) {
        var rawName = (character.NOME || '').trim();
        var tibiaProfileUrl = 'https://www.tibia.com/community/?name=' + encodeURIComponent(rawName).replace(/%20/g, '+');
        var nome = escapeHtml(normalizeValue(character.NOME));
        var vocationBadge = getVocationBadge(character['VOCAÇÃO']);
        var mundo = escapeHtml(normalizeValue(character.MUNDO));
        var level = escapeHtml(normalizeValue(character.LEVEL));
        var cidade = escapeHtml(normalizeValue(character.Cidade));
        var spriteSrc = escapeHtml(getCharacterSpriteSrc(character.SPRITE));
        var showFreeSeal = shouldShowFreeSeal(character);
        var freeSealMarkup = showFreeSeal
            ? '<a href="#seal-disclaimer" aria-label="Ir para disclaimer do selo"><img src="images/freeseal.png" alt="Selo Free Account" style="width:200px;max-width:200px;max-height:140px;height:140px;margin-right:10px;"></a>'
            : '';

        return '' +
            '<div class="job-box-list">' +
            '<div class="job-info-box">' +
            '<h3 class="m-t0 font-weight-600 title-head">' +
            '<a href="' + tibiaProfileUrl + '" class="text-secondry" target="_blank" rel="noopener noreferrer">' + nome + '</a>' +
            vocationBadge +
            '</h3>' +
            '<ul class="job-info">' +
            '<li><strong>Mundo: </strong> ' + mundo + '</li>' +
            '<li><strong>Level:</strong> ' + level + '</li>' +
            '<li><i class="ti-location-pin text-black m-r10"></i> ' + cidade + ' </li>' +
            '</ul>' +
            '</div>' +
            '<div class="job-company-logo" style="display:flex;align-items:center;justify-content:flex-end;">' +
            freeSealMarkup +
            '<img src="' + spriteSrc + '" alt="" style="max-width:150px;max-height:150px;width:auto;height:auto;">' +
            '</div>' +
            '</div>';
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

    function loadCharactersData() {
        return fetchCharactersFromApi()
            .then(function (rows) {
                allRows = rows;
                isExpanded = false;
                console.info('Personagens carregados via API:', rows.length);
                renderByState();
            })
            .catch(function (apiError) {
                console.warn('Falha na API. Usando CSV local.', apiError);

                return fetchCharactersFromCsv().then(function (rows) {
                    allRows = rows;
                    isExpanded = false;
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
