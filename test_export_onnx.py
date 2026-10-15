import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from export_onnx import install_quantized_alias


class QuantizedExportTests(unittest.TestCase):
    def test_reexport_replaces_stale_runtime_alias_with_exact_new_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "model_quantized.onnx").write_bytes(b"previous checkpoint")
            (root / "model_qint8_old.onnx").write_bytes(b"unrelated quantization")
            (root / "model_qint8_avx2.onnx").write_bytes(b"new checkpoint")
            output = install_quantized_alias(root)
            self.assertEqual(output.name, "model_quantized.onnx")
            self.assertEqual(output.read_bytes(), b"new checkpoint")
            self.assertEqual((root / "model_qint8_old.onnx").read_bytes(), b"unrelated quantization")

    def test_missing_or_empty_fresh_artifact_cannot_succeed_using_old_alias(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            alias = root / "model_quantized.onnx"
            alias.write_bytes(b"previous checkpoint")
            with self.assertRaisesRegex(FileNotFoundError, "nonempty"):
                install_quantized_alias(root)
            (root / "model_qint8_avx2.onnx").write_bytes(b"")
            with self.assertRaisesRegex(FileNotFoundError, "nonempty"):
                install_quantized_alias(root)
            self.assertEqual(alias.read_bytes(), b"previous checkpoint")

    def test_copy_failure_leaves_previous_alias_intact_and_no_partial_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "model_quantized.onnx").write_bytes(b"previous checkpoint")
            (root / "model_qint8_avx2.onnx").write_bytes(b"new checkpoint")
            with patch("export_onnx.shutil.copyfile", side_effect=OSError("disk full")):
                with self.assertRaisesRegex(OSError, "disk full"):
                    install_quantized_alias(root)
            self.assertEqual((root / "model_quantized.onnx").read_bytes(), b"previous checkpoint")
            self.assertEqual(list(root.glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
