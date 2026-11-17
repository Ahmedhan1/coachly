# PT Coach — superficial muscles 3D model (GLB)

A small, web-ready 3D model of the superficial human skeletal muscles, split into 18 clickable muscle groups
plus one neutral base mesh. It is used by the PT Coach app's 3D muscle viewer (three.js), and is published here
because its source licence (CC BY-SA 4.0) requires the modified model to be shared under the same licence.

## Files

| File | What it is |
| --- | --- |
| `muscles.glb` | The model (added after the export is run; Draco-compressed glTF 2.0 binary). |
| `muscles.report.json` | Which Z-Anatomy objects went into which group, triangle counts, Blender version. |
| `scripts/export_muscles.py`, `scripts/muscle_groups.py` | The Blender script that produced `muscles.glb` from Z-Anatomy, and its editable name-to-group mapping. |
| `placeholder/muscles.placeholder.glb` | A low-poly **stand-in** made of simple shapes (no Z-Anatomy data), used only for development. Not anatomy. |
| `LICENSE` | Licence notice (CC BY-SA 4.0) with links to the official deed and legal code. |
| `ATTRIBUTION.md` | The attribution text, in English and Arabic, as shown in the app's "About" screen. |

Mesh / node names (exact): `glutes, quads, hamstrings, calves, adductors, abductors, chest, lats, traps,
middle_back, lower_back, shoulders, biceps, triceps, forearms, abs, obliques, neck, body_base`.
Coordinates: glTF Y-up, metres, 1.8 m tall, feet centre at the origin, facing +Z, the figure's left side at +X.

## Source and attribution

This model is a derivative of:

- **Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0** —
  <https://github.com/Z-Anatomy/Models-of-human-anatomy> (file `Z-Anatomy.zip` → `Startup.blend`).
  Authors credited by Z-Anatomy: Gauthier Kervyn (design, 3D, anatomy), Marcin Zielinski (Blender add-on),
  and others listed in their README.
- **BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan** — the original model Z-Anatomy
  is derived from (Kousaku Okubo); <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html>.

Only meshes from Z-Anatomy's "Muscular system" collection were used. The parts of Z-Anatomy that are under
non-commercial licences ("Anatomy of the Inner Ear", CC-BY-NC-SA 4.0; "Kidney", CC-BY-NC 4.0) are **not**
included; the export script stops if any object that looks like them is selected.

## Changes made

1. Kept only the superficial skeletal muscles from the "Muscular system" collection; removed labels, leader
   lines, fasciae, bursae, tendon sheaths, retinacula, ligaments and deep muscles.
2. Merged left and right muscles into 18 groups (e.g. gluteus maximus → `glutes`; rectus femoris, vastus
   lateralis/medialis, sartorius → `quads`), and the remaining visible muscles of head, neck front, shins,
   hands and feet into `body_base`. The exact mapping is in `scripts/muscle_groups.py` and
   `muscles.report.json`.
3. Applied transforms, reduced the polygon count (decimation to about 120,000 triangles in total),
   recalculated normals, replaced all materials with one plain material, scaled to 1.8 m, moved the origin
   to the feet, and exported as Draco-compressed GLB.

## Licence

`muscles.glb` and `muscles.report.json` are licensed under the
**Creative Commons Attribution-ShareAlike 4.0 International** licence (CC BY-SA 4.0) — see `LICENSE`.
You may share and adapt them, including commercially, as long as you give appropriate credit (keep the
attribution above), indicate changes, and distribute your contributions under the same licence.

The placeholder GLB and the scripts are our own work and are offered under the same CC BY-SA 4.0 licence for
simplicity.

This README is not legal advice.
