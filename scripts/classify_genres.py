#!/usr/bin/env python3
"""
Genre Classification Pipeline v2 for Music-Library
===================================================
Classifies tracks using Essentia's Discogs-EfficientNet model (400 genre classes).
Outputs results to genreClassification.json (separate from musicBib.json).

Two-stage pipeline:
  1. EfficientNet extracts 200-dim audio embeddings
  2. Classification head maps embeddings to 400 genre probabilities

Features:
  - Version deduplication (analyzes latest version, propagates to all)
  - Segment-based analysis with uncertainty quantification
  - Full 400-class probability distribution stored
  - 200-dim embeddings for similarity/clustering
  - Metadata tag writing to audio files (mutagen)
  - Idempotent: resumable with --skip-existing

Requirements:
    pip install essentia-tensorflow numpy mutagen

Models (place in scripts/models/):
    - discogs-effnet-bs64-1.pb
    - genre_discogs400-discogs-effnet-1.pb
    - genre_discogs400-discogs-effnet-1.json

Usage (WSL on Windows):
    wsl python3 /mnt/c/.../scripts/classify_genres.py --test 10
    wsl python3 /mnt/c/.../scripts/classify_genres.py --test 10 --seed 42
    wsl python3 /mnt/c/.../scripts/classify_genres.py --dry-run
    wsl python3 /mnt/c/.../scripts/classify_genres.py              # full run
    wsl python3 /mnt/c/.../scripts/classify_genres.py --skip-existing
"""

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 1: Imports & Constants
# ═══════════════════════════════════════════════════════════════════════════════

import argparse
import json
import random
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
MUSIC_BIB = PROJECT_ROOT / "musicBib.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "genreClassification.json"
MODELS_DIR = SCRIPT_DIR / "models"

EMBEDDING_MODEL_PATH = MODELS_DIR / "discogs-effnet-bs64-1.pb"
CLASSIFICATION_MODEL_PATH = MODELS_DIR / "genre_discogs400-discogs-effnet-1.pb"
METADATA_FILE_PATH = MODELS_DIR / "genre_discogs400-discogs-effnet-1.json"

SAMPLE_RATE = 16000
DEFAULT_SEGMENT_DURATION = 30
MIN_SEGMENT_SECONDS = 2


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2: CLI Argument Parser
# ═══════════════════════════════════════════════════════════════════════════════

