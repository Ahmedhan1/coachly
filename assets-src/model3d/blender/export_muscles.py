"""Export the superficial muscles of Z-Anatomy as one small GLB for the app's three.js viewer.

Written for Blender 4.5 LTS (4.5.x); the code avoids APIs that differ between 4.2 LTS, 4.5 LTS and 5.x by
checking with hasattr()/introspection instead of assuming. NOT YET RUN AGAINST THE REAL FILE: Blender was
not available where this script was written. The object/collection names it relies on were read from the
real Z-Anatomy Startup.blend with a separate .blend reader (see muscle_groups.py), but every Blender call
below is untested until the owner runs it once.

Run it in one of two ways:

1. Blender window: open Z-Anatomy's Startup.blend, go to the "Scripting" tab, Text > Open... this file,
   press the Run Script button (triangle). Output: muscles.glb next to the .blend file.
2. Terminal (headless):
     blender --background Startup.blend --python assets-src/model3d/blender/export_muscles.py -- --out muscles.glb --triangles 120000

Options (after the "--"):
  --out PATH            output .glb (default: muscles.glb next to the .blend, or in your home folder)
  --triangles N         total triangle budget for the whole model (default 120000)
  --height M            scale so the figure is M metres tall (default 1.8; 0 = keep original size)
  --compression C       draco | none (default draco)
  --base-weight W       share of the budget body_base gets relative to the clickable groups (default 0.5)
  --include-unclassified  put muscles the dictionary does not know into body_base instead of dropping them
  --dry-run             only print the discovery report, export nothing
  --blend PATH          open this .blend first (headless use)

Coordinate contract with the app (same as the placeholder GLB): glTF Y-up, metres, feet centre at the
origin (0,0,0), the figure faces +Z (towards the default three.js camera). Node and mesh names are exactly
the ids in muscle_groups.ALL_OUTPUT_IDS. One shared material named "muscle"; the app tints per mesh.

The current .blend is modified in memory (new objects/collections). Do NOT save it afterwards.

Licence: the exported GLB is a derivative of Z-Anatomy (CC BY-SA 4.0) and BodyParts3D (CC BY-SA 2.1 JP);
it must be published under CC BY-SA 4.0 with attribution (see assets-src/model3d/repo-template/README.md).
"""

import argparse
import json
import math
import os
import sys
import time

import bpy
import bmesh
from mathutils import Matrix, Vector

# ----------------------------------------------------------------------------- locate muscle_groups.py ---


def _import_muscle_groups():
    """Import the pure-Python mapping module, whichever way this script was started."""
    candidates = []
    try:
        candidates.append(os.path.dirname(os.path.abspath(__file__)))
    except NameError:
        pass
    for text in bpy.data.texts:  # opened via Text > Open in the Scripting tab
        if text.filepath:
            candidates.append(os.path.dirname(bpy.path.abspath(text.filepath)))
    for d in candidates:
        if os.path.isfile(os.path.join(d, "muscle_groups.py")):
            if d not in sys.path:
                sys.path.insert(0, d)
            import importlib

            import muscle_groups

            importlib.reload(muscle_groups)  # pick up edits when re-running inside one Blender session
            return muscle_groups
    if "muscle_groups.py" in bpy.data.texts:  # loaded as a text block too
        return bpy.data.texts["muscle_groups.py"].as_module()
    raise RuntimeError(
        "muscle_groups.py not found. Keep it in the same folder as export_muscles.py "
        "(the 'blender' folder) and open export_muscles.py from that folder."
    )


mg = _import_muscle_groups()

SIZE_WARN_BYTES = 10 * 1024 * 1024
MIN_TRIS_PER_GROUP = 400

