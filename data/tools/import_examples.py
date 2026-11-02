#!/usr/bin/env python3
"""从 ManyThings/Tatoeba 冻结带逐句署名的中英例句，不调用付费 AI。"""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def meaning_keywords(meaning: str) -> set[str]:
    cleaned = re.sub(r"（[^）]*）|\([^)]*\)|\[[^\]]*\]", " ", meaning or "")
    keywords = set()
    for part in re.split(r"[；;，,、/|\s]+", cleaned):
        cjk = "".join(re.findall(r"[\u3400-\u9fff]+", part))
        if not cjk:
            continue
        keywords.add(cjk)
        for size in (2, 3):
            for idx in range(max(0, len(cjk) - size + 1)):
                keywords.add(cjk[idx:idx + size])
    return keywords


def load_meanings() -> dict[str, str]:
    meanings: dict[str, str] = {}
    for book_name in ("cet4.json", "cet6.json", "postgraduate.json"):
        book_path = ROOT / "books" / book_name
        if book_path.exists():
            for word in json.loads(book_path.read_text(encoding="utf-8")).get("words", []):
                if word.get("lemma") and word.get("meaning"):
                    meanings[word["lemma"]] = word["meaning"]
    return meanings


def select_examples(archive, lemmas, simplify, meanings=None):
    selected = {}
    keywords_by_lemma = {lemma: meaning_keywords(meanings.get(lemma, "")) for lemma in lemmas} if meanings else {}
    with zipfile.ZipFile(archive) as source:
        for line in source.read('cmn.txt').decode('utf-8-sig').splitlines():
            columns = line.split('\t')
            if len(columns) != 3:
                continue
            english, chinese, attribution = columns
            tokens = re.findall(r"[A-Za-z]+(?:['-][A-Za-z]+)*", english.lower())
            owners = re.findall(r'#(\d+) \(([^)]+)\)', attribution)
            if not (5 <= len(tokens) <= 18 and len(english) <= 180 and
                    re.search(r'[\u3400-\u9fff]', chinese) and len(owners) == 2 and attribution.startswith('CC-BY 2.0 (France)')):
                continue
            simplified = simplify(chinese)
            # 优先选取中文翻译命中基础释义关键词的句子，其次选取较短完整句；仍保留待核对标记。
            base_score = (abs(len(tokens) - 9), len(english), english, chinese, attribution)
            for lemma in lemmas.intersection(tokens):
                keywords = keywords_by_lemma.get(lemma)
                matched = bool(keywords) and any(keyword in simplified for keyword in keywords)
                score = (not matched, *base_score)
                if lemma in selected and selected[lemma][0] <= score:
                    continue
                selected[lemma] = (score, {
                    'example': english, 'exampleTranslation': simplified,
                    'exampleSource': {
                        'name': 'Tatoeba / ManyThings',
                        'url': f'https://tatoeba.org/en/sentences/show/{owners[0][0]}',
                        'translationUrl': f'https://tatoeba.org/en/sentences/show/{owners[1][0]}',
                        'attribution': attribution,
                        'license': 'CC-BY-2.0-FR',
                        'licenseUrl': 'https://creativecommons.org/licenses/by/2.0/fr/',
                        'status': 'corpus-draft',
                        'changes': '按目标词原形及基础释义关键词优先选句；中文经 OpenCC 转为简体。句对翻译及与基础释义的对应关系待核对。',
                    },
                })
    return {lemma: value[1] for lemma, value in sorted(selected.items())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path, help='完整 cmn-eng.zip，下载自 https://www.manythings.org/anki/')
    args = parser.parse_args()
    from opencc import OpenCC  # 仅导入原始语料时使用；冻结来源重建不依赖此包。
    with zipfile.ZipFile(args.archive) as archive:
        about = archive.read('_about.txt').decode('utf-8-sig')
    date = re.search(r'Date of this file:\s*(\d{4}-\d{2}-\d{2})', about)
    if not date:
        parser.error('下载包缺少来源日期，不导入无法确认版本的语料。')
    membership = json.loads((ROOT / 'sources/exam-word-membership.json').read_text(encoding='utf-8'))
    entries = select_examples(args.archive, {word['lemma'] for word in membership['words']}, OpenCC('t2s').convert, load_meanings())
    result = {'sourceUrl': 'https://www.manythings.org/anki/cmn-eng.zip', 'corpusDate': date.group(1),
              'sourceSha256': hashlib.sha256(args.archive.read_bytes()).hexdigest(),
              'attribution': 'Tatoeba sentence owners (per entry); www.manythings.org/anki and tatoeba.org',
              'license': 'CC-BY-2.0-FR', 'entries': entries}
    (ROOT / 'sources/tatoeba-examples.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Frozen {len(entries)} example pairs with sentence links, owner attribution and license.')


if __name__ == '__main__':
    main()
