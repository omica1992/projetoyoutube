import sys
import json
import os

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def main():
    audio = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "small"
    language = sys.argv[3] if len(sys.argv) > 3 else "pt"

    from faster_whisper import WhisperModel
    from huggingface_hub.errors import LocalEntryNotFoundError

    print(f"carregando modelo {model_size}...", file=sys.stderr, flush=True)
    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8", local_files_only=True)
    except LocalEntryNotFoundError:
        model = WhisperModel(model_size, device="cpu", compute_type="int8")

    print("transcrevendo...", file=sys.stderr, flush=True)
    segments, info = model.transcribe(
        audio,
        language=None if language in ("auto", "") else language,
        word_timestamps=True,
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=False,
    )

    out_segments = []
    plain = []
    for seg in segments:
        words = []
        for w in getattr(seg, "words", None) or []:
            words.append(
                {
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                    "word": w.word,
                    "prob": round(float(w.probability or 0), 3),
                }
            )
        text = (seg.text or "").strip()
        if not text:
            continue
        plain.append(text)
        out_segments.append(
            {
                "start": round(float(seg.start), 3),
                "end": round(float(seg.end), 3),
                "text": text,
                "words": words,
            }
        )

    result = {
        "language": getattr(info, "language", language),
        "language_probability": round(float(getattr(info, "language_probability", 0) or 0), 3),
        "duration": round(float(getattr(info, "duration", 0) or 0), 3),
        "text": " ".join(plain),
        "segments": out_segments,
    }
    print(json.dumps(result, ensure_ascii=False))
    print("ok", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
