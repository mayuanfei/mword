#!/usr/bin/env python3
"""Build exam wordbooks from word membership and licensed lexical extracts.

Raw ECDICT meanings/examples are deliberately not imported. This script only
uses its word and exam-tag columns; Wiktionary glosses keep separate provenance.
No network, API key, or third-party Python dependency is needed at build time.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
BOOKS = {
    "cet4": ("大学英语四级", "cet4"),
    "cet6": ("大学英语六级", "cet6"),
    "postgraduate": ("考研词汇", "ky"),
}
SPELLING_CORRECTIONS = {"reservior": "reservoir"}
POS_NAMES = {
    "noun": "n.", "verb": "v.", "adj": "adj.", "adv": "adv.",
    "prep": "prep.", "pron": "pron.", "conj": "conj.", "det": "det.",
    "article": "art.", "num": "num.", "intj": "interj.",
    "name": "专有名词", "phrase": "短语", "particle": "小品词",
}
DISFAVORED = {"archaic", "obsolete", "rare", "dated", "offensive", "vulgar"}
FORM_MARKERS = ("的複數", "的复数", "的過去式", "的过去式", "的過去分詞", "的过去分词",
                "的現在分詞", "的现在分词", "的第三人稱", "的第三人称", "的變體", "的变体")


def normalize(word: str) -> str:
    value = unicodedata.normalize("NFKC", word).strip().lower()
    value = value.replace("’", "'").replace("‘", "'")
    value = value.replace("‐", "-").replace("‑", "-").replace("–", "-")
    return re.sub(r"\s+", " ", value)


def dump(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_jsonl(path: Path):
    with path.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if line.strip():
                try:
                    yield json.loads(line)
                except json.JSONDecodeError as error:
                    raise ValueError(f"Incomplete/invalid JSONL: {path}:{line_number}") from error


try:
    from opencc import OpenCC
    _T2S = OpenCC("t2s")
except ImportError:
    _T2S = None


def clean_gloss(gloss: str) -> str:
    text = re.sub(r"\s+", " ", gloss).strip()
    # Empty template/error entries are not turned into apparent definitions.
    if not re.search(r"[\u3400-\u9fff]", text) or "Lua" in text or "模板:" in text:
        return ""
    if _T2S is not None:
        text = _T2S.convert(text)
    return text


def extract(ecdict: Path, dictionaries: list[Path], cedict: Path | None = None) -> None:
    """Freeze the small relevant source subsets, preserving checksums upstream."""
    membership: dict[str, set[str]] = defaultdict(set)
    original_rows = Counter()
    normalized_duplicates = Counter()
    invalid_rows = []
    corrections = []
    total_rows = 0
    with ecdict.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            total_rows += 1
            tags = set((row.get("tag") or "").split())
            selected = tags.intersection({"cet4", "cet6", "ky"})
            if not selected:
                continue
            word = normalize(row["word"])
            if word in SPELLING_CORRECTIONS:
                corrected = SPELLING_CORRECTIONS[word]
                corrections.append({"sourceWord": word, "lemma": corrected, "tags": sorted(selected),
                                    "reason": "源词表误拼，统一为可核验的标准词条 reservoir",
                                    "sourceUrl": "https://zh.wiktionary.org/wiki/reservoir"})
                word = corrected
            if not word or not re.fullmatch(r"[a-z][a-z\s.'-]*", word):
                invalid_rows.append({"word": row["word"], "tags": sorted(selected)})
                continue
            for tag in selected:
                original_rows[tag] += 1
                if tag in membership[word]:
                    normalized_duplicates[tag] += 1
            membership[word].update(selected)

    lexical: dict[str, list[dict]] = defaultdict(list)
    pronunciations: dict[str, list[dict]] = defaultdict(list)
    dictionary_counts = []
    for dictionary in dictionaries:
        count = 0
        for entry in read_jsonl(dictionary):
            count += 1
            word = normalize(entry.get("word", ""))
            if word not in membership or entry.get("lang_code") != "en":
                continue
            sounds = [sound["ipa"] for sound in entry.get("sounds", []) if sound.get("ipa")]
            if sounds:
                pronunciations[word].append({
                    "phonetic": sounds[0], "heading": entry.get("lang", ""),
                    "sourceUrl": "https://zh.wiktionary.org/wiki/" + quote(entry["word"], safe=""),
                })
            for order, sense in enumerate(entry.get("senses", [])):
                glosses = [clean_gloss(gloss) for gloss in sense.get("glosses", [])]
                glosses = [gloss for gloss in glosses if gloss]
                if not glosses:
                    continue
                lexical[word].append({
                    "sourceWord": entry["word"],
                    "sourceUrl": "https://zh.wiktionary.org/wiki/" + quote(entry["word"], safe=""),
                    "sourceSenseId": sense.get("id", ""),
                    "partOfSpeech": entry.get("pos", "unknown"),
                    "glosses": glosses,
                    "phonetic": sounds[0] if sounds else "",
                    "tags": sense.get("tags", []),
                    "order": order,
                    # Prefer the simplified-heading dataset when an entry occurs in both.
                    "heading": entry.get("lang", ""),
                })
        dictionary_counts.append({"filename": dictionary.name, "sha256": sha256(dictionary), "rows": count})

    dump(ROOT / "sources" / "exam-word-membership.json", {
        "sourceUrl": "https://github.com/skywind3000/ECDICT",
        "license": "MIT",
        "selectedFields": ["word", "tag"],
        "sourceSha256": sha256(ecdict),
        "sourceRows": total_rows,
        "originalTaggedRows": dict(original_rows),
        "normalizedDuplicatesRemoved": dict(normalized_duplicates),
        "invalidTaggedRows": invalid_rows,
        "spellingCorrections": corrections,
        "words": [{"lemma": word, "tags": sorted(tags)} for word, tags in sorted(membership.items())],
    })
    dump(ROOT / "sources" / "wiktionary-glosses.json", {
        "sourceUrl": "https://kaikki.org/zhwiktionary/",
        "dumpDate": "2026-10-01",
        "extractionDate": "2026-10-02",
        "license": "CC-BY-SA-4.0",
        "attribution": "中文维基词典贡献者；Kaikki.org / Tatu Ylonen（Wiktextract 提取）",
        "changes": "仅保留三套预设词表命中的英语释义、词性与 IPA，排除音频、例句和词源。",
        "sourceFiles": dictionary_counts,
        "entries": dict(sorted(lexical.items())),
        "pronunciations": dict(sorted(pronunciations.items())),
    })
    if cedict:
        reverse = defaultdict(list)
        with gzip.open(cedict, "rt", encoding="utf-8") as source:
            for line in source:
                if line.startswith("#"):
                    continue
                match = re.match(r"(\S+) (\S+) \[(.+?)\] /(.+)/$", line.strip())
                if not match:
                    continue
                traditional, simplified, pinyin, meanings = match.groups()
                # Avoid name/reference entries: reversed glosses are only a
                # supplemental translation candidate, not a full definition.
                if len(simplified) < 2 or re.search(r"\b(surname|variant|abbr\.|CL:|see |old name)\b", meanings):
                    continue
                for gloss in meanings.split("/"):
                    word = normalize(gloss.removeprefix("to "))
                    if word in membership and gloss in (word, "to " + word):
                        reverse[word].append({"meaning": simplified, "pinyin": pinyin,
                                              "englishGloss": gloss, "traditional": traditional})
        dump(ROOT / "sources" / "cedict-reverse-glosses.json", {
            "sourceUrl": "https://www.mdbg.net/chinese/dictionary?page=cc-cedict",
            "license": "CC-BY-SA-4.0", "sourceSha256": sha256(cedict),
            "attribution": "CC-CEDICT 贡献者；MDBG 分发",
            "changes": "只反查与英语词条完全一致的英文释义或 to + 动词，不包含解释性近似匹配。",
            "entries": dict(sorted(reverse.items())),
        })


def choose_definition(entries: list[dict]) -> dict:
    candidates = []
    for entry in entries:
        for gloss in entry["glosses"]:
            tags = set(entry.get("tags", []))
            score = (
                bool(tags.intersection(DISFAVORED)),
                any(marker in gloss for marker in FORM_MARKERS),
                entry.get("partOfSpeech") == "unknown",
                len(gloss) > 160,
                entry.get("heading") != "英语",
                entry.get("order", 0),
            )
            candidates.append((score, gloss, entry))
    if not candidates:
        return {"meaning": "", "definitionStatus": "missing"}
    _, gloss, entry = min(candidates, key=lambda candidate: candidate[0])
    selected = {
        "meaning": gloss,
        "definitionStatus": "source-extracted",
        "definitionSource": "中文维基词典",
        "definitionSourceUrl": entry["sourceUrl"],
        "definitionLicense": "CC-BY-SA-4.0",
        "sourceSenseId": entry.get("sourceSenseId", ""),
    }
    pos = POS_NAMES.get(entry.get("partOfSpeech", ""), "")
    if pos:
        selected["partOfSpeech"] = pos
    if entry.get("phonetic"):
        selected["phonetic"] = entry["phonetic"]
    return selected


def build() -> None:
    membership = json.loads((ROOT / "sources" / "exam-word-membership.json").read_text())
    source = json.loads((ROOT / "sources" / "wiktionary-glosses.json").read_text())
    additions_path = ROOT / "sources" / "editorial-glosses.json"
    editorial_tsv = ROOT / "sources" / "editorial-glosses.tsv"
    if editorial_tsv.exists():
        entries = {}
        for line_number, line in enumerate(editorial_tsv.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) != 2 or not parts[0] or not parts[1] or parts[0] in entries:
                raise ValueError(f"Invalid editorial TSV row: {line_number}")
            entries[parts[0]] = {"meaning": parts[1]}
        dump(additions_path, entries)
    additions = json.loads(additions_path.read_text()) if additions_path.exists() else {}
    cedict_path = ROOT / "sources" / "cedict-reverse-glosses.json"
    cedict = json.loads(cedict_path.read_text()) if cedict_path.exists() else {"entries": {}}
    notes_path = ROOT / "sources" / "usage-notes.json"
    notes = json.loads(notes_path.read_text()) if notes_path.exists() else {}
    shared = {}
    for entry in membership["words"]:
        lemma = entry["lemma"]
        word_id = "lemma:" + lemma
        definition = choose_definition(source["entries"].get(lemma, []))
        if not definition["meaning"] and lemma in cedict["entries"]:
            matches = cedict["entries"][lemma]
            translations = sorted({entry["meaning"] for entry in matches}, key=lambda value: (len(value), value))
            definition = {
                "meaning": "；".join(translations[:3]),
                "definitionStatus": "reverse-gloss-draft",
                "definitionSource": "CC-CEDICT 精确释义反查（待校对）",
                "definitionSourceUrl": cedict["sourceUrl"],
                "definitionLicense": "CC-BY-SA-4.0",
            }
        if lemma in additions:
            definition = {
                "meaning": additions[lemma]["meaning"],
                "definitionStatus": "editorial-draft",
                "definitionSource": "mword 基础释义整理",
                "definitionLicense": "CC-BY-SA-4.0",
            }
            if additions[lemma].get("partOfSpeech"):
                definition["partOfSpeech"] = additions[lemma]["partOfSpeech"]
        pronunciation = source.get("pronunciations", {}).get(lemma, [])
        if not definition.get("phonetic") and pronunciation:
            selected = min(pronunciation, key=lambda value: value.get("heading") != "英语")
            definition["phonetic"] = selected["phonetic"]
            definition["pronunciationSourceUrl"] = selected["sourceUrl"]
        if lemma in notes:
            definition["usageNote"] = notes[lemma]["note"]
            definition["usageNoteSourceUrl"] = notes[lemma].get("sourceUrl", "")
            if notes[lemma].get("learningStatus"):
                definition["learningStatus"] = notes[lemma]["learningStatus"]
        shared[lemma] = {"id": word_id, "senseId": word_id + ":core", "lemma": lemma, **definition}

    report = {
        "version": "2026-10-09.1",
        "sourceScope": "ECDICT 的 cet4、cet6、ky 标签全量；非最新官方大纲认证",
        "uniqueWordsAcrossBooks": len(shared),
        "books": [],
        "missingMeanings": sorted(word for word, value in shared.items() if not value["meaning"]),
        "meaningStatuses": dict(Counter(word["definitionStatus"] for word in shared.values())),
        "normalizedDuplicatesRemoved": membership["normalizedDuplicatesRemoved"],
        "invalidTaggedRows": membership["invalidTaggedRows"],
        "spellingCorrections": membership.get("spellingCorrections", []),
        "usageNotes": notes,
    }
    for book_id, (name, tag) in BOOKS.items():
        words = [shared[entry["lemma"]] for entry in membership["words"] if tag in entry["tags"]]
        assert len({word["id"] for word in words}) == len(words)
        book = {
            "id": book_id,
            "name": name,
            "description": "开放词表初版：按考试标签整理，提供基础释义；非最新官方大纲认证，义项仍需校对。",
            "version": report["version"],
            "sourceUrl": "https://github.com/skywind3000/ECDICT",
            "license": "CC-BY-SA-4.0 (glosses); MIT (word membership)",
            "wordCount": len(words),
            "attribution": ["ECDICT / skywind3000（仅单词与考试标签，MIT）", source["attribution"],
                            "CC-CEDICT 贡献者；MDBG 分发（少量精确释义反查，CC BY-SA 4.0）"],
            "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
            "words": words,
        }
        dump(ROOT / "books" / f"{book_id}.json", book)
        report["books"].append({
            "id": book_id,
            "wordCount": len(words),
            "duplicateIds": 0,
            "missingMeaningCount": sum(not word["meaning"] for word in words),
            "missingPhoneticCount": sum(not word.get("phonetic") for word in words),
            "meaningStatuses": dict(Counter(word["definitionStatus"] for word in words)),
            "longMeaningCount": sum(len(word["meaning"]) > 160 for word in words),
            "meaningCoverage": round(sum(bool(word["meaning"]) for word in words) / len(words), 6),
            "phoneticCoverage": round(sum(bool(word.get("phonetic")) for word in words) / len(words), 6),
        })
    dump(ROOT / "quality-report.json", report)
    print(json.dumps({key: value for key, value in report.items() if key != "missingMeanings"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ecdict", type=Path, help="Raw complete ECDICT CSV, only used during source extraction")
    parser.add_argument("--wiktionary", type=Path, nargs="+", help="Complete Kaikki Chinese-edition English JSONL files")
    parser.add_argument("--cedict", type=Path, help="Optional CC-CEDICT gzip for exact-gloss reverse lookup")
    args = parser.parse_args()
    if args.ecdict:
        if not args.wiktionary:
            parser.error("--wiktionary is required when extracting sources")
        extract(args.ecdict, args.wiktionary, args.cedict)
    build()
