# Mapa (AndarilhosFree) — manutenção e extensão

Este site usa um visualizador de mapa do Tibia em [map.html](../map.html) com **assets locais** (vendored) para funcionar 100% via GitHub Pages.

## Onde estão os arquivos

- Imagens do mapa (16 andares): `images/tibia-map/floor-00-map.png` … `images/tibia-map/floor-15-map.png`
- Bounds e dados auxiliares:
  - `map-data/tibia-map/bounds.json`
  - `map-data/tibia-map/markers.json` (não usado no MVP, mas já está versionado)
- Dados de criaturas (para exibir GIFs no mapa):
  - `map-data/tibia-map/creature-spawns.json` (índice compacto `criatura -> pontos`)
  - `images/monster_images/*.gif` (ícones GIF das criaturas)
- Licença do repositório de origem dos assets:
  - `licenses/tibia-map-data-LICENSE-MIT.txt`

## Como funciona (visão geral)

- O viewer roda em `js/tibia-map-viewer.js` e usa **Leaflet** com `L.CRS.Simple`.
- Cada andar (z-level) é um `L.imageOverlay()` que troca quando você usa o controle de andar (▲ / nível / ▼) dentro do mapa.

### Sistema de coordenadas

O mapa do Tibia (world coords) é convertido para coordenadas Leaflet (`CRS.Simple`) usando `bounds.json`.

O `L.imageOverlay` usa bounds `[[0, 0], [height, width]]`, então `lat = 0` fica na **base** da PNG e `lat = height` no **topo**. Como o Y do Tibia cresce para o sul (para baixo na imagem), o eixo Y é invertido:

- `pixelX = worldX - xMin` → `lng`
- `pixelY = height - (worldY - yMin)` → `lat`
- `worldX = pixelX + xMin`
- `worldY = yMin + (height - pixelY)`

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

Ferramenta de manutenção (não usada em runtime):

- Rodar: `bash scripts/update-tibia-map-assets.sh`

Isso baixa `bounds.json`, `markers.json` e os 16 PNGs diretamente do GitHub Pages do `tibia-map-data` e sobrescreve os arquivos locais.

## Atualizando criaturas (spawns + GIFs)

Ferramentas de manutenção (não usadas em runtime no GitHub Pages):

Fonte: checkout local de [tibia-map-spawn](https://github.com/akurielgamer/tibia-map-spawn) (por padrão `../tibia-map-spawn` ao lado deste repo).

1. Copiar/atualizar GIFs e regenerar o índice:

```bash
rsync -a --delete ../tibia-map-spawn/images/monster_images/ images/monster_images/
python3 scripts/build-creature-spawns.py
```

2. Manter no repo **apenas** os GIFs referenciados por `creature-spawns.json` (o script só indexa criaturas que têm GIF; GIFs órfãos não entram no índice e não precisam ser versionados).

O script lê `map-spawn-v2.json`, usa `centerz` como andar (igual ao viewer original), filtra pontos dentro de `bounds.json` e só inclui criaturas que tenham `images/monster_images/<nome>.gif`.

## Clusters e navegação por densidade

No mapa (`map.html`):

- **Clusters por zoom** (célula em tiles do mundo):
  - zoom ≤ `-1` → célula 192 (stacks grandes, ~36x nas áreas densas)
  - zoom `0` → célula 96
  - zoom `1` → célula 32
  - zoom `2` (máx.) → célula 1 (um marker por spawn)
- Stacks com `count > 1` mostram o GIF + badge laranja com a quantidade.
- Ao selecionar uma criatura, o viewer calcula stacks em **todos os andares** (célula fixa 192), ordena por densidade e salta para a área `#1` (muda o `z` se preciso).
- O navegador `< Nome #i/N • Cx • z=Z >` cicla as demais áreas densas.

## Próximos incrementos (sugestões)

- Camada de markers (POI, etc.) usando `map-data/tibia-map/markers.json`.
- Otimizações para muitos pontos: renderer Canvas + filtro por viewport/zoom.
- Compatibilidade opcional com links de outros viewers (se precisar).
