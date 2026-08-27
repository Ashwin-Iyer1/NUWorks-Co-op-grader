#!/usr/bin/env python3
"""Create resume/job match labels with the OpenAI Responses API.

The default invocation is a zero-cost dry run. It selects category-diverse
resumes, pairs each with every available NUWorks job, estimates a conservative
token reservation, and writes a plan. Add --execute only after reviewing it.

Examples:
    python generate_openai_labels.py
    python generate_openai_labels.py --resume-count 11 --token-budget 10000000
    python generate_openai_labels.py --execute --workers 8

Set OPENAI_API_KEY in the environment before using --execute. The key is never
accepted as a command-line argument or written to disk.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import math
import os
import random
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable


MODEL = "gpt-5.6-luna"
DEFAULT_CATEGORY_ORDER = (
    "INFORMATION-TECHNOLOGY",
    "ENGINEERING",
    "FINANCE",
    "HEALTHCARE",
    "BUSINESS-DEVELOPMENT",
    "DIGITAL-MEDIA",
    "DESIGNER",
    "SALES",
    "ACCOUNTANT",
    "CONSTRUCTION",
    "HR",
    "AVIATION",
    "TEACHER",
    "CONSULTANT",
    "PUBLIC-RELATIONS",
    "AUTOMOBILE",
    "AGRICULTURE",
    "APPAREL",
    "ARTS",
    "BANKING",
    "BPO",
    "CHEF",
    "FITNESS",
    "ADVOCATE",
)

GRADING_INSTRUCTIONS = """You create high-quality supervised labels for a
resume-to-job semantic matching model. Judge only job-relevant evidence in the
resume against the supplied job description.

Scoring rubric:
- 90-100: exceptional fit; nearly all central skills and experience are shown.
- 75-89: strong fit; most central requirements are shown, with small gaps.
- 50-74: plausible partial fit; meaningful overlap plus important gaps.
- 25-49: weak fit; limited transferable overlap or major experience gaps.
- 0-24: poor fit; different domain or almost no relevant evidence.

