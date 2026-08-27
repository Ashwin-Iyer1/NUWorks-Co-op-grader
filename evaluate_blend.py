#!/usr/bin/env python3
"""Tune semantic calibration and lexical/semantic blending on validation data."""

import argparse
import json
import os
import subprocess

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.isotonic import IsotonicRegression

from evaluate_production import ranking_metrics


def metrics(frame, values):
    labels = frame["score"].to_numpy(dtype=float)
    return {
        "spearman": float(stats.spearmanr(values, labels).statistic),
        "pearson": float(stats.pearsonr(values, labels).statistic),
        "mae": float(np.mean(np.abs(values - labels))),
        **ranking_metrics(frame, np.asarray(values)),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--predictions", required=True)
    parser.add_argument("--matcher", required=True)
    parser.add_argument("--node", default="node")
    parser.add_argument("--work-dir", default="models/experiments/blend")
    parser.add_argument("--config-out")
    parser.add_argument("--config-in")
    args = parser.parse_args()

    os.makedirs(args.work_dir, exist_ok=True)
    frame = pd.read_csv(args.predictions).reset_index(drop=True)
    lexical_input = os.path.join(args.work_dir, "lexical_input.json")
    lexical_output = os.path.join(args.work_dir, "lexical_scores.json")
    with open(lexical_input, "w", encoding="utf-8") as handle:
        json.dump(frame[["resume", "job"]].to_dict("records"), handle)
    subprocess.run([args.node, "score_lexical.mjs", args.matcher, lexical_input, lexical_output], check=True)
    with open(lexical_output, encoding="utf-8") as handle:
        lexical = np.asarray(json.load(handle), dtype=float)
    semantic = frame["prediction"].to_numpy(dtype=float)
    labels = frame["score"].to_numpy(dtype=float)

    if args.config_in:
        with open(args.config_in, encoding="utf-8") as handle:
            config = json.load(handle)
        calibrated = np.interp(
            semantic,
            np.asarray(config["isotonic_x"]),
            np.asarray(config["isotonic_y"]),
        )
        best_weight = float(config["semantic_weight"])
        affine_slope = float(config["affine_slope"])
        affine_intercept = float(config["affine_intercept"])
        linear_floor = float(config["linear_floor"])
        linear_ceil = float(config["linear_ceil"])
    else:
        isotonic = IsotonicRegression(y_min=0, y_max=1, out_of_bounds="clip").fit(semantic, labels)
        calibrated = isotonic.predict(semantic)
        candidates = []
        for weight in np.linspace(0, 1, 21):
            blended = lexical * (1 - weight) + calibrated * weight
            result = metrics(frame, blended)
            candidates.append((result["mean_ndcg_at_10"], result["spearman"], float(weight)))
        _, _, best_weight = max(candidates)
        affine_slope, affine_intercept = np.polyfit(semantic, labels, 1)
        linear_candidates = []
        for floor in np.linspace(0.0, 0.90, 91):
            for ceil in np.linspace(floor + 0.05, 1.0, int(round((1.0 - floor - 0.05) / 0.01)) + 1):
                mapped = np.clip((semantic - floor) / (ceil - floor), 0, 1)
                linear_candidates.append((float(np.mean(np.abs(mapped - labels))), float(floor), float(ceil)))
        _, linear_floor, linear_ceil = min(linear_candidates)
        config = {
            "semantic_weight": best_weight,
            "isotonic_x": isotonic.X_thresholds_.tolist(),
            "isotonic_y": isotonic.y_thresholds_.tolist(),
            "affine_slope": float(affine_slope),
            "affine_intercept": float(affine_intercept),
            "linear_floor": linear_floor,
            "linear_ceil": linear_ceil,
        }
        if args.config_out:
            with open(args.config_out, "w", encoding="utf-8") as handle:
                json.dump(config, handle, indent=2)

    current_semantic = np.clip((semantic - 0.80) / (0.97 - 0.80), 0, 1)
    tuned_linear = np.clip((semantic - linear_floor) / (linear_ceil - linear_floor), 0, 1)
    affine = np.clip(semantic * affine_slope + affine_intercept, 0, 1)
    variants = {
        "lexical_only": lexical,
        "semantic_raw": semantic,
        "semantic_current_calibration": current_semantic,
        "semantic_tuned_linear": tuned_linear,
        "semantic_affine_calibration": affine,
        "semantic_isotonic_calibration": calibrated,
        "current_65_35_blend": lexical * 0.65 + current_semantic * 0.35,
        f"tuned_blend_semantic_{best_weight:.2f}": lexical * (1 - best_weight) + calibrated * best_weight,
    }
    for name, values in variants.items():
        result = metrics(frame, values)
        print(
            f"{name:>34}: spearman={result['spearman']:.4f} "
            f"ndcg@10={result['mean_ndcg_at_10']:.4f} top1={result['top1_best_rate']:.4f} mae={result['mae']:.4f}"
        )


if __name__ == "__main__":
    main()
