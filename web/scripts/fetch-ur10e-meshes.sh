#!/usr/bin/env bash
# Fetch the BSD-licensed UR10e visual meshes referenced by public/urdf/ur10e/ur10e.urdf.
# These are the real Universal Robots CAD meshes from ros-industrial/universal_robot.
# Run once from web/ :  bash scripts/fetch-ur10e-meshes.sh
set -euo pipefail

DEST="public/urdf/ur10e/meshes/visual"
BASE="https://raw.githubusercontent.com/ros-industrial/universal_robot/melodic-devel/ur_description/meshes/ur10e/visual"

mkdir -p "$DEST"
for m in base shoulder upperarm forearm wrist1 wrist2 wrist3; do
  echo "→ $m.dae"
  curl -fsSL -o "$DEST/$m.dae" "$BASE/$m.dae"
done
echo "✓ UR10e visual meshes in $DEST"
echo "  (~10 MB. Optional: convert to a single .glb with gltf-transform to shrink first load.)"
