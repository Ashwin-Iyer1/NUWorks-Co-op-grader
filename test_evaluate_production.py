import unittest

import numpy as np
import pandas as pd
import torch

from evaluate_production import Pooling, configure_pooling, score_dataset


class RecordingEncoder:
    prompts = {"query": "", "document": ""}
    default_prompt_name = "query"

    def __init__(self):
        self.calls = []

    def encode(self, texts, **kwargs):
        self.calls.append((texts, kwargs))
        vectors = {
            "resume a": [1.0, 0.0], "resume b": [0.0, 1.0],
            "job a": [1.0, 0.0], "job b": [0.0, 1.0],
        }
        return np.array([vectors[text] for text in texts])


class ProductionParityTests(unittest.TestCase):
    def test_mean_pooling_replaces_cls_and_excludes_padding(self):
        model = [object(), Pooling(2, pooling_mode="cls")]
        features = {
            "token_embeddings": torch.tensor([[[1., 0.], [0., 1.], [99., 99.]]]),
            "attention_mask": torch.tensor([[1, 1, 0]]),
        }
        cls_embedding = model[1]({key: value.clone() for key, value in features.items()})["sentence_embedding"]
        result = configure_pooling(model)
        mean_embedding = model[1](features)["sentence_embedding"]
        self.assertIs(result, model)
        torch.testing.assert_close(cls_embedding, torch.tensor([[1., 0.]]))
        torch.testing.assert_close(mean_embedding, torch.tensor([[0.5, 0.5]]))

    def test_legacy_model_pooling_is_explicit(self):
        model = [object(), Pooling(2, pooling_mode="cls")]
        original = model[1]
        configure_pooling(model, "model")
        self.assertIs(model[1], original)
        with self.assertRaisesRegex(ValueError, "pooling must"):
            configure_pooling(model, "max")

    def test_runtime_encodes_no_prompt_and_only_unique_capped_jobs(self):
        model = RecordingEncoder()
        frame = pd.DataFrame({
            "resume": ["resume a", "resume b", "resume a"],
            "job": ["job a extended", "job a duplicate tail", "job b"],
        })
        scores = score_dataset(model, frame, batch_size=8, char_cap=5, chunk_chars=1100)
        self.assertEqual(model.calls[0][0], ["resume a", "resume b"])
        self.assertEqual(model.calls[1][0], ["job a", "job b"])
        self.assertEqual(model.calls[0][1]["prompt"], "")
        self.assertEqual(model.calls[1][1]["prompt"], "")
        np.testing.assert_allclose(scores["mean_vector"], [1.0, 0.0, 0.0])
        np.testing.assert_allclose(scores["max_chunk"], [1.0, 0.0, 0.0])


if __name__ == "__main__":
    unittest.main()