# ------------------------------------------------------------------------------------------- arguments ---


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="export_muscles.py", description="Z-Anatomy -> muscles.glb")
    p.add_argument("--out", default="")
    p.add_argument("--triangles", type=int, default=120000)
    p.add_argument("--height", type=float, default=1.8)
    p.add_argument("--compression", choices=("draco", "none"), default="draco")
    p.add_argument("--base-weight", type=float, default=0.5)
    p.add_argument("--include-unclassified", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--blend", default="")
    return p.parse_args(argv)


def default_out_path():
    if bpy.data.filepath:
        return os.path.join(os.path.dirname(bpy.data.filepath), "muscles.glb")
    return os.path.join(os.path.expanduser("~"), "muscles.glb")


_LOG_NAME = "export_muscles_log.txt"


def say(msg=""):
    """Print to the console AND to a Text block, so the report is readable inside Blender
    (Scripting tab > Text Editor > choose 'export_muscles_log.txt')."""
    print(msg, flush=True)
    try:
        log = bpy.data.texts.get(_LOG_NAME) or bpy.data.texts.new(_LOG_NAME)
        log.write(str(msg) + "\n")
    except Exception:  # pragma: no cover - never let logging break the export
        pass


def hr(title):
    say("")
    say("=" * 78)
    say(title)
    say("=" * 78)


# ------------------------------------------------------------------------------------------- discovery ---


def mesh_count(col):
    return sum(1 for o in col.all_objects if o.type == "MESH")


def print_collection_tree():
    hr("1. Collections in this file (top two levels, mesh objects incl. children)")
    for col in bpy.context.scene.collection.children:
        say(f"  {col.name}  [{mesh_count(col)} meshes]")
        for child in col.children:
            say(f"      {child.name}  [{mesh_count(child)} meshes]")
    roots_not_in_scene = [
        c for c in bpy.data.collections
        if not any(c.name in p.children for p in bpy.data.collections)
        and c.name not in bpy.context.scene.collection.children
    ]
    for col in roots_not_in_scene:
        say(f"  (not linked to scene) {col.name}  [{mesh_count(col)} meshes]")


def find_muscle_collection():
    """Z-Anatomy calls it '4: Muscular system'. Pick the 'muscular system' collection with most meshes."""
    cands = [
        c for c in bpy.data.collections
        if "muscular system" in c.name.lower() and "insertion" not in c.name.lower()
    ]
    cands.sort(key=mesh_count, reverse=True)
    if cands and mesh_count(cands[0]) > 0:
        return cands[0]
    return None


def collect_sources(args):
    col = find_muscle_collection()
    if col is None:
        say("WARNING: no collection named like 'Muscular system' was found.")
        say("         Falling back to ALL mesh objects in the file (the NC check still runs).")
        objs = [o for o in bpy.data.objects if o.type == "MESH"]
    else:
        say(f"Using collection: '{col.name}' ({mesh_count(col)} mesh objects)")
        objs = [o for o in col.all_objects if o.type == "MESH"]
    objs = sorted(set(objs), key=lambda o: o.name)

    groups = {gid: [] for gid in mg.ALL_OUTPUT_IDS}
    report = {"excluded": [], "label": [], "forbidden": [], "unclassified": []}
    for ob in objs:
        c = mg.classify(ob.name, [uc.name for uc in ob.users_collection])
        if c.kind in ("group", "body_base"):
            groups[c.group].append(ob)
        else:
            report[c.kind].append(ob.name)
            if c.kind == "unclassified" and args.include_unclassified:
                groups[mg.BODY_BASE_ID].append(ob)
    return col, groups, report


def print_discovery(groups, report):
    hr("2. Classification")
    for gid in mg.ALL_OUTPUT_IDS:
        bases = sorted({mg.normalise(o.name) for o in groups[gid]})
        say(f"  {gid:12s} {len(groups[gid]):4d} objects: {', '.join(bases) if bases else '-- NONE --'}")
    say(f"  labels/lines dropped: {len(report['label'])}")
    say(f"  excluded (fascia, bursae, deep muscles...): {len(report['excluded'])}")
    if report["unclassified"]:
        say("")
        say(f"  NOT CLASSIFIED ({len(report['unclassified'])}) - add a pattern in muscle_groups.py if one of these")
        say("  should be visible (re-run with --include-unclassified to drop them into body_base):")
        for n in report["unclassified"]:
            say(f"     - {n}")
    else:
        say("  NOT CLASSIFIED: none")

    sup = bpy.data.collections.get("Superficial muscles")
    if sup:
        kept = {o.name for g in groups.values() for o in g}
        missing = sorted(o.name for o in sup.all_objects if o.type == "MESH" and o.name not in kept)
        say("")
        say(f"  Cross-check with Z-Anatomy's own 'Superficial muscles' collection: {len(missing)} not exported")
        for n in missing:
            say(f"     - {n}  ({mg.classify(n).kind})")


# --------------------------------------------------------------------------------------------- helpers ---


def ensure_object_mode():
    ob = bpy.context.view_layer.objects.active
    if ob is not None and ob.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def new_collection(name):
    old = bpy.data.collections.get(name)
    if old:
        for o in list(old.objects):
            old.objects.unlink(o)
        bpy.data.collections.remove(old)
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    lc = bpy.context.view_layer.layer_collection.children.get(col.name)
    if lc:
        lc.exclude = False
        lc.hide_viewport = False
    return col


def tri_count(me):
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def merged_mesh(gid, sources, depsgraph):
    """World-space copy of all sources (modifiers applied) merged into one new mesh."""
    bm = bmesh.new()
    for ob in sources:
        ob_eval = ob.evaluated_get(depsgraph)
        tmp = bpy.data.meshes.new_from_object(ob_eval, preserve_all_data_layers=False, depsgraph=depsgraph)
        tmp.transform(ob_eval.matrix_world)
        bm.from_mesh(tmp)  # appends to what is already in bm
        bpy.data.meshes.remove(tmp)
    me = bpy.data.meshes.new(gid)
    bm.to_mesh(me)
    bm.free()
    return me


def strip_layers(me):
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    if hasattr(me, "color_attributes"):
        while me.color_attributes:
            me.color_attributes.remove(me.color_attributes[0])
    if hasattr(me, "vertex_colors"):  # Blender < 3.2 API, harmless otherwise
        while getattr(me, "vertex_colors", None) and len(me.vertex_colors):
            me.vertex_colors.remove(me.vertex_colors[0])


def recalc_normals_and_smooth(ob):
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    if getattr(me, "has_custom_normals", False):
        try:
            with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
        except Exception as e:  # pragma: no cover
            say(f"   note: could not clear custom normals on {ob.name}: {e}")
    if hasattr(me, "shade_smooth"):  # Blender 4.1+
        me.shade_smooth()
    else:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        if hasattr(me, "use_auto_smooth"):
            me.use_auto_smooth = False
    me.update()


def decimate(ob, ratio):
    if ratio >= 0.999:
        return
    mod = ob.modifiers.new("app_decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = max(0.001, ratio)
    if hasattr(mod, "use_collapse_triangulate"):
        mod.use_collapse_triangulate = True
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    new_me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    old = ob.data
    ob.modifiers.remove(mod)
    ob.data = new_me
    new_me.name = ob.name
    bpy.data.meshes.remove(old)


def allocate(tris, budget, base_weight):
    """Per-group target triangles, proportional to current size, body_base weighted down."""
    weights = {g: (base_weight if g == mg.BODY_BASE_ID else 1.0) * t for g, t in tris.items()}
    wsum = sum(weights.values()) or 1.0
    out = {}
    for g, t in tris.items():
        target = max(MIN_TRIS_PER_GROUP, int(budget * weights[g] / wsum))
        out[g] = min(t, target)
    return out


def bounds(objs):
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for ob in objs:
        for v in ob.data.vertices:
            co = v.co
            lo.x, lo.y, lo.z = min(lo.x, co.x), min(lo.y, co.y), min(lo.z, co.z)
            hi.x, hi.y, hi.z = max(hi.x, co.x), max(hi.y, co.y), max(hi.z, co.z)
    return lo, hi


def centroid(objs):
    total, n = Vector((0, 0, 0)), 0
    for ob in objs:
        for v in ob.data.vertices:
            total += v.co
        n += len(ob.data.vertices)
    return total / n if n else None


def make_material():
    mat = bpy.data.materials.get("muscle") or bpy.data.materials.new("muscle")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.72, 0.36, 0.33, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.6
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.0
    mat.diffuse_color = (0.72, 0.36, 0.33, 1.0)
    return mat


# ---------------------------------------------------------------------------------------------- export ---


def gltf_kwargs(out_path, compression):
    """Build exporter arguments, keeping only the ones this Blender version actually has."""
    rna = bpy.ops.export_scene.gltf.get_rna_type().properties
    props = {p.identifier: p for p in rna}

    def enum_items(name):
        p = props.get(name)
        return [i.identifier for i in p.enum_items] if p is not None and p.type == "ENUM" else []

    want = {
        "filepath": out_path,
        "export_format": "GLB",
        "use_selection": True,
        "export_yup": True,
        "export_apply": True,
        "export_normals": True,
        "export_texcoords": False,
        "export_tangents": False,
        "export_materials": "EXPORT",
        "export_cameras": False,
        "export_lights": False,
        "export_animations": False,
        "export_skins": False,
        "export_morph": False,
        "export_extras": False,
        "export_attributes": False,
    }
    if "NONE" in enum_items("export_vertex_color"):  # Blender 4.2+
        want["export_vertex_color"] = "NONE"
    elif "export_colors" in props:  # Blender <= 4.1
        want["export_colors"] = False

    draco = False
    if compression == "draco":
        if "export_draco_mesh_compression_enable" in props:
            want.update(
                export_draco_mesh_compression_enable=True,
                export_draco_mesh_compression_level=7,
                export_draco_position_quantization=14,
                export_draco_normal_quantization=10,
            )
            draco = True
        else:
            say("WARNING: this Blender has no Draco option in the glTF exporter; exporting uncompressed.")

    kwargs, skipped = {}, []
    for k, v in want.items():
        if k == "filepath" or k in props:
            if props.get(k) is not None and props[k].type == "ENUM" and v not in enum_items(k):
                skipped.append(f"{k}={v!r} (allowed: {enum_items(k)})")
                continue
            kwargs[k] = v
        else:
            skipped.append(k)
    if skipped:
        say(f"   exporter options not available in this Blender, skipped: {', '.join(skipped)}")
    return kwargs, draco


def export_glb(objs, out_path, compression):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kwargs, draco = gltf_kwargs(out_path, compression)
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except Exception as e:
        if not draco:
            raise
        say(f"WARNING: export with Draco failed ({e}). Retrying without compression.")
        kwargs = {k: v for k, v in kwargs.items() if not k.startswith("export_draco")}
        bpy.ops.export_scene.gltf(**kwargs)
        draco = False
    return draco


# ------------------------------------------------------------------------------------------------ main ---


def main():
    t0 = time.time()
    args = parse_args()
    if args.blend:
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.blend))
    if _LOG_NAME in bpy.data.texts:
        bpy.data.texts[_LOG_NAME].clear()
    out_path = os.path.abspath(bpy.path.abspath(args.out)) if args.out else default_out_path()

    hr(f"Z-Anatomy -> muscles.glb   (Blender {bpy.app.version_string})")
    say(f"file: {bpy.data.filepath or '(unsaved)'}")
    if bpy.app.version < (4, 2, 0):
        say("WARNING: written for Blender 4.5 LTS; older versions may fail.")
    problems = mg.validate_config()
    if problems:
        raise RuntimeError("muscle_groups.py config problems: " + "; ".join(problems))

    ensure_object_mode()
    print_collection_tree()
    col, groups, report = collect_sources(args)
    print_discovery(groups, report)

    if report["forbidden"]:
        hr("STOP: possible non-commercial (NC) parts selected")
        for n in report["forbidden"]:
            say(f"   - {n}")
        raise RuntimeError("Non-commercial Z-Anatomy parts would be exported. Nothing was written.")
    empty = [g for g in mg.GROUP_IDS if not groups[g]]
    if empty:
        say(f"\nWARNING: these groups found NO muscles and will be missing from the GLB: {', '.join(empty)}")
    if args.dry_run:
        say("\n--dry-run: stopping before export.")
        return

    hr("3. Building merged meshes (this can take a few minutes)")
    src_col = new_collection("APP_EXPORT_SOURCES")
    for objs in groups.values():
        for ob in objs:
            if ob.name not in src_col.objects:
                src_col.objects.link(ob)
            ob.hide_viewport = False
            try:
                ob.hide_set(False)
            except RuntimeError:
                pass
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()

    out_col = new_collection("APP_EXPORT")
    out_objs = {}
    for gid in mg.ALL_OUTPUT_IDS:
        if not groups[gid]:
            continue
        me = merged_mesh(gid, groups[gid], dg)
        ob = bpy.data.objects.new(gid, me)
        out_col.objects.link(ob)
        out_objs[gid] = ob
        say(f"   {gid:12s} merged {len(groups[gid]):3d} objects -> {tri_count(me):8d} triangles")

    # hide the sources so they cannot leak into the export
    lc = bpy.context.view_layer.layer_collection.children.get(src_col.name)
    if lc:
        lc.exclude = True

    hr("4. Orientation, size and origin")
    front = [out_objs[g] for g in ("chest", "abs") if g in out_objs]
    back = [out_objs[g] for g in ("lats", "lower_back", "traps", "middle_back") if g in out_objs]
    fc, bc = centroid(front), centroid(back)
    rot = Matrix.Identity(4)
    if fc is not None and bc is not None:
        if fc.y > bc.y:
            say("   chest is on +Y -> rotating 180 degrees so the figure faces -Y (glTF +Z)")
            rot = Matrix.Rotation(math.pi, 4, "Z")
        else:
            say("   chest is on -Y (Blender front) -> no rotation needed")
    else:
        say("   WARNING: could not check front/back (chest/abs or back groups missing)")
    for ob in out_objs.values():
        ob.data.transform(rot)
    lo, hi = bounds(out_objs.values())
    height = hi.z - lo.z
    s = (args.height / height) if (args.height > 0 and height > 0) else 1.0
    centre = Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for ob in out_objs.values():
        ob.data.transform(Matrix.Scale(s, 4) @ centre)
        ob.data.update()
    say(f"   original height {height:.3f} (scene units) -> scaled x{s:.4f}; origin = centre between the feet")

    hr("5. Decimating to the triangle budget")
    budget = max(1000, args.triangles)
    for attempt in (1, 2):
        tris = {g: tri_count(o.data) for g, o in out_objs.items()}
        total = sum(tris.values())
        say(f"   pass {attempt}: {total} triangles, budget {budget}")
        if total <= budget * 1.03:
            break
        targets = allocate(tris, budget, args.base_weight)
        for g, ob in out_objs.items():
            decimate(ob, targets[g] / tris[g] if tris[g] else 1.0)

    mat = make_material()
    for ob in out_objs.values():
        strip_layers(ob.data)
        recalc_normals_and_smooth(ob)
        ob.data.materials.clear()
        ob.data.materials.append(mat)
        ob.data.name = ob.name  # glTF mesh name == node name == group id

    hr("6. Exporting GLB")
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    order = [out_objs[g] for g in mg.ALL_OUTPUT_IDS if g in out_objs]
    used_draco = export_glb(order, out_path, args.compression)

    size = os.path.getsize(out_path)
    final = {g: tri_count(o.data) for g, o in out_objs.items()}
    hr("7. RESULT")
    for g in mg.ALL_OUTPUT_IDS:
        say(f"   {g:12s} {final.get(g, 0):8d} triangles" + ("" if g in final else "   <-- MISSING"))
    say(f"   {'TOTAL':12s} {sum(final.values()):8d} triangles")
    say(f"   compression: {'Draco' if used_draco else 'none'}")
    say(f"   file: {out_path}")
    say(f"   size: {size / 1024 / 1024:.2f} MB")
    if size > SIZE_WARN_BYTES:
        say("   WARNING: bigger than 10 MB - run again with a smaller --triangles value (e.g. 80000).")

    report_path = os.path.splitext(out_path)[0] + ".report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generator": "assets-src/model3d/blender/export_muscles.py",
                "blender": bpy.app.version_string,
                "source_file": os.path.basename(bpy.data.filepath),
                "source_collection": col.name if col else None,
                "triangle_budget": budget,
                "height_m": args.height if args.height > 0 else None,
                "compression": "draco" if used_draco else "none",
                "size_bytes": size,
                "triangles": final,
                "sources": {g: sorted(o.name for o in groups[g]) for g in mg.ALL_OUTPUT_IDS},
                "unclassified": report["unclassified"],
                "attribution": [
                    "Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0",
                    "BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan",
                ],
            },
            f,
            indent=1,
        )
    say(f"   report: {report_path}")
    say(f"\nDone in {time.time() - t0:.0f} s. Do NOT save the Z-Anatomy .blend file now (it was changed in memory).")


if __name__ == "__main__":
    main()
