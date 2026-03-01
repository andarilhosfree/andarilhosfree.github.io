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
    var csvPath = 'ANDARILHOS FREE ACCOUNT - Página1.csv';
    var initialVisibleCount = 6;
    var allRows = [];
    var isExpanded = false;
    var debounceTimer = null;
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

    function getVocationBadge(rawVocation) {
        var vocation = (rawVocation || '').trim();

        if (!vocation) {
            return '';
        }

        var firstLetter = vocation.charAt(0).toUpperCase();
        var classByLetter = {
            D: 'vocation-druid',
            M: 'vocation-monk',
            P: 'vocation-paladin',
            S: 'vocation-sorcerer',
            K: 'vocation-knight'
        };
        var vocationClass = classByLetter[firstLetter];

        if (!vocationClass) {
            return '';
        }

        return '<span class="site-button radius-xl button-sm ' + vocationClass + '">' + escapeHtml(vocation) + '</span>';
    }

    function buildJobCard(character) {
        var nome = escapeHtml(normalizeValue(character.NOME));
        var vocationBadge = getVocationBadge(character['VOCAÇÃO']);
        var mundo = escapeHtml(normalizeValue(character.MUNDO));
        var level = escapeHtml(normalizeValue(character.LEVEL));
        var cidade = escapeHtml(normalizeValue(character.Cidade));

        return '' +
            '<div class="job-box-list">' +
            '<div class="job-info-box">' +
            '<h3 class="m-t0 font-weight-600 title-head">' +
            '<a href="#" class="text-secondry">' + nome + '</a>' +
            vocationBadge +
            '</h3>' +
            '<ul class="job-info">' +
            '<li><strong>Mundo: </strong> ' + mundo + '</li>' +
            '<li><strong>Level:</strong> ' + level + '</li>' +
            '<li><i class="ti-location-pin text-black m-r10"></i> ' + cidade + ' </li>' +
            '</ul>' +
            '</div>' +
            '<div class="job-company-logo">' +
            '<img src="images/logo/logo.jpeg" alt="">' +
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

            if ((item.NOME || '').trim() !== '') {
                rows.push(item);
            }
        }

        return rows;
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

    function loadCharactersFromCsv() {
        return fetch(encodeURI(csvPath))
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Não foi possível carregar o arquivo CSV.');
                }
                return response.text();
            })
            .then(function (csvText) {
                allRows = csvToObjects(csvText);
                isExpanded = false;
                renderByState();
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

    loadCharactersFromCsv().catch(function (error) {
        console.error(error);
        button.textContent = 'Erro ao carregar personagens';
        button.disabled = true;
    });
})();
