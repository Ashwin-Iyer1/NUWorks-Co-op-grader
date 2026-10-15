import json
from pathlib import Path
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

root = Path(__file__).resolve().parent
model = Path('models/major_agnostic/selected_onnx')
fixture = json.loads(Path('data/selected_runtime_fixture.json').read_text())
tokenizer = AutoTokenizer.from_pretrained(model, local_files_only=True)
tokens = [dict(tokenizer(text, return_tensors='np')) for text in fixture['texts']]
result = {'python_ort': ort.__version__, 'tokens': [{k: v.tolist() for k, v in row.items()} for row in tokens],
          'fixture_vectors': fixture['vectors'], 'texts': fixture['texts'], 'vectors': {}}
for level, name in [(ort.GraphOptimizationLevel.ORT_ENABLE_ALL, 'all'),
                    (ort.GraphOptimizationLevel.ORT_DISABLE_ALL, 'disabled')]:
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.graph_optimization_level = level
    session = ort.InferenceSession(str(model / 'onnx/model_quantized.onnx'), sess_options=options,
                                   providers=['CPUExecutionProvider'])
    vectors = []
    names = {item.name for item in session.get_inputs()}
    for row in tokens:
        hidden = session.run(None, {k: v for k, v in row.items() if k in names})[0]
        mask = row['attention_mask'].astype(np.float32)[..., None]
        pooled = (hidden * mask).sum(axis=1) / mask.sum(axis=1)
        pooled /= np.linalg.norm(pooled, axis=1, keepdims=True)
        vectors.append(pooled[0].tolist())
    result['vectors'][name] = vectors
(root / 'python.json').write_text(json.dumps(result), encoding='utf-8')
print(json.dumps({'python_ort': ort.__version__, 'providers': session.get_providers(), 'modes': list(result['vectors'])}))
