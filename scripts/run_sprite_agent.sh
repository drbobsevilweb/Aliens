#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_GEN="$HOME/.codex/skills/imagegen/scripts/image_gen.py"
INPUT_JSONL="$ROOT_DIR/tmp/imagegen/sprite_prompts.jsonl"
OUT_DIR="$ROOT_DIR/output/imagegen"

mkdir -p "$OUT_DIR"

if [[ ! -f "$INPUT_JSONL" ]]; then
  echo "Missing batch file: $INPUT_JSONL" >&2
  exit 1
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is not set. Running dry-run only."
  exec python3 "$IMAGE_GEN" generate-batch --input "$INPUT_JSONL" --out-dir "$OUT_DIR" --dry-run
fi

echo "Running live sprite generation batch..."
exec python3 "$IMAGE_GEN" generate-batch --input "$INPUT_JSONL" --out-dir "$OUT_DIR" --concurrency 3
