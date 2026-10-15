# art/items: provenance of item icons

One `<id>.json` per new pixel item icon (`assets/icons-bundle/pixel/items/<id>.png`): `{ "tool", "prompt", "reference", "size", "seed", "seed_note"?, "date", "by" }`. Icons made before 2026-10-15 have no record (baseline in `tests/art-provenance.baseline.json`). Enforced by `tests/art-provenance.mjs`.
