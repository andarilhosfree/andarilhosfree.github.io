# Mapa (AndarilhosFree) — manutenção e extensão

Este site usa um visualizador de mapa do Tibia em [map.html](../map.html) com **assets locais** (vendored) para funcionar 100% via GitHub Pages.

## Onde estão os arquivos

- Imagens do mapa (16 andares): `images/tibia-map/floor-00-map.png` … `images/tibia-map/floor-15-map.png`
- Bounds e dados auxiliares:
  - `map-data/tibia-map/bounds.json`
  - `map-data/tibia-map/markers.json` (não usado no MVP, mas já está versionado)
- Licença do repositório de origem dos assets:
  - `licenses/tibia-map-data-LICENSE-MIT.txt`

## Como funciona (visão geral)

- O viewer roda em `js/tibia-map-viewer.js` e usa **Leaflet** com `L.CRS.Simple`.
- Cada andar (z-level) é um `L.imageOverlay()` que troca quando você usa o controle de andar (▲ / nível / ▼) dentro do mapa.

### Sistema de coordenadas

O mapa do Tibia (world coords) é convertido para coordenadas de imagem (pixels) usando `bounds.json`:

- `pixelX = worldX - xMin`
- `pixelY = worldY - yMin`
- `worldX = pixelX + xMin`
- `worldY = pixelY + yMin`

No Leaflet (CRS.Simple), usamos:
- `lng = pixelX`
- `lat = pixelY`

## Deep links

Formato suportado no MVP:

- `map.html?point=<worldX>,<worldY>,<level>,<zoom>`

Exemplo:
- `map.html?point=32070,31165,0,0`

Regras:
- `worldX, worldY` são coordenadas do Tibia (inteiros).
- `level` é um nível **relativo ao chão (z=7)**:
  - `0` => `z=7` (chão)
  - `-1` => `z=8` (1 andar abaixo)
  - `+1` (ou `1`) => `z=6` (1 andar acima)
- `zoom` é o nível de zoom do Leaflet (inteiro). Se ausente, o viewer mantém o zoom atual.

Ao clicar no mapa, o viewer atualiza o parâmetro `point` na URL automaticamente.

## Atualizando os assets do mapa

Opção recomendada (automática):

- Rodar: `bash scripts/update-tibia-map-assets.sh`

Isso baixa `bounds.json`, `markers.json` e os 16 PNGs diretamente do GitHub Pages do `tibia-map-data` e sobrescreve os arquivos locais.

## Próximos incrementos (sugestões)

- Camada de markers (POI, etc.) usando `map-data/tibia-map/markers.json`.
- Otimizações para muitos pontos: renderer Canvas + filtro por viewport/zoom.
- Compatibilidade opcional com links de outros viewers (se precisar).
