"""Unit tests for blender/muscle_groups.py. Run with: python3 -m unittest discover blender

The fixtures are the real object names of the ``4: Muscular system`` collection (MESH objects only) and of
the bonus collection ``Superficial muscles`` in Z-Anatomy/Startup.blend (repo
Z-Anatomy/Models-of-human-anatomy, commit cf19678, read 2026-11-16 with a pure-Python .blend reader).
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import muscle_groups as mg  # noqa: E402


def _load(name):
    with open(os.path.join(HERE, "fixtures", name), encoding="utf-8") as f:
        return [line.rstrip("\n") for line in f if line.strip()]


MUSCULAR = _load("z_anatomy_muscular_system_meshes.txt")
SUPERFICIAL = _load("z_anatomy_superficial_muscles.txt")


class NameParsing(unittest.TestCase):
    def test_split_side(self):
        self.assertEqual(mg.split_side("Soleus muscle.l"), ("Soleus muscle", "l"))
        self.assertEqual(mg.split_side("Soleus muscle.r.001"), ("Soleus muscle", "r"))
        self.assertEqual(mg.split_side("Diaphragm"), ("Diaphragm", None))

    def test_normalise(self):
        self.assertEqual(mg.normalise("(Adductor minimus).l"), "adductor minimus")
        self.assertEqual(mg.normalise("Long head of biceps femoris.r"), "long head of biceps femoris")

    def test_labels(self):
        for n in ("Biceps brachii muscle.j", "Deltoid muscle.g", "Gluteus maximus muscle.t",
                  "Gluteus maximus muscle.l.t", "Head of malleus.i", "Foo.st", "Muscular system.g"):
            self.assertTrue(mg.is_label(n), n)
            self.assertEqual(mg.classify(n).kind, "label", n)
        self.assertFalse(mg.is_label("Gluteus maximus muscle.l"))


class KeyMuscles(unittest.TestCase):
    EXPECTED = {
        "Gluteus maximus muscle.l": "glutes",
        "Gluteus medius muscle.r": "abductors",
        "Tensor fasciae latae.l": "abductors",
        "Rectus femoris muscle.l": "quads",
        "Vastus lateralis muscle.r": "quads",
        "Vastus medialis muscle.l": "quads",
        "Long head of biceps femoris.l": "hamstrings",
        "Short head of biceps femoris.r": "hamstrings",
        "Semitendinosus muscle.l": "hamstrings",
        "Semimembranosus muscle.r": "hamstrings",
        "Adductor longus.l": "adductors",
        "(Adductor minimus).r": "adductors",
        "Gracilis muscle.l": "adductors",
        "Medial head of gastrocnemius.l": "calves",
        "Soleus muscle.r": "calves",
        "Clavicular head of pectoralis major muscle.l": "chest",
        "Sternocostal head of pectoralis major muscle.r": "chest",
        "(Abdominal part of pectoralis major muscle).l": "chest",
        "Latissimus dorsi muscle.l": "lats",
        "Teres major muscle.r": "lats",
        "Descending part of trapezius muscle.l": "traps",
        "Ascending part of trapezius muscle.r": "traps",
        "Rhomboid major muscle.l": "middle_back",
        "Iliocostalis lumborum muscle.l": "lower_back",
        "Longissimus thoracis muscle.r": "lower_back",
        "Acromial part of deltoid muscle.l": "shoulders",
        "Scapular spinal part of deltoid muscle.r": "shoulders",
        "Infraspinatus muscle.l": "shoulders",
        "Long head of biceps brachii.l": "biceps",
        "Brachialis muscle.r": "biceps",
        "Lateral head of triceps brachii.l": "triceps",
        "Brachioradialis muscle.l": "forearms",
        "Extensor digitorum.r": "forearms",
        "Humeral head of flexor carpi ulnaris.l": "forearms",
        "Rectus abdominis muscle.l": "abs",
        "External abdominal oblique muscle.r": "obliques",
        "Serratus anterior muscle.l": "obliques",
        "Sternocleidomastoid muscle.l": "neck",
        "Splenius capitis muscle.r": "neck",
        "Temporalis muscle.l": "body_base",
        "Tibialis anterior muscle.r": "body_base",
        "Extensor digitorum longus.l": "body_base",  # foot, not forearm
        "Epicranial aponeurosis.l": "body_base",
    }

    def test_expected_groups(self):
        for name, group in self.EXPECTED.items():
            c = mg.classify(name)
            self.assertEqual(c.group, group, f"{name} -> {c}")

    def test_tissue_is_excluded_even_if_it_names_a_muscle(self):
        for n in ("Trochanteric bursa of gluteus maximus muscle.l", "Subtendinous bursa of trapezius muscle.r",
                  "Deltoid fascia.l", "Inferior subtendinous bursa of biceps femoris muscle.l",
                  "Tendon sheath of flexor carpi radialis.l", "Iliotibial tract.r", "Linea alba",
                  "Vastus intermedius muscle.l", "Platysma.l", "Superior oblique muscle.l"):
            self.assertEqual(mg.classify(n).kind, "excluded", n)

    def test_non_commercial_parts_are_forbidden(self):
        self.assertEqual(mg.classify("Cochlea.l").kind, "forbidden")
        self.assertEqual(mg.classify("Kidney.r").kind, "forbidden")
        self.assertEqual(mg.classify("Some muscle.l", ["Internal ear"]).kind, "forbidden")
        self.assertIsNone(mg.is_forbidden("Gluteus maximus muscle.l", ["4: Muscular system"]))


class RealZAnatomyNames(unittest.TestCase):
    def setUp(self):
        self.results = mg.classify_all(MUSCULAR)
        self.summary = mg.summarise(self.results)

    def test_fixture_is_realistic(self):
        self.assertGreater(len(MUSCULAR), 700)
        self.assertEqual(len(SUPERFICIAL), 120)

    def test_every_name_is_classified(self):
        self.assertEqual(self.summary["unclassified"], [])

    def test_every_group_gets_left_and_right(self):
        for g in mg.GROUP_IDS:
            sides = {self.results[n].side for n in self.summary[g]}
            self.assertEqual(sides, {"l", "r"}, g)

    def test_body_base_is_not_empty(self):
        self.assertGreater(len(self.summary["body_base"]), 20)

    def test_nothing_forbidden_in_muscular_system(self):
        self.assertEqual(self.summary["forbidden"], [])

    def test_superficial_collection_muscles_are_kept(self):
        """Every real muscle of Z-Anatomy's own 'Superficial muscles' collection ends in a group or body_base.

        Platysma is excluded on purpose (thin skin muscle over chest/neck); fasciae and tendons are dropped.
        """
        allowed_drop = ("fascia", "aponeurosis", "tract", "ligament", "platysma", "tendon")
        for n in SUPERFICIAL:
            c = mg.classify(n)
            if c.kind in ("group", "body_base"):
                continue
            self.assertTrue(any(w in c.base for w in allowed_drop), f"{n} dropped: {c}")

    def test_config_is_valid(self):
        self.assertEqual(mg.validate_config(), [])
        self.assertEqual(len(mg.ALL_OUTPUT_IDS), 19)
        self.assertEqual(len(set(mg.ALL_OUTPUT_IDS)), 19)


if __name__ == "__main__":
    unittest.main()
