"""Pure-Python mapping from Z-Anatomy object names to the app's muscle-group ids.

No ``bpy`` import: this file is imported by ``export_muscles.py`` inside Blender AND unit-tested with the
system Python (``python3 -m unittest discover assets-src/model3d/blender``).

How Z-Anatomy names its objects (checked on 2026-11-16 by reading the object/collection blocks of
``Z-Anatomy/Startup.blend`` from https://github.com/Z-Anatomy/Models-of-human-anatomy, file
``Z-Anatomy.zip``, saved with Blender 3.5; see ``blender/fixtures/``):

* Muscles live in the top-level collection ``4: Muscular system`` (flat, ~790 mesh objects).
* Paired structures end in ``.l`` / ``.r`` (e.g. ``Gluteus maximus muscle.l``); midline ones have no suffix
  (``Diaphragm``, ``Linea alba``).
* Labels are NOT muscles: ``.t`` text objects (FONT), ``.g`` group-label objects, ``.j`` leader-line MESH
  objects, ``.i`` / ``.st`` helpers (the Z-Anatomy add-on's own list is ``{"-txt", ".t", ".j"}`` plus the
  ``clean_name`` endings ``.r .l .t .st .r.t .l.t .g .j``). They must be dropped.
* A few names are wrapped in parentheses, e.g. ``(Adductor minimus).l`` - treated like the bare name.
* Fascia, bursae, tendon sheaths, retinacula, septa and ligaments sit in the same collection.

EDIT HERE: ``GROUP_PATTERNS`` (which muscle goes in which group), ``BODY_BASE_PATTERNS`` (shown in grey,
not clickable) and ``EXCLUDE_PATTERNS`` (dropped). Patterns are Python regular expressions matched with
``re.search`` against the *normalised* name: lower case, side suffix and parentheses removed, e.g.
``"Long head of biceps femoris.l"`` -> ``"long head of biceps femoris"``.
Order of checks: label -> forbidden (non-commercial) -> tissue (bursa, fascia...) -> group -> body_base
-> exclude (deep muscles) -> unclassified.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

# The app keys on these exact ids. Do not rename.
GROUP_IDS: Tuple[str, ...] = (
    "glutes",
    "quads",
    "hamstrings",
    "calves",
    "adductors",
    "abductors",
    "chest",
    "lats",
    "traps",
    "middle_back",
    "lower_back",
    "shoulders",
    "biceps",
    "triceps",
    "forearms",
    "abs",
    "obliques",
    "neck",
)
BODY_BASE_ID = "body_base"
ALL_OUTPUT_IDS: Tuple[str, ...] = GROUP_IDS + (BODY_BASE_ID,)

# ---------------------------------------------------------------------------------------------------------
# 1. Group patterns (superficial / visible skeletal muscles only). First matching group wins, in dict order.
# ---------------------------------------------------------------------------------------------------------
GROUP_PATTERNS: Dict[str, List[str]] = {
    "glutes": [r"\bgluteus maximus\b"],
    "abductors": [r"\bgluteus medius\b", r"\bgluteus minimus\b", r"\btensor fasciae latae\b"],
    "quads": [
        r"\brectus femoris\b",
        r"\bvastus (lateralis|medialis)\b",
        r"\bsartorius muscle\b",  # front-of-thigh strap; visually part of the quads area
    ],
    "hamstrings": [r"\bbiceps femoris\b", r"\bsemitendinosus\b", r"\bsemimembranosus muscle\b"],
    "adductors": [
        r"^adductor (longus|brevis|magnus|minimus)\b",
        r"\bgracilis\b",
        r"\bpectineus\b",
    ],
    "calves": [r"\bgastrocnemius$", r"\bhead of gastrocnemius\b", r"\bsoleus\b", r"^plantaris muscle$"],
    "chest": [r"\bpectoralis major\b"],
    "lats": [r"\blatissimus dorsi\b", r"^teres major muscle$"],
    "traps": [r"\bpart of trapezius\b", r"^trapezius( muscle)?$"],
    "middle_back": [r"\brhomboid (major|minor)\b"],
    "lower_back": [
        # erector spinae (iliocostalis / longissimus / spinalis) of the trunk; the neck parts go to "neck"
        r"^iliocostalis (lumborum|thoracis)\b",
        r"^longissimus thoracis\b",
        r"^spinalis thoracis\b",
        r"\berector spinae\b",
    ],
    "shoulders": [
        r"\bdeltoid muscle$",  # Clavicular / Acromial / Scapular spinal part of deltoid muscle
        r"^deltoid( muscle)?$",
        r"^supraspinatus\b",
        r"^infraspinatus\b",
        r"^teres minor\b",
    ],
    "biceps": [r"\bbiceps brachii\b", r"^brachialis muscle$", r"^coracobrachialis\b"],
    "triceps": [r"\btriceps brachii\b", r"^anconeus\b"],
    "forearms": [
        r"^brachioradialis\b",
        r"\bflexor carpi (radialis|ulnaris)\b",
        r"\bextensor carpi (radialis (longus|brevis)|ulnaris)\b",
        r"^palmaris longus\b",
        r"^extensor digitorum$",  # forearm; NOT "extensor digitorum longus/brevis" (foot)
        r"^extensor digiti minimi$",
        r"^abductor pollicis longus\b",
        r"^extensor pollicis (longus|brevis)\b",
        r"\bhead of flexor digitorum superficialis\b",
        r"\bhead of pronator teres\b",
        r"^pronator teres\b",
    ],
    "abs": [r"^rectus abdominis\b", r"^pyramidalis\b"],
    "obliques": [r"^external abdominal oblique\b", r"^serratus anterior\b"],
    "neck": [
        r"^sternocleidomastoid\b",
        r"^splenius (capitis|colli)\b",
        r"^levator scapulae\b",
        r"^scalenus (anterior|medius|posterior)\b",
    ],
}

# ---------------------------------------------------------------------------------------------------------
# 2. body_base: visible but not clickable (head, face, front of neck, shins, hands, feet, rib gaps).
# ---------------------------------------------------------------------------------------------------------
BODY_BASE_PATTERNS: List[str] = [
    # head and face
    r"^(frontalis|occipitalis|temporalis|temporoparietalis|procerus|nasalis|risorius|mentalis) muscle$",
    r"^epicranial aponeurosis$",
    r"\bpart of masseter$",
    r"\bpart of orbicularis oculi$",
    r"^orbicularis oris\b",
    r"^zygomaticus (major|minor)\b",
    r"^(depressor anguli oris|depressor labii inferioris|depressor septi nasi)$",
    r"^(levator labii superioris|levator nasolabialis|levator anguli oris)$",
    r"^bucinator$",
    r"^corrugator supercilii$",
    # front of neck (strap muscles)
    r"^(sternohyoid|sternothyroid|thyrohyoid|omohyoid|mylohyoid|stylohyoid) muscle$",
    r"\bbelly of digastric muscle$",
    # shin and foot
    r"^tibialis anterior\b",
    r"^fibularis (longus|brevis|tertius)\b",
    r"^extensor (digitorum|hallucis) (longus|brevis)$",
    r"^tendon of extensor digitorum longus$",
    r"^calcaneal tendon$",
    r"^abductor (hallucis|digiti minimi of foot)$",
    r"^flexor digitorum brevis$",
    r"^plantar aponeurosis$",
    # hand
    r"^abductor (pollicis brevis|digiti minimi of hand)$",
    r"^(superficial head of )?flexor pollicis brevis$",
    r"^flexor digiti minimi of hand$",
    r"^opponens (pollicis muscle|digiti minimi muscle of hand)$",
    r"^dorsal interossei muscles of hand$",
    r"head of adductor pollicis$",
    r"^palmar aponeurosis$",
    # trunk filler so the figure is not see-through between ribs
    r"^external intercostal muscles$",
]

# ---------------------------------------------------------------------------------------------------------
# 3. Dropped: non-muscle tissue, deep / internal muscles, eye / tongue / larynx / pelvic floor muscles.
# ---------------------------------------------------------------------------------------------------------
# Checked BEFORE the groups, because names like "Trochanteric bursa of gluteus maximus muscle" contain a
# muscle name. Keep tendons/aponeuroses out of this list (some are wanted in body_base).
TISSUE_EXCLUDE_PATTERNS: List[str] = [
    r"\bbursa", r"\bbursae\b", r"\bsheath", r"\bretinacul", r"\bseptum\b", r"\bligament\b",
    r"\bfascia\b", r"\bfascia lata\b", r"\btract\b", r"\barch\b", r"\bring\b",
    r"^linea alba$", r"^trochlea of", r"\btarsus$",
]

# Checked AFTER the groups and body_base.
EXCLUDE_PATTERNS: List[str] = [
    r"\baponeurosis\b", r"\btendon\b",
    # thin skin muscle that would hide chest and neck
    r"^platysma$",
    # deep or internal muscles (hidden under the superficial layer)
    r"^vastus intermedius\b", r"^pectoralis minor\b", r"^subclavius\b", r"^subscapularis\b",
    r"^internal abdominal oblique\b", r"^transversus (abdominis|thoracis)\b",
    r"\bintercostal\b", r"^diaphragm$", r"^quadratus (lumborum|femoris|plantae)\b",
    r"^(psoas major|iliacus muscle)$", r"^piriformis\b", r"\bgemellus\b", r"^obturator (internus|externus)\b",
    r"^popliteus\b", r"^tibialis posterior\b", r"^flexor (digitorum|hallucis) longus$",
    r"^flexor digitorum profundus\b", r"^flexor pollicis longus\b", r"^pronator quadratus\b",
    r"^supinator$", r"^extensor indicis\b",
    r"\binterossei\b", r"\blumbrical", r"^opponens digiti minimi muscle of foot$",
    r"^flexor digiti minimi of foot$", r"head of adductor hallucis$", r"head of flexor hallucis brevis$",
    r"^deep head of flexor pollicis brevis$",
    r"^(multifidus|rotatores|interspinales|semispinalis)\b", r"\bintertransversarii\b",
    r"^levatores (breves|longi) costarum$", r"^serratus posterior\b",
    r"^iliocostalis colli\b", r"^longissimus (capitis|colli)\b", r"^spinalis (capitis|colli)\b",
    r"^longus (capitis|colli)\b", r"^rectus (anterior|lateralis|posterior (major|minor)) capitis\b",
    r"^obliquus (inferior|superior) capitis\b",
    # pelvic floor / perineum
    r"^(coccygeus|iliococcygeus|pubococcygeus|pubo-analis) muscle$", r"^external anal sphincter$",
    # eye, jaw (deep), tongue, pharynx, larynx
    r"^(superior|inferior|medial|lateral) rectus muscle$", r"^(superior|inferior) oblique muscle$",
    r"^levator palpebrae superioris$", r"^common tendinous ring$",
    r"\bpterygoid\b", r"glossus\b", r"^geniohyoid\b", r"pharyn", r"^stylopharyngeus\b",
    r"arytenoid\b", r"\bcricothyroid\b", r"\bthyro-arytenoid\b", r"^intermediate tendon\b",
]

# ---------------------------------------------------------------------------------------------------------
# 4. Non-commercial parts of Z-Anatomy (README: "Anatomy of the Inner Ear ... CC-BY-NC-SA 4.0",
#    "Kidney ... CC-BY-NC 4.0"). If anything selected matches, the export must stop.
#    Matched against object names AND the names of every collection the object is linked to.
# ---------------------------------------------------------------------------------------------------------
NC_FORBIDDEN_PATTERNS: List[str] = [
    r"\bcochle", r"\bsemicircular\b", r"\blabyrinth", r"\bvestibul", r"\binternal ear\b", r"\binner ear\b",
    r"\butricle\b", r"\bsaccule\b", r"\bendolymph", r"\bperilymph",
    r"\bkidney", r"\brenal\b", r"\bnephr", r"\bureter",
]

LABEL_SUFFIXES: Tuple[str, ...] = (".t", ".j", ".g", ".i", ".st")
LABEL_MARKERS: Tuple[str, ...] = ("-txt",)
SIDE_SUFFIXES: Tuple[str, ...] = (".l", ".r")

_DUP_SUFFIX = re.compile(r"\.\d{3}$")  # Blender duplicate suffix, e.g. "Name.l.001"


@dataclass(frozen=True)
class Classification:
    """Result for one object name."""

    kind: str  # "label" | "forbidden" | "group" | "body_base" | "excluded" | "unclassified"
    group: Optional[str]  # one of ALL_OUTPUT_IDS when kind is "group" or "body_base"
    base: str  # normalised name
    side: Optional[str]  # "l", "r" or None
    rule: Optional[str] = None  # the regex that decided it


def split_side(name: str) -> Tuple[str, Optional[str]]:
    """``"Soleus muscle.l.001"`` -> ``("Soleus muscle", "l")``."""
    n = _DUP_SUFFIX.sub("", name.strip())
    for suffix in SIDE_SUFFIXES:
        if n.endswith(suffix):
            return n[: -len(suffix)], suffix[1:]
    return n, None


def is_label(name: str) -> bool:
    n = _DUP_SUFFIX.sub("", name.strip())
    if any(m in n for m in LABEL_MARKERS):
        return True
    return any(n.endswith(s) for s in LABEL_SUFFIXES)


def normalise(name: str) -> str:
    base, _ = split_side(name)
    base = base.replace("(", " ").replace(")", " ").replace("[", " ").replace("]", " ")
    base = base.replace("’", "'")
    return re.sub(r"\s+", " ", base).strip().lower()


def _compile(patterns: Iterable[str]) -> List[Tuple[str, "re.Pattern[str]"]]:
    return [(p, re.compile(p)) for p in patterns]


_GROUP_RX = [(g, _compile(ps)) for g, ps in GROUP_PATTERNS.items()]
_BASE_RX = _compile(BODY_BASE_PATTERNS)
_TISSUE_RX = _compile(TISSUE_EXCLUDE_PATTERNS)
_EXCL_RX = _compile(EXCLUDE_PATTERNS)
_NC_RX = _compile(NC_FORBIDDEN_PATTERNS)


def is_forbidden(name: str, collection_names: Sequence[str] = ()) -> Optional[str]:
    """Return the matching NC pattern if the name or any of its collections looks non-commercial."""
    for text in (name, *collection_names):
        low = text.lower()
        for p, rx in _NC_RX:
            if rx.search(low):
                return p
    return None


def classify(name: str, collection_names: Sequence[str] = ()) -> Classification:
    base = normalise(name)
    _, side = split_side(name)
    if is_label(name):
        return Classification("label", None, base, side)
    nc = is_forbidden(name, collection_names)
    if nc:
        return Classification("forbidden", None, base, side, nc)
    for p, rx in _TISSUE_RX:
        if rx.search(base):
            return Classification("excluded", None, base, side, p)
    for group, rxs in _GROUP_RX:
        for p, rx in rxs:
            if rx.search(base):
                return Classification("group", group, base, side, p)
    for p, rx in _BASE_RX:
        if rx.search(base):
            return Classification("body_base", BODY_BASE_ID, base, side, p)
    for p, rx in _EXCL_RX:
        if rx.search(base):
            return Classification("excluded", None, base, side, p)
    return Classification("unclassified", None, base, side)


def classify_all(names: Iterable[str]) -> Dict[str, Classification]:
    return {n: classify(n) for n in names}


def summarise(results: Dict[str, Classification]) -> Dict[str, List[str]]:
    """Group names by output id plus the keys 'excluded', 'label', 'forbidden', 'unclassified'."""
    out: Dict[str, List[str]] = {k: [] for k in ALL_OUTPUT_IDS}
    for k in ("excluded", "label", "forbidden", "unclassified"):
        out[k] = []
    for name, c in sorted(results.items()):
        out[c.group if c.group else c.kind].append(name)
    return out


def validate_config() -> List[str]:
    """Sanity checks on the editable dictionaries; returns a list of problems (empty = fine)."""
    problems = []
    for g in GROUP_PATTERNS:
        if g not in GROUP_IDS:
            problems.append(f"GROUP_PATTERNS has unknown id {g!r}")
    for g in GROUP_IDS:
        if not GROUP_PATTERNS.get(g):
            problems.append(f"group {g!r} has no patterns")
    for p in [p for ps in GROUP_PATTERNS.values() for p in ps] + BODY_BASE_PATTERNS + TISSUE_EXCLUDE_PATTERNS + EXCLUDE_PATTERNS:
        try:
            re.compile(p)
        except re.error as e:  # pragma: no cover - only hit after a bad manual edit
            problems.append(f"bad regex {p!r}: {e}")
    return problems
