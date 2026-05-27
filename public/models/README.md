# 3D model assets

## `batter.glb`

Static 3D batter rendered in the at-bat and pitcher-arsenal scenes.
Loaded by `src/components/scene/BatterSilhouette.tsx` (the `Batter`
wrapper). When this file is missing, the page falls back to the
flat-textured silhouette automatically — drop the GLB in here and the
3D figure renders on next page load.

### File spec

- **Format**: `.glb` (single-file glTF binary)
- **License**: must permit commercial use
- **Pose**: batting stance preferred; T-pose works as a stop-gap
- **Facing**: +Z (toward catcher). If your model imports facing a
  different direction, tweak `BATTER_BASE_ROT_DEG` in
  `BatterSilhouette.tsx`.
- **Scale**: anything — the loader auto-normalizes to ~6.2 ft tall
- **Polycount**: < 50k tris recommended (mobile-friendly)
- **Materials**: PBR baked into the GLB; no external textures

### Free sources

- [Adobe Mixamo](https://www.mixamo.com) — sign in, pick a character,
  download as glTF (.glb). No animation needed.
- [Sketchfab](https://sketchfab.com) — many CC-BY / CC0 models; verify
  the license per asset.
- [Quaternius](https://quaternius.com) — free game-ready character
  packs.

### Mirroring & handedness

RHB stands at -x (third-base side), LHB at +x (first-base side). The
loader mirrors the model via negative X scale for LHB; materials are
forced to `DoubleSide` so the inverted face winding doesn't flip the
lighting. If your model has heavy asymmetric detail (a bat held on
one shoulder, for instance) and the mirroring reads wrong, the
cleanest fix is to author two GLBs and branch on `stand` in
`BatterModel`.