def parse_args():
    parser = argparse.ArgumentParser(
        description="Genre classification pipeline using Essentia Discogs-EfficientNet (400 classes)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 classify_genres.py --test 10 --seed 42   # Test on 10 random tracks
  python3 classify_genres.py --dry-run             # Preview without inference
  python3 classify_genres.py                       # Full library run
  python3 classify_genres.py --skip-existing       # Resume interrupted run
        """,
    )
    parser.add_argument("--test", type=int, default=None, metavar="N",
                        help="Analyze only N random unique tracks (test mode)")
    parser.add_argument("--seed", type=int, default=None,
                        help="Random seed for reproducible test selection")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview what would be analyzed without running inference")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip tracks already classified in output JSON")
    parser.add_argument("--no-embed-tags", action="store_true",
                        help="Skip writing genre metadata to audio files")
    parser.add_argument("--top-n", type=int, default=5,
                        help="Number of top genres to include in results (default: 5)")
    parser.add_argument("--threshold", type=float, default=0.05,
                        help="Minimum confidence threshold for genre inclusion (default: 0.05)")
    parser.add_argument("--segment-duration", type=int, default=DEFAULT_SEGMENT_DURATION,
                        help="Audio segment length in seconds (default: 30)")
    parser.add_argument("--output", type=str, default=None,
                        help=f"Output JSON path (default: {DEFAULT_OUTPUT.name})")
    return parser.parse_args()


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3: Logging / Verbosity Utilities
# ═══════════════════════════════════════════════════════════════════════════════

class Logger:
    """Structured terminal output with sections and progress tracking."""

    BOLD = "\033[1m"
    DIM = "\033[2m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    RED = "\033[31m"
    CYAN = "\033[36m"
    RESET = "\033[0m"
    LINE = "═" * 55

    @staticmethod
    def header(title):
        print(f"\n{Logger.BOLD}{Logger.LINE}{Logger.RESET}")
        print(f"{Logger.BOLD}  {title}{Logger.RESET}")
        print(f"{Logger.BOLD}{Logger.LINE}{Logger.RESET}")

    @staticmethod
    def config(label, value):
        print(f"  {label:<18}{Logger.CYAN}{value}{Logger.RESET}")

    @staticmethod
    def section(step, total, title):
        print(f"\n{Logger.BOLD}[{step}/{total}] {title}{Logger.RESET}")

    @staticmethod
    def success(msg):
        print(f"  {Logger.GREEN}✓{Logger.RESET} {msg}")

    @staticmethod
    def warning(msg):
        print(f"  {Logger.YELLOW}⚠{Logger.RESET} {msg}")

    @staticmethod
    def error(msg):
        print(f"  {Logger.RED}✗{Logger.RESET} {msg}")

    @staticmethod
    def info(msg):
        print(f"  {msg}")

    @staticmethod
    def progress(current, total, detail, elapsed_s):
        rate = current / elapsed_s if elapsed_s > 0 else 0
        eta = (total - current) / rate if rate > 0 else 0
        bar_width = 20
        filled = int(bar_width * current / total) if total > 0 else 0
        bar = "█" * filled + "░" * (bar_width - filled)
        line = (
            f"  {Logger.DIM}[{bar}]{Logger.RESET} "
            f"{current}/{total} | {rate:.1f} tracks/s | "
            f"Elapsed: {elapsed_s:.0f}s | ETA: ~{eta:.0f}s"
        )
        print(f"\r{line}", end="", flush=True)

    @staticmethod
    def track_result(index, total, name, duration_str, segments, genre, confidence, std, time_s):
        confidence_str = f"{confidence:.2f}"
        std_str = f"±{std:.3f}" if std > 0 else ""
        print(
            f"  [{index:>{len(str(total))}}/{total}] "
            f"\"{name}\" ({duration_str}, {segments} seg) "
            f"→ {genre} ({confidence_str}{std_str}) "
            f"[{time_s:.1f}s]"
        )

    @staticmethod
    def track_error(index, total, name, error_msg):
        print(
            f"  {Logger.RED}[{index:>{len(str(total))}}/{total}] "
            f"\"{name}\" → ERROR: {error_msg}{Logger.RESET}"
        )


log = Logger()


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4: Version Deduplication
# ═══════════════════════════════════════════════════════════════════════════════

def deduplicate_versions(tracks):
    """
    Group tracks by (track_name, hierarchy.folder).
    Pick the most recently modified file as the canonical version to analyze.

    Returns:
        groups: dict of group_key -> {
            "analyze": track (latest version),
            "propagate_to": [other tracks in same group]
        }
        total_unique: number of unique track groups
    """
    grouped = {}
    for track in tracks:
        key = (
            track["logic"]["track_name"],
            track["logic"]["hierarchy"]["folder"],
        )
        grouped.setdefault(key, []).append(track)

    result = {}
    for key, group in grouped.items():
        group.sort(key=lambda t: t["file"].get("epoch_modified", 0), reverse=True)
        result[key] = {
            "analyze": group[0],
            "propagate_to": group[1:],
        }

    return result, len(result)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 5: Audio Analysis Engine (Essentia)
# ═══════════════════════════════════════════════════════════════════════════════

def load_genre_labels():
    """Load the 400 genre class labels from model metadata."""
    with open(METADATA_FILE_PATH, "r", encoding="utf-8") as f:
        meta = json.load(f)
    return meta["classes"]


def load_models():
    """Load Essentia TensorFlow models. Call once, reuse for all tracks."""
    import essentia.standard as es

    t0 = time.time()
    embedding_model = es.TensorflowPredictEffnetDiscogs(
        graphFilename=str(EMBEDDING_MODEL_PATH),
        output="PartitionedCall:1",
    )
    t1 = time.time()
    log.success(f"Embedding model loaded ({t1 - t0:.1f}s)")

    classification_model = es.TensorflowPredict2D(
        graphFilename=str(CLASSIFICATION_MODEL_PATH),
        input="serving_default_model_Placeholder",
        output="PartitionedCall:0",
    )
    t2 = time.time()
    log.success(f"Classification model loaded ({t2 - t1:.1f}s)")

    return embedding_model, classification_model


def analyze_track(audio_path, embedding_model, classification_model, segment_duration_s):
    """
    Analyze a single audio file.

    Returns dict with:
        prediction_mean: np.array (400,)
        prediction_std: np.array (400,)
        embedding_mean: np.array (200,)
        segment_predictions: list of np.array (400,) per segment
        segment_count: int
        duration_s: float
    """
    import essentia.standard as es

    audio = es.MonoLoader(filename=str(audio_path), sampleRate=SAMPLE_RATE)()
    duration_s = len(audio) / SAMPLE_RATE

    if duration_s < MIN_SEGMENT_SECONDS:
        raise ValueError(f"Audio too short ({duration_s:.1f}s < {MIN_SEGMENT_SECONDS}s minimum)")

    segment_samples = segment_duration_s * SAMPLE_RATE
    segments = []

    if len(audio) <= segment_samples:
        segments.append(audio)
    else:
        for start in range(0, len(audio), segment_samples):
            seg = audio[start:start + segment_samples]
            if len(seg) >= SAMPLE_RATE * MIN_SEGMENT_SECONDS:
                segments.append(seg)

    segment_predictions = []
    segment_embeddings = []

    for seg in segments:
        embeddings = embedding_model(seg)
        embedding_mean_seg = np.mean(embeddings, axis=0)
        segment_embeddings.append(embedding_mean_seg)

        predictions = classification_model(embeddings)
        prediction_mean_seg = np.mean(predictions, axis=0)
        segment_predictions.append(prediction_mean_seg)

    prediction_mean = np.mean(segment_predictions, axis=0)
    prediction_std = np.std(segment_predictions, axis=0) if len(segment_predictions) > 1 else np.zeros_like(prediction_mean)
    embedding_mean = np.mean(segment_embeddings, axis=0)

    return {
        "prediction_mean": prediction_mean,
        "prediction_std": prediction_std,
        "embedding_mean": embedding_mean,
        "segment_predictions": segment_predictions,
        "segment_count": len(segments),
        "duration_s": duration_s,
    }


def compute_uncertainty(segment_predictions, prediction_mean):
    """
    Compute uncertainty metrics from per-segment predictions.

    Returns dict with:
        segment_count: number of segments
        confidence_std: std of max-confidence across segments
        inter_segment_agreement: fraction of segments agreeing on top genre
        prediction_std_mean: mean per-class standard deviation
    """
    segment_count = len(segment_predictions)

    if segment_count <= 1:
        return {
            "segment_count": segment_count,
            "confidence_std": 0.0,
            "inter_segment_agreement": 1.0,
            "prediction_std_mean": 0.0,
        }

    max_confidences = [float(np.max(p)) for p in segment_predictions]
    confidence_std = float(np.std(max_confidences))

    overall_top = int(np.argmax(prediction_mean))
    agreements = sum(1 for p in segment_predictions if np.argmax(p) == overall_top)
    inter_segment_agreement = agreements / segment_count

    prediction_std = np.std(segment_predictions, axis=0)
    prediction_std_mean = float(np.mean(prediction_std))

    return {
        "segment_count": segment_count,
        "confidence_std": round(confidence_std, 6),
        "inter_segment_agreement": round(inter_segment_agreement, 4),
        "prediction_std_mean": round(prediction_std_mean, 6),
    }


def simplify_label(label):
    """Convert 'Electronic---Techno' to structured hierarchy."""
    if "---" in label:
        parent, sub = label.split("---", 1)
        return {"parent": parent.strip(), "sub": sub.strip(), "full": label}
    return {"parent": label.strip(), "sub": None, "full": label}


def build_genre_result(prediction_mean, prediction_std, labels, top_n, threshold):
    """
    Convert raw prediction vector to structured genre result.

    Returns dict with primary genre, top genres, parent scores, and full distribution.
    """
    scores = list(zip(labels, prediction_mean, prediction_std))
    scores.sort(key=lambda x: x[1], reverse=True)

    top_genres = []
    parent_scores = {}

    for label, score, std in scores:
        parsed = simplify_label(label)
        parent = parsed["parent"]
        parent_scores[parent] = parent_scores.get(parent, 0.0) + float(score)

        if float(score) >= threshold and len(top_genres) < top_n:
            top_genres.append({
                "genre": parsed["full"],
                "parent_genre": parent,
                "sub_genre": parsed["sub"],
                "confidence": round(float(score), 4),
                "confidence_std": round(float(std), 6),
            })

    parent_ranking = sorted(parent_scores.items(), key=lambda x: x[1], reverse=True)
    top_parent_scores = {k: round(v, 4) for k, v in parent_ranking[:8] if v >= threshold}

    full_distribution = {label: round(float(score), 6) for label, score, _ in scores if float(score) >= 0.001}

    primary = top_genres[0] if top_genres else None

    return {
        "primary_genre": primary["parent_genre"] if primary else None,
        "primary_sub_genre": primary["sub_genre"] if primary else None,
        "primary_confidence": primary["confidence"] if primary else 0.0,
        "top_genres": top_genres,
        "parent_genre_scores": top_parent_scores,
        "full_distribution": full_distribution,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 6: Metadata Tag Writer (Mutagen)
# ═══════════════════════════════════════════════════════════════════════════════

def write_genre_tag(audio_path, genre_result):
    """
    Write genre metadata to audio file using mutagen.
    Overwrites the genre tag with the primary predicted genre.

    Returns True on success, False on failure.
    """
    try:
        from mutagen import File as MutagenFile
        from mutagen.id3 import ID3, TCON
        from mutagen.mp3 import MP3
    except ImportError:
        log.warning("mutagen not installed — skipping tag writing")
        return False

    genre_str = genre_result["primary_genre"] or "Unknown"
    if genre_result["primary_sub_genre"]:
        genre_str += f" / {genre_result['primary_sub_genre']}"

    ext = audio_path.suffix.lower()

    try:
        if ext == ".mp3":
            audio = MP3(str(audio_path))
            if audio.tags is None:
                audio.add_tags()
            audio.tags.delall("TCON")
            audio.tags.add(TCON(encoding=3, text=[genre_str]))
            audio.save()
            return True

        elif ext == ".flac":
            from mutagen.flac import FLAC
            audio = FLAC(str(audio_path))
            audio["genre"] = genre_str
            audio.save()
            return True

        elif ext in (".m4a", ".mp4", ".aac"):
            from mutagen.mp4 import MP4
            audio = MP4(str(audio_path))
            audio["\xa9gen"] = [genre_str]
            audio.save()
            return True

        elif ext == ".ogg":
            from mutagen.oggvorbis import OggVorbis
            audio = OggVorbis(str(audio_path))
            audio["genre"] = [genre_str]
            audio.save()
            return True

        elif ext in (".wav", ".aiff"):
            audio = MutagenFile(str(audio_path))
            if audio is not None and audio.tags is not None:
                if hasattr(audio.tags, "delall"):
                    audio.tags.delall("TCON")
                    audio.tags.add(TCON(encoding=3, text=[genre_str]))
                    audio.save()
                    return True
            log.warning(f"Cannot write tags to {ext} file: {audio_path.name}")
            return False

        else:
            log.warning(f"Unsupported format for tag writing: {ext}")
            return False

    except Exception as e:
        log.warning(f"Tag write failed for {audio_path.name}: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 7: Output Schema Builder
# ═══════════════════════════════════════════════════════════════════════════════

def build_track_entry(track, analysis_result, genre_result, uncertainty, embedding, metadata_written, source_hash=None):
    """Build a single track entry for the output JSON."""
    analyzed = source_hash is None
    return {
        "analyzed": analyzed,
        "source_hash": source_hash,
        "track_name": track["logic"]["track_name"],
        "file_name": track["file"]["name"],
        "analysis": {
            "primary_genre": genre_result["primary_genre"],
            "primary_sub_genre": genre_result["primary_sub_genre"],
            "primary_confidence": genre_result["primary_confidence"],
            "top_genres": genre_result["top_genres"],
            "parent_genre_scores": genre_result["parent_genre_scores"],
            "uncertainty": uncertainty,
            "embedding": [round(float(x), 6) for x in embedding],
            "full_distribution": genre_result["full_distribution"],
        },
        "metadata_written": metadata_written,
        "analyzed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def load_existing_output(output_path):
    """Load existing genreClassification.json if present."""
    if output_path.exists():
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        except (json.JSONDecodeError, KeyError) as e:
            log.warning(f"Could not parse existing output ({e}), starting fresh")
    return None


def save_output(output_path, output_data):
    """Write output JSON atomically (write to temp, then rename)."""
    tmp_path = output_path.with_suffix(".json.tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    tmp_path.replace(output_path)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 8: Main Pipeline Orchestrator
# ═══════════════════════════════════════════════════════════════════════════════

def resolve_audio_path(track):
    """Resolve audio file path from track data (handles WSL and native paths)."""
    rel_path = track["file"]["path"].replace("\\", "/")
    full_path = PROJECT_ROOT / rel_path
    try:
        if full_path.exists():
            return full_path
    except OSError:
        pass
    return None


def format_duration(seconds):
    """Format seconds as M:SS."""
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"


def main():
    args = parse_args()
    output_path = Path(args.output) if args.output else DEFAULT_OUTPUT
    pipeline_start = time.time()

    # ── Load musicBib.json ──────────────────────────────────────────────────
    if not MUSIC_BIB.exists():
        log.error(f"musicBib.json not found at: {MUSIC_BIB}")
        sys.exit(1)

    with open(MUSIC_BIB, "r", encoding="utf-8") as f:
        music_bib = json.load(f)

    tracks = music_bib["items"]
    total_versions = len(tracks)

    # ── Version deduplication ───────────────────────────────────────────────
    groups, total_unique = deduplicate_versions(tracks)

    # ── Select tracks to analyze ────────────────────────────────────────────
    group_keys = list(groups.keys())

    if args.test is not None:
        if args.seed is not None:
            random.seed(args.seed)
        random.shuffle(group_keys)
        group_keys = group_keys[:args.test]

    # ── Check for existing results (idempotency) ───────────────────────────
    existing_data = load_existing_output(output_path)
    existing_hashes = set()
    if existing_data and args.skip_existing:
        existing_hashes = set(existing_data.get("tracks", {}).keys())

    # ── Filter tasks ────────────────────────────────────────────────────────
    tasks = []
    skipped_existing = 0
    skipped_no_file = 0

    for key in group_keys:
        group = groups[key]
        canonical = group["analyze"]
        canonical_hash = canonical["logic"]["hash_sha256"]

        if canonical_hash in existing_hashes:
            skipped_existing += 1
            continue

        audio_path = resolve_audio_path(canonical)
        if audio_path is None:
            skipped_no_file += 1
            continue

        tasks.append((key, group, audio_path))

    # ── Validate models ─────────────────────────────────────────────────────
    if not args.dry_run:
        missing_models = []
        for path, name in [
            (EMBEDDING_MODEL_PATH, "discogs-effnet-bs64-1.pb"),
            (CLASSIFICATION_MODEL_PATH, "genre_discogs400-discogs-effnet-1.pb"),
            (METADATA_FILE_PATH, "genre_discogs400-discogs-effnet-1.json"),
        ]:
            if not path.exists():
                missing_models.append(name)
        if missing_models:
            log.error("Missing model files:")
            for name in missing_models:
                log.error(f"  {MODELS_DIR / name}")
            log.info("Download from: https://essentia.upf.edu/models.html")
            sys.exit(1)

    # ── Print configuration header ──────────────────────────────────────────
    log.header("GENRE CLASSIFICATION PIPELINE v2")
    mode_str = f"TEST ({args.test} random tracks"
    if args.test:
        mode_str += f", seed={args.seed}" if args.seed else ", random"
        mode_str += ")"
    else:
        mode_str = "FULL LIBRARY"
    log.config("Mode:", mode_str)
    log.config("Library:", f"{total_versions} versions → {total_unique} unique tracks")
    log.config("To analyze:", f"{len(tasks)}")
    if skipped_existing:
        log.config("Skipped (existing):", f"{skipped_existing}")
    if skipped_no_file:
        log.config("Skipped (no file):", f"{skipped_no_file}")
    log.config("Models:", "discogs-effnet + genre_discogs400 (400 classes)")
    log.config("Segment duration:", f"{args.segment_duration}s")
    log.config("Output:", str(output_path.name))
    tag_status = "DISABLED" if args.no_embed_tags else "ENABLED (overwrite genre)"
    log.config("Tag embedding:", tag_status)
    print(f"{Logger.BOLD}{Logger.LINE}{Logger.RESET}")

    # ── Dry run ─────────────────────────────────────────────────────────────
    if args.dry_run:
        log.section(1, 1, "DRY RUN — Would analyze:")
        for i, (key, group, audio_path) in enumerate(tasks):
            canonical = group["analyze"]
            propagate_count = len(group["propagate_to"])
            extra = f" (+{propagate_count} versions)" if propagate_count > 0 else ""
            print(f"  [{i+1:>{len(str(len(tasks)))}}/{len(tasks)}] "
                  f"\"{canonical['logic']['track_name']}\"{extra} → {audio_path.name}")
        print(f"\n  Total: {len(tasks)} tracks to analyze")
        total_propagated = sum(len(groups[k]["propagate_to"]) for k, _, _ in tasks)
        print(f"  Versions to propagate: {total_propagated}")
        return

    # ── Load models ─────────────────────────────────────────────────────────
    log.section(1, 3, "Loading models...")
    labels = load_genre_labels()
    log.success(f"{len(labels)} genre labels loaded")

    embedding_model, classification_model = load_models()

    # ── Analyze tracks ──────────────────────────────────────────────────────
    log.section(2, 3, "Analyzing tracks...")
    results = {}
    errors = []
    tag_successes = 0
    tag_failures = 0
    analysis_start = time.time()

    try:
        for i, (key, group, audio_path) in enumerate(tasks):
            canonical = group["analyze"]
            track_name = canonical["logic"]["track_name"]
            canonical_hash = canonical["logic"]["hash_sha256"]
            track_start = time.time()

            try:
                analysis = analyze_track(
                    audio_path, embedding_model, classification_model, args.segment_duration
                )

                uncertainty = compute_uncertainty(
                    analysis["segment_predictions"], analysis["prediction_mean"]
                )

                genre_result = build_genre_result(
                    analysis["prediction_mean"],
                    analysis["prediction_std"],
                    labels,
                    args.top_n,
                    args.threshold,
                )

                # Write tag to canonical file
                metadata_written = False
                if not args.no_embed_tags:
                    metadata_written = write_genre_tag(audio_path, genre_result)
                    if metadata_written:
                        tag_successes += 1
                    else:
                        tag_failures += 1

                # Build entry for canonical track
                entry = build_track_entry(
                    canonical, analysis, genre_result, uncertainty,
                    analysis["embedding_mean"], metadata_written
                )
                results[canonical_hash] = entry

                # Propagate to other versions
                for other_track in group["propagate_to"]:
                    other_hash = other_track["logic"]["hash_sha256"]
                    other_path = resolve_audio_path(other_track)
                    other_tag_written = False
                    if not args.no_embed_tags and other_path:
                        other_tag_written = write_genre_tag(other_path, genre_result)
                        if other_tag_written:
                            tag_successes += 1
                        else:
                            tag_failures += 1

                    other_entry = build_track_entry(
                        other_track, analysis, genre_result, uncertainty,
                        analysis["embedding_mean"], other_tag_written,
                        source_hash=canonical_hash,
                    )
                    results[other_hash] = other_entry

                track_time = time.time() - track_start
                primary_genre = genre_result["primary_genre"] or "Unknown"
                primary_sub = genre_result["primary_sub_genre"]
                genre_display = f"{primary_genre}/{primary_sub}" if primary_sub else primary_genre
                confidence = genre_result["primary_confidence"]
                conf_std = uncertainty["confidence_std"]

                log.track_result(
                    i + 1, len(tasks), track_name,
                    format_duration(analysis["duration_s"]),
                    analysis["segment_count"],
                    genre_display, confidence, conf_std, track_time,
                )

            except Exception as e:
                track_time = time.time() - track_start
                error_msg = str(e)
                errors.append({
                    "hash": canonical_hash,
                    "file": canonical["file"]["name"],
                    "track_name": track_name,
                    "error": error_msg,
                    "traceback": traceback.format_exc(),
                })
                log.track_error(i + 1, len(tasks), track_name, error_msg)

            # Print progress bar every 5 tracks (on stderr to not mix with results)
            if (i + 1) % 5 == 0 and (i + 1) < len(tasks):
                elapsed = time.time() - analysis_start
                log.progress(i + 1, len(tasks), "", elapsed)
                print()  # newline after progress bar

    except KeyboardInterrupt:
        print()
        log.warning(f"Interrupted! Saving {len(results)} partial results...")

    analysis_elapsed = time.time() - analysis_start

    # ── Write output ────────────────────────────────────────────────────────
    log.section(3, 3, "Writing results...")

    # Merge with existing data if present
    if existing_data and "tracks" in existing_data:
        merged_tracks = existing_data["tracks"]
        merged_tracks.update(results)
    else:
        merged_tracks = results

    total_analyzed = sum(1 for v in merged_tracks.values() if v.get("analyzed", False))
    total_propagated = sum(1 for v in merged_tracks.values() if not v.get("analyzed", True))

    output_data = {
        "info": {
            "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": "discogs-effnet-bs64 + genre_discogs400",
            "model_classes": len(labels),
            "sample_rate_hz": SAMPLE_RATE,
            "segment_duration_s": args.segment_duration,
            "confidence_threshold": args.threshold,
            "top_n": args.top_n,
            "total_unique_tracks_in_library": total_unique,
            "total_versions_in_library": total_versions,
            "total_analyzed": total_analyzed,
            "total_propagated": total_propagated,
            "total_entries": len(merged_tracks),
            "execution_time_s": round(time.time() - pipeline_start, 1),
            "errors_count": len(errors),
        },
        "tracks": merged_tracks,
    }

    if errors:
        output_data["errors"] = [
            {"hash": e["hash"], "file": e["file"], "track_name": e["track_name"], "error": e["error"]}
            for e in errors
        ]

    save_output(output_path, output_data)
    log.success(f"{output_path.name}: {total_analyzed} analyzed + {total_propagated} propagated = {len(merged_tracks)} entries")

    if not args.no_embed_tags:
        total_tag_attempts = tag_successes + tag_failures
        if total_tag_attempts > 0:
            log.success(f"Audio tags: {tag_successes}/{total_tag_attempts} written" +
                        (f", {tag_failures} failed" if tag_failures else ""))

    # ── Summary ─────────────────────────────────────────────────────────────
    total_time = time.time() - pipeline_start
    log.header("SUMMARY")
    log.config("Total time:", f"{total_time:.1f}s")
    log.config("Analyzed:", f"{sum(1 for v in results.values() if v.get('analyzed'))} tracks")
    propagated_this_run = sum(1 for v in results.values() if not v.get("analyzed", True))
    if propagated_this_run:
        log.config("Propagated:", f"{propagated_this_run} versions")
    if errors:
        log.config("Errors:", f"{len(errors)}")
    if not args.no_embed_tags:
        log.config("Tags written:", f"{tag_successes}" + (f" ({tag_failures} failed)" if tag_failures else ""))
    log.config("Output file:", str(output_path))
    log.config("Output size:", f"{output_path.stat().st_size / 1024:.1f} KB")

    # Genre distribution
    genre_counts = {}
    for entry in results.values():
        if entry.get("analyzed"):
            pg = entry["analysis"]["primary_genre"]
            if pg:
                genre_counts[pg] = genre_counts.get(pg, 0) + 1

    if genre_counts:
        print(f"\n  {Logger.BOLD}Genre Distribution:{Logger.RESET}")
        analyzed_count = sum(genre_counts.values())
        for genre, count in sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:12]:
            pct = count * 100 // analyzed_count if analyzed_count > 0 else 0
            bar = "█" * max(1, pct // 4)
            print(f"    {genre:<20} {count:>3} ({pct:>2}%) {bar}")

    print(f"\n{Logger.BOLD}{Logger.LINE}{Logger.RESET}")

    # Print errors detail if any
    if errors:
        print(f"\n  {Logger.BOLD}Error Details:{Logger.RESET}")
        for err in errors[:10]:
            log.error(f"{err['file']}: {err['error']}")
        if len(errors) > 10:
            log.info(f"  ... and {len(errors) - 10} more (see output JSON 'errors' field)")

    sys.exit(1 if errors and not results else 0)


if __name__ == "__main__":
    main()
