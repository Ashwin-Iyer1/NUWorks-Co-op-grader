"""Prepare untruncated, same-batch ONNX vectors for the Node numerical check."""
import argparse
import json
import hashlib
from pathlib import Path
from sentence_transformers import SentenceTransformer
from evaluate_production import configure_pooling


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", default="data/runtime_fixture.json")
    args = parser.parse_args()
    model = SentenceTransformer(args.model, backend="onnx",
                                model_kwargs={"file_name": "onnx/model_quantized.onnx"})
    configure_pooling(model)
    model.max_seq_length = 256
    texts = ["Built a Python and SQL inventory report and documented exceptions.",
             "Public health student organizing bilingual outreach and documenting participant feedback.",
             "Research intern: maintain laboratory notebooks, prepare controls, and summarize results."]
    lengths = [len(model.tokenizer(text)["input_ids"]) for text in texts]
    vectors = [model.encode([text], prompt="", normalize_embeddings=True).tolist()[0] for text in texts]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    artifact = Path(args.model) / "onnx/model_quantized.onnx"
    output.write_text(json.dumps({"model": str(args.model),
                                 "model_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
                                 "texts": texts, "vectors": vectors, "token_lengths": lengths}), encoding="utf-8")


if __name__ == "__main__":
    main()
