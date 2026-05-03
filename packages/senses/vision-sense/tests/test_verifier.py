from __future__ import annotations

import pathlib
import sys
import unittest


PACKAGE_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from sciforge_vision_sense.verifier import pixel_diff_ratio, verify_pixel_change


class PixelDiffVerifierTest(unittest.TestCase):
    def test_pixel_diff_ratio_counts_byte_level_changes(self) -> None:
        before = b"a" * 100
        after = b"a" * 99 + b"b"

        self.assertEqual(pixel_diff_ratio(before, after), 0.01)

    def test_verify_pixel_change_marks_no_change_as_possibly_no_effect(self) -> None:
        result = verify_pixel_change(b"same-image", b"same-image")

        self.assertEqual(result.diff_ratio, 0.0)
        self.assertTrue(result.possibly_no_effect)

    def test_verify_pixel_change_marks_visible_change_as_effect(self) -> None:
        before = b"a" * 100
        after = b"b" + (b"a" * 99)

        result = verify_pixel_change(before, after)

        self.assertEqual(result.diff_ratio, 0.01)
        self.assertFalse(result.possibly_no_effect)


if __name__ == "__main__":
    unittest.main()