Treat explicit required qualifications as more important than preferred ones.
Credit transferable experience and close technical equivalents. Do not invent
resume evidence. Do not use names, contact information, protected traits, or
school/employer prestige. Do not penalize unknown facts such as citizenship,
work authorization, schedule, or location unless the resume explicitly
contradicts the requirement. Keep the rationale factual and under 45 words."""

MATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer", "minimum": 0, "maximum": 100},
        "confidence": {"type": "integer", "minimum": 0, "maximum": 100},
        "tier": {
            "type": "string",
            "enum": ["poor", "weak", "partial", "strong", "exceptional"],
        },
        "skills_fit": {"type": "integer", "minimum": 0, "maximum": 100},
        "experience_fit": {"type": "integer", "minimum": 0, "maximum": 100},
        "education_fit": {"type": "integer", "minimum": 0, "maximum": 100},
        "transferable_fit": {"type": "integer", "minimum": 0, "maximum": 100},
        "missing_requirements": {
            "type": "array",
            "items": {"type": "string"},
        },
        "rationale": {"type": "string"},
    },
    "required": [
        "score",
        "confidence",
        "tier",
        "skills_fit",
        "experience_fit",
        "education_fit",
        "transferable_fit",
        "missing_requirements",
        "rationale",
    ],
    "additionalProperties": False,
}

EMAIL_RE = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
URL_RE = re.compile(
    r"(?i)\b(?:https?://|www\.)\S+|\b(?:linkedin\.com|github\.com)/\S+"
)
PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?1[ .-]?)?(?:\(?\d{3}\)?[ .-]?)"
    r"\d{3}[ .-]?\d{4}(?!\d)"
)


@dataclass(frozen=True)
class ResumeRecord:
    resume_id: str
    category: str
    text: str


@dataclass(frozen=True)
class JobRecord:
    job_id: str
    title: str
    text: str


@dataclass(frozen=True)
class PairTask:
    pair_id: str
    resume_id: str
    job_id: str
    category: str
    estimated_input_tokens: int
    reserved_tokens: int


class GradingError(RuntimeError):
    """An API response failed after usage may already have been billed."""

    def __init__(
        self,
        message: str,
        *,
        usage: dict[str, int] | None = None,
        response_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.usage = usage or {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
        }
        self.response_id = response_id


class TextExtractor(HTMLParser):
    BLOCK_TAGS = {
        "br",
        "div",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "li",
        "ol",
        "p",
        "table",
        "tr",
        "ul",
    }

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def normalize_whitespace(value: Any) -> str:
    return re.sub(r"[ \t]+", " ", re.sub(r"\r\n?", "\n", str(value))).strip()


def html_to_text(value: Any) -> str:
    parser = TextExtractor()
    parser.feed(str(value or ""))
    parser.close()
    text = html.unescape("".join(parser.parts))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()


def redact_contact_details(text: str) -> str:
    text = EMAIL_RE.sub("[EMAIL REDACTED]", text)
    text = URL_RE.sub("[URL REDACTED]", text)
    text = PHONE_RE.sub("[PHONE REDACTED]", text)
    return text


def stable_id(prefix: str, text: str) -> str:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"


def load_resumes(
    csv_path: Path,
    *,
    redact_pii: bool = True,
    max_chars: int = 16_000,
) -> list[ResumeRecord]:
    records: list[ResumeRecord] = []
    seen: set[str] = set()
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"Resume_str", "Category"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{csv_path} is missing columns: {sorted(missing)}")
        for row in reader:
            text = normalize_whitespace(row.get("Resume_str", ""))
            if redact_pii:
                text = redact_contact_details(text)
            text = text[:max_chars].strip()
            category = normalize_whitespace(row.get("Category", "")).upper()
            if not text or not category:
                continue
            fingerprint = hashlib.sha256(text.encode("utf-8")).hexdigest()
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            records.append(
                ResumeRecord(stable_id("resume", text), category, text)
            )
    if not records:
        raise ValueError(f"No usable resumes found in {csv_path}")
    return records


def find_job_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        models = payload.get("models")
        if isinstance(models, list):
            return [row for row in models if isinstance(row, dict)]
        for value in payload.values():
            found = find_job_records(value)
            if found:
                return found
    elif isinstance(payload, list) and payload and isinstance(payload[0], dict):
        return [row for row in payload if isinstance(row, dict)]
    return []


def load_jobs(payload_path: Path, *, max_chars: int = 16_000) -> list[JobRecord]:
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    rows = find_job_records(payload)
    records: list[JobRecord] = []
    seen: set[str] = set()
    for row in rows:
        title = normalize_whitespace(
            row.get("job_title") or row.get("title") or "Untitled position"
        )
        description = html_to_text(
            row.get("job_desc")
            or row.get("job_description")
            or row.get("description")
            or ""
        )
        if not description:
            continue
        text = f"Position: {title}\n\nDescription:\n{description}"[:max_chars].strip()
        fingerprint = hashlib.sha256(text.encode("utf-8")).hexdigest()
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        source_id = normalize_whitespace(row.get("job_id", ""))
        job_id = f"job-{source_id}" if source_id else stable_id("job", text)
        records.append(JobRecord(job_id, title, text))
    if not records:
        raise ValueError(f"No usable job descriptions found in {payload_path}")
    return records


def load_job_sources(
    payload_paths: Iterable[Path], *, max_chars: int = 16_000
) -> list[JobRecord]:
    """Merge job payloads without relabeling exact duplicates.

    Exact description duplicates keep the ID from the first payload, which
    lets an existing JSONL checkpoint skip already-labeled pairs. If a later
    payload reuses a job ID for changed text, preserve both descriptions but
    version the later ID by content so it receives a fresh label.
    """

    merged: list[JobRecord] = []
    seen_texts: set[str] = set()
    text_by_id: dict[str, str] = {}
    for payload_path in payload_paths:
        for job in load_jobs(payload_path, max_chars=max_chars):
            if job.text in seen_texts:
                continue
            job_id = job.job_id
            if job_id in text_by_id and text_by_id[job_id] != job.text:
                suffix = hashlib.sha256(job.text.encode("utf-8")).hexdigest()[:8]
                job_id = f"{job_id}-{suffix}"
            # Extremely unlikely, but keep conflict resolution deterministic
            # if multiple changed versions of the same source job are present.
            while job_id in text_by_id and text_by_id[job_id] != job.text:
                suffix = hashlib.sha256(
                    f"{job_id}\n{job.text}".encode("utf-8")
                ).hexdigest()[:8]
                job_id = f"{job.job_id}-{suffix}"
            record = JobRecord(job_id, job.title, job.text)
            merged.append(record)
            seen_texts.add(record.text)
            text_by_id[record.job_id] = record.text
    if not merged:
        raise ValueError("No usable job descriptions found in supplied payloads")
    return merged


def select_diverse_resumes(
    resumes: Iterable[ResumeRecord],
    count: int,
    *,
    categories: Iterable[str] = (),
    seed: int = 42,
) -> list[ResumeRecord]:
    grouped: dict[str, list[ResumeRecord]] = {}
    for resume in resumes:
        grouped.setdefault(resume.category, []).append(resume)

    requested = [value.strip().upper() for value in categories if value.strip()]
    order = requested or list(DEFAULT_CATEGORY_ORDER)
    order.extend(sorted(set(grouped).difference(order)))

    rng = random.Random(seed)
    selected: list[ResumeRecord] = []
    for category in order:
        candidates = sorted(grouped.get(category, []), key=lambda item: len(item.text))
        if not candidates:
            if requested:
                raise ValueError(f"No resumes found for requested category {category!r}")
            continue
        # Choose from the middle half of text lengths: representative enough to
        # avoid tiny/noisy resumes, while the seed allows reproducible variants.
        low = len(candidates) // 4
        high = max(low + 1, math.ceil(len(candidates) * 0.75))
        selected.append(rng.choice(candidates[low:high]))
        if len(selected) >= count:
            break
    if len(selected) < count:
        raise ValueError(
            f"Requested {count} broad resumes but only selected {len(selected)}"
        )
    return selected


def get_token_encoder(model: str):
    try:
        import tiktoken
    except ImportError as error:
        raise RuntimeError(
            "tiktoken is required. Run: pip install -r requirements.txt"
        ) from error
    try:
        return tiktoken.encoding_for_model(model)
    except KeyError:
        return tiktoken.get_encoding("o200k_base")


def request_text(resume: ResumeRecord, job: JobRecord) -> str:
    return (
        "<resume>\n"
        f"{resume.text}\n"
        "</resume>\n\n"
        "<job_description>\n"
        f"{job.text}\n"
        "</job_description>"
    )


def estimate_input_tokens(encoder: Any, resume: ResumeRecord, job: JobRecord) -> int:
    # Schema and framing are sent with every independent response. The fixed
    # overhead covers message wrappers that are not visible in encoded strings.
    material = (
        GRADING_INSTRUCTIONS
        + json.dumps(MATCH_SCHEMA, separators=(",", ":"))
        + request_text(resume, job)
    )
    return len(encoder.encode(material)) + 96


def plan_tasks(
    resumes: list[ResumeRecord],
    jobs: list[JobRecord],
    encoder: Any,
    *,
    token_budget: int,
    safety_margin: float,
    max_output_tokens: int,
    input_reserve_multiplier: float,
    completed_pair_ids: set[str] | None = None,
    previously_used_tokens: int = 0,
) -> tuple[list[ResumeRecord], list[PairTask], int]:
    completed = completed_pair_ids or set()
    usable_budget = math.floor(token_budget * (1.0 - safety_margin))
    remaining_budget = usable_budget - previously_used_tokens
    if remaining_budget <= 0:
        return [], [], usable_budget

    selected: list[ResumeRecord] = []
    tasks: list[PairTask] = []
    reserved = 0
    for resume in resumes:
        resume_tasks: list[PairTask] = []
        resume_reserved = 0
        for job in jobs:
            pair_id = f"{resume.resume_id}__{job.job_id}"
            if pair_id in completed:
                continue
            estimated = estimate_input_tokens(encoder, resume, job)
            reservation = (
                math.ceil(estimated * input_reserve_multiplier)
                + max_output_tokens
            )
            resume_tasks.append(
                PairTask(
                    pair_id=pair_id,
                    resume_id=resume.resume_id,
                    job_id=job.job_id,
                    category=resume.category,
                    estimated_input_tokens=estimated,
                    reserved_tokens=reservation,
                )
            )
            resume_reserved += reservation

        # Keep the dataset rectangular: either this resume is graded against
        # every job or it is omitted from this run.
        if reserved + resume_reserved > remaining_budget:
            break
        selected.append(resume)
        tasks.extend(resume_tasks)
        reserved += resume_reserved
    return selected, tasks, usable_budget


def load_existing_results(path: Path) -> tuple[dict[str, dict[str, Any]], int]:
    results: dict[str, dict[str, Any]] = {}
    used_tokens = 0
    if not path.exists():
        return results, used_tokens
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"Invalid JSONL at {path}:{line_number}: {error}"
                ) from error
            pair_id = record.get("pair_id")
            if pair_id:
                results[pair_id] = record
            used_tokens += int(record.get("usage", {}).get("total_tokens") or 0)
    return results, used_tokens


def validate_label(label: dict[str, Any]) -> None:
    for key in (
        "score",
        "confidence",
        "skills_fit",
        "experience_fit",
        "education_fit",
        "transferable_fit",
    ):
        value = label.get(key)
        if not isinstance(value, int) or not 0 <= value <= 100:
            raise ValueError(f"Invalid {key}: {value!r}")
    if label.get("tier") not in {"poor", "weak", "partial", "strong", "exceptional"}:
        raise ValueError(f"Invalid tier: {label.get('tier')!r}")
    if not isinstance(label.get("missing_requirements"), list):
        raise ValueError("missing_requirements must be a list")
    if not isinstance(label.get("rationale"), str):
        raise ValueError("rationale must be a string")


_client_state = threading.local()


def openai_client():
    client = getattr(_client_state, "client", None)
    if client is not None:
        return client
    try:
        from openai import OpenAI
    except ImportError as error:
        raise RuntimeError(
            "The openai package is required. Run: pip install -r requirements.txt"
        ) from error
    client = OpenAI(timeout=120.0, max_retries=5)
    _client_state.client = client
    return client


def grade_pair(
    task: PairTask,
    resume: ResumeRecord,
    job: JobRecord,
    *,
    model: str,
    max_output_tokens: int,
    reasoning_effort: str,
) -> dict[str, Any]:
    started = time.time()
    response = openai_client().responses.create(
        model=model,
        instructions=GRADING_INSTRUCTIONS,
        input=request_text(resume, job),
        reasoning={"effort": reasoning_effort},
        max_output_tokens=max_output_tokens,
        text={
            "verbosity": "low",
            "format": {
                "type": "json_schema",
                "name": "resume_job_match",
                "strict": True,
                "schema": MATCH_SCHEMA,
            },
        },
        prompt_cache_key=f"nuwg-label-{resume.resume_id}",
        metadata={
            "dataset": "nuworks-resume-job-labels",
            "resume_id": resume.resume_id,
            "job_id": job.job_id[:512],
        },
        store=False,
    )
    usage = {
        "input_tokens": int(getattr(response.usage, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(response.usage, "output_tokens", 0) or 0),
        "total_tokens": int(getattr(response.usage, "total_tokens", 0) or 0),
    }
    try:
        if response.status != "completed":
            raise RuntimeError(
                f"Response {response.id} ended with status {response.status}"
            )
        label = json.loads(response.output_text)
        validate_label(label)
    except Exception as error:
        raise GradingError(
            str(error), usage=usage, response_id=response.id
        ) from error
    return {
        "status": "ok",
        "pair_id": task.pair_id,
        "resume_id": resume.resume_id,
        "job_id": job.job_id,
        "category": resume.category,
        "model": model,
        "response_id": response.id,
        "label": label,
        "usage": usage,
        "elapsed_seconds": round(time.time() - started, 3),
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def append_jsonl(path: Path, value: dict[str, Any], lock: threading.Lock) -> None:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    with lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8", newline="") as handle:
            handle.write(encoded + "\n")
            handle.flush()


def write_training_csv(
    path: Path,
    results: dict[str, dict[str, Any]],
    resumes: dict[str, ResumeRecord],
    jobs: dict[str, JobRecord],
) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    count = 0
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        fields = [
            "resume",
            "job",
            "score",
            "resume_id",
            "job_id",
            "category",
            "confidence",
            "tier",
            "skills_fit",
            "experience_fit",
            "education_fit",
            "transferable_fit",
            "missing_requirements",
            "rationale",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for pair_id in sorted(results):
            record = results[pair_id]
            if record.get("status") != "ok":
                continue
            resume = resumes.get(record["resume_id"])
            job = jobs.get(record["job_id"])
            if resume is None or job is None:
                continue
            label = record["label"]
            writer.writerow(
                {
                    "resume": resume.text,
                    "job": job.text,
                    "score": round(label["score"] / 100.0, 4),
                    "resume_id": resume.resume_id,
                    "job_id": job.job_id,
                    "category": resume.category,
                    "confidence": label["confidence"],
                    "tier": label["tier"],
                    "skills_fit": label["skills_fit"],
                    "experience_fit": label["experience_fit"],
                    "education_fit": label["education_fit"],
                    "transferable_fit": label["transferable_fit"],
                    "missing_requirements": json.dumps(
                        label["missing_requirements"], ensure_ascii=False
                    ),
                    "rationale": label["rationale"],
                }
            )
            count += 1
    temporary.replace(path)
    return count


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--resume-csv", type=Path, default=Path("archive/Resume/Resume.csv")
    )
    parser.add_argument(
        "--jobs-json",
        type=Path,
        nargs="+",
        default=[Path("exmaplePayload.json")],
        help="one or more job payloads, merged in the supplied order",
    )
    parser.add_argument("--out-dir", type=Path, default=Path("openai_labels"))
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--resume-count", type=int, default=11)
    parser.add_argument(
        "--categories",
        default="",
        help="comma-separated categories; default is a broad predefined order",
    )
    parser.add_argument("--max-jobs", type=int)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--workers", type=int, default=100)
    parser.add_argument("--token-budget", type=int, default=100_000_000)
    parser.add_argument(
        "--budget-scope",
        choices=("run", "output"),
        default="run",
        help=(
            "run: apply the budget only to new requests in this invocation "
            "(for a daily quota); output: include all prior JSONL usage"
        ),
    )
    parser.add_argument(
        "--safety-margin",
        type=float,
        default=0.05,
        help="fraction of the total token budget that is never scheduled",
    )
    parser.add_argument("--max-output-tokens", type=int, default=800)
    parser.add_argument("--input-reserve-multiplier", type=float, default=1.10)
    parser.add_argument(
        "--reasoning-effort",
        choices=("none", "low", "medium", "high", "xhigh", "max"),
        default="low",
    )
    parser.add_argument("--max-resume-chars", type=int, default=16_000)
    parser.add_argument("--max-job-chars", type=int, default=16_000)
    parser.add_argument(
        "--no-redact-pii",
        action="store_true",
        help="send contact details as-is (not recommended)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="make API calls; without this flag the script only writes a plan",
    )
    return parser.parse_args(argv)


def validate_args(args: argparse.Namespace) -> None:
    if args.resume_count < 1:
        raise ValueError("--resume-count must be at least 1")
    if args.workers < 1:
        raise ValueError("--workers must be at least 1")
    if args.token_budget < 1:
        raise ValueError("--token-budget must be positive")
    if not 0 <= args.safety_margin < 1:
        raise ValueError("--safety-margin must be in [0, 1)")
    if args.max_output_tokens < 100:
        raise ValueError("--max-output-tokens must be at least 100")
    if args.input_reserve_multiplier < 1:
        raise ValueError("--input-reserve-multiplier must be at least 1")
    if args.max_jobs is not None and args.max_jobs < 1:
        raise ValueError("--max-jobs must be at least 1")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    validate_args(args)
    if args.execute and args.model != MODEL:
        print(
            f"Warning: requested model {args.model!r}; expected {MODEL!r}.",
            file=sys.stderr,
        )
    if args.execute and not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Put it in the environment, not the command line."
        )

    resumes = load_resumes(
        args.resume_csv,
        redact_pii=not args.no_redact_pii,
        max_chars=args.max_resume_chars,
    )
    jobs = load_job_sources(args.jobs_json, max_chars=args.max_job_chars)
    if args.max_jobs:
        jobs = jobs[: args.max_jobs]

    requested_categories = [
        value for value in args.categories.split(",") if value.strip()
    ]
    candidates = select_diverse_resumes(
        resumes,
        args.resume_count,
        categories=requested_categories,
        seed=args.seed,
    )
    encoder = get_token_encoder(args.model)

    results_path = args.out_dir / "pairs.jsonl"
    existing, previously_used = load_existing_results(results_path)
    completed = {
        pair_id
        for pair_id, record in existing.items()
        if record.get("status") == "ok"
    }
    usage_counted_against_budget = (
        previously_used if args.budget_scope == "output" else 0
    )
    selected, tasks, usable_budget = plan_tasks(
        candidates,
        jobs,
        encoder,
        token_budget=args.token_budget,
        safety_margin=args.safety_margin,
        max_output_tokens=args.max_output_tokens,
        input_reserve_multiplier=args.input_reserve_multiplier,
        completed_pair_ids=completed,
        previously_used_tokens=usage_counted_against_budget,
    )

    reserved_tokens = sum(task.reserved_tokens for task in tasks)
    estimated_input = sum(task.estimated_input_tokens for task in tasks)
    plan = {
        "model": args.model,
        "execute": args.execute,
        "redact_pii": not args.no_redact_pii,
        "job_sources": [str(path) for path in args.jobs_json],
        "source_resume_count": len(resumes),
        "source_job_count": len(jobs),
        "selected_resume_count": len(selected),
        "selected_resumes": [
            {"resume_id": item.resume_id, "category": item.category}
            for item in selected
        ],
        "planned_api_requests": len(tasks),
        "already_completed_pairs": len(completed),
        "token_budget": args.token_budget,
        "usable_budget_after_safety_margin": usable_budget,
        "budget_scope": args.budget_scope,
        "historical_reported_tokens": previously_used,
        "tokens_counted_against_budget": usage_counted_against_budget,
        "estimated_new_input_tokens": estimated_input,
        "reserved_new_tokens": reserved_tokens,
        "remaining_unreserved_tokens": (
            usable_budget - usage_counted_against_budget - reserved_tokens
        ),
        "max_output_tokens_per_request": args.max_output_tokens,
        "workers": args.workers,
        "estimated_max_cost_usd": round(
            estimated_input * 2.0 / 1_000_000
            + len(tasks) * args.max_output_tokens * 12.0 / 1_000_000,
            2,
        ),
    }
    write_json(args.out_dir / "plan.json", plan)

    print(
        f"Selected {len(selected)} diverse resumes across "
        f"{', '.join(item.category for item in selected) or 'no categories'}."
    )
    print(f"Jobs per selected resume: {len(jobs)}")
    print(f"Planned API requests: {len(tasks):,}")
    print(
        f"Conservative reservation: {reserved_tokens:,} new tokens; "
        f"{usage_counted_against_budget:,} prior tokens counted by the "
        f"{args.budget_scope!r} budget scope; "
        f"{usable_budget:,} usable after safety margin."
    )
    print(
        f"Upper-bound estimated API cost: \${plan['estimated_max_cost_usd']:.2f} "
        "(actual output and cached-input costs should be lower)."
    )
    print(f"Plan written to {args.out_dir / 'plan.json'}")

    if len(selected) < args.resume_count:
        print(
            f"Budget fits {len(selected)} complete resumes, not the requested "
            f"{args.resume_count}; no partial resume/job matrix was scheduled."
        )
    if not args.execute:
        print("Dry run only. Add --execute after reviewing the plan.")
        return 0
    if not tasks:
        print("No new pairs fit the budget or all selected pairs are complete.")
        return 0

    resume_by_id = {item.resume_id: item for item in resumes}
    job_by_id = {item.job_id: item for item in jobs}
    write_lock = threading.Lock()
    completed_this_run = 0
    failures = 0
    actual_tokens = 0
    started = time.time()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_to_task = {
            executor.submit(
                grade_pair,
                task,
                resume_by_id[task.resume_id],
                job_by_id[task.job_id],
                model=args.model,
                max_output_tokens=args.max_output_tokens,
                reasoning_effort=args.reasoning_effort,
            ): task
            for task in tasks
        }
        for future in as_completed(future_to_task):
            task = future_to_task[future]
            try:
                record = future.result()
                completed_this_run += 1
                actual_tokens += record["usage"]["total_tokens"]
            except Exception as error:  # keep the long run resumable
                failures += 1
                error_usage = getattr(
                    error,
                    "usage",
                    {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
                )
                actual_tokens += int(error_usage.get("total_tokens") or 0)
                record = {
                    "status": "error",
                    "pair_id": task.pair_id,
                    "resume_id": task.resume_id,
                    "job_id": task.job_id,
                    "category": task.category,
                    "model": args.model,
                    "error_type": type(error).__name__,
                    "error": str(error)[:1000],
                    "response_id": getattr(error, "response_id", None),
                    "usage": error_usage,
                }
            append_jsonl(results_path, record, write_lock)
            existing[task.pair_id] = record
            done = completed_this_run + failures
            if done == 1 or done % 25 == 0 or done == len(tasks):
                rate = done / max(time.time() - started, 0.001)
                print(
                    f"[{done:,}/{len(tasks):,}] ok={completed_this_run:,} "
                    f"failed={failures:,} tokens={actual_tokens:,} "
                    f"rate={rate:.2f} pairs/s"
                )

    row_count = write_training_csv(
        args.out_dir / "train.csv",
        existing,
        resume_by_id,
        job_by_id,
    )
    summary = {
        **plan,
        "completed_this_run": completed_this_run,
        "failures_this_run": failures,
        "actual_tokens_this_run": actual_tokens,
        "training_rows_written": row_count,
        "elapsed_seconds": round(time.time() - started, 3),
    }
    write_json(args.out_dir / "summary.json", summary)
    print(
        f"Finished: {completed_this_run:,} succeeded, {failures:,} failed, "
        f"{actual_tokens:,} tokens reported by the API."
    )
    print(f"Training CSV: {args.out_dir / 'train.csv'} ({row_count:,} rows)")
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nInterrupted; completed JSONL rows are safe to resume.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
