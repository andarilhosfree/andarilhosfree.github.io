(function () {
    var button = document.querySelector('.btn-fly');
    var listContainer = document.querySelector('.other-job-list');
    var csvPath = 'ANDARILHOS FREE ACCOUNT - Página1.csv';
    var initialVisibleCount = 6;
    var allRows = [];
    var isExpanded = false;

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

    function renderByState() {
        var visibleRows = isExpanded ? allRows : allRows.slice(0, initialVisibleCount);
        renderAllCharacters(visibleRows);
        button.textContent = isExpanded ? 'Mostrar menos' : 'Todos os personagens';
        button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
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

        if (!allRows.length) {
            return;
        }

        isExpanded = !isExpanded;
        renderByState();
    });

    loadCharactersFromCsv().catch(function (error) {
        console.error(error);
        button.textContent = 'Erro ao carregar personagens';
        button.disabled = true;
    });
})();
