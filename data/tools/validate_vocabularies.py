#!/usr/bin/env python3
"""Validate shipped wordbooks against the frozen source subsets."""

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    membership = load(ROOT / "sources" / "exam-word-membership.json")
    assert membership["selectedFields"] == ["word", "tag"], "Unreviewed ECDICT content imported"
    lexical_source = load(ROOT / "sources" / "wiktionary-glosses.json")
    definitions = lexical_source["entries"]
    editorial_file = ROOT / "sources" / "editorial-glosses.json"
    editorial = load(editorial_file) if editorial_file.exists() else {}
    reverse_file = ROOT / "sources" / "cedict-reverse-glosses.json"
    reverse = load(reverse_file)["entries"] if reverse_file.exists() else {}
    shared = {}
    for book_id, tag in (("cet4", "cet4"), ("cet6", "cet6"), ("postgraduate", "ky")):
        book = load(ROOT / "books" / (book_id + ".json"))
        words = book["words"]
        assert book["id"] == book_id
        assert book["wordCount"] == len(words)
        assert len({word["id"] for word in words}) == len(words), "Duplicate word id"
        expected = {word["lemma"] for word in membership["words"] if tag in word["tags"]}
        assert {word["lemma"] for word in words} == expected, "Book is not complete for source tags"
        assert "MIT" in book["license"] and "CC-BY-SA-4.0" in book["license"]
        for word in words:
            assert word["id"] == "lemma:" + word["lemma"]
            assert word["lemma"] == word["lemma"].lower().strip()
            assert word["senseId"] == word["id"] + ":core"
            assert word["meaning"] or word["definitionStatus"] == "missing"
            assert not word.get("example"), "Example sentence has not undergone source rights review"
            assert not word.get("audio"), "Audio has a separate license"
            if word["id"] in shared:
                assert word == shared[word["id"]], "Cross-book word content/identity differs"
            shared[word["id"]] = word
            if word["definitionStatus"] == "source-extracted":
                assert any(word["meaning"] in source["glosses"] and
                           word["definitionSourceUrl"] == source["sourceUrl"]
                           for source in definitions[word["lemma"]]), "Gloss provenance broken"
            elif word["definitionStatus"] == "editorial-draft":
                assert word["meaning"] == editorial[word["lemma"]]["meaning"]
            elif word["definitionStatus"] == "reverse-gloss-draft":
                assert set(word["meaning"].split("；")) <= {entry["meaning"] for entry in reverse[word["lemma"]]}
            else:
                assert word["definitionStatus"] == "missing"
            if word.get("pronunciationSourceUrl"):
                assert any(word["phonetic"] == value["phonetic"] and
                           word["pronunciationSourceUrl"] == value["sourceUrl"]
                           for value in lexical_source["pronunciations"][word["lemma"]]), "IPA provenance broken"
        print(f"{book_id}: {len(words)} words, {sum(not word['meaning'] for word in words)} missing meanings, source membership verified")
    report = load(ROOT / "quality-report.json")
    assert report["uniqueWordsAcrossBooks"] == len(shared)
    assert report["meaningStatuses"] == dict(Counter(word["definitionStatus"] for word in shared.values()))
    assert report["missingMeanings"] == sorted(word["lemma"] for word in shared.values() if not word["meaning"])
    for name in ("ECDICT-MIT.txt", "CC-BY-SA-4.0.txt", "ATTRIBUTION.md"):
        assert (ROOT / "licenses" / name).is_file(), f"Missing license/attribution: {name}"
    assert "lemma:reservior" not in shared, "Source spelling correction was not applied"
    assert "lemma:reservoir" in shared
    for article in load(ROOT / "sample-articles.json"):
        assert article["aiQuotaCost"] == 0
        assert len(article["paragraphs"]) == len(article["paragraphTranslations"])
        for word_id in article["targetWordIds"]:
            assert word_id in shared, f"Unknown sample target word {word_id}"
            assert shared[word_id]["lemma"] in article["content"], f"Missing article target word {word_id}"
        for question in article["questions"]:
            assert 0 <= question["correctAnswerIndex"] < len(question["choices"])
    print(f"PASS: {len(shared)} shared stable word ids, license notices and quality report verified")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, KeyError, ValueError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1) from error
