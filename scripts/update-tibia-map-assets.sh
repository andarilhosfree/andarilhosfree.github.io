#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${ROOT_DIR}/map-data/tibia-map"
IMG_DIR="${ROOT_DIR}/images/tibia-map"

BASE_URL="https://tibiamaps.github.io/tibia-map-data"

mkdir -p "${DATA_DIR}" "${IMG_DIR}"

curl -fsSL "${BASE_URL}/bounds.json" -o "${DATA_DIR}/bounds.json"
curl -fsSL "${BASE_URL}/markers.json" -o "${DATA_DIR}/markers.json"

for z in $(seq -w 0 15); do
	curl -fsSL "${BASE_URL}/floor-${z}-map.png" -o "${IMG_DIR}/floor-${z}-map.png"
done

echo "Updated Tibia map assets:"
echo "- ${DATA_DIR}/bounds.json"
echo "- ${DATA_DIR}/markers.json"
echo "- ${IMG_DIR}/floor-00-map.png ... floor-15-map.png"
