#!/usr/bin/env python3
"""将 sources 词典文件中的繁体字统一转换为简体中文 (convert_sources_to_simplified.py)"""

from __future__ import annotations

import json
from pathlib import Path
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
SOURCES_DIR = ROOT / "data" / "sources"
cc = OpenCC("t2s")


def convert_val(val):
    if isinstance(val, str):
        if val.startswith("http://") or val.startswith("https://"):
            return val
        if all(ord(c) < 128 for c in val):
            return val
        return cc.convert(val)
    elif isinstance(val, list):
        return [convert_val(item) for item in val]
    elif isinstance(val, dict):
        return {k: convert_val(v) for k, v in val.items()}
    return val


def main():
    target_files = [
        SOURCES_DIR / "wiktionary-glosses.json",
        SOURCES_DIR / "editorial-glosses.json",
        SOURCES_DIR / "usage-notes.json"
    ]
    for path in target_files:
        if not path.exists():
            continue
        print(f"正在处理 source 文件: {path}")
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        converted = convert_val(data)
        new_raw = json.dumps(converted, ensure_ascii=False, indent=2) + "\n"
        if raw != new_raw:
            path.write_text(new_raw, encoding="utf-8")
            print(f"-> 已完成转换: {path}")
        else:
            print(f"-> 无繁体字改动: {path}")

    # 处理 editorial-glosses.tsv
    tsv_path = SOURCES_DIR / "editorial-glosses.tsv"
    if tsv_path.exists():
        raw_tsv = tsv_path.read_text(encoding="utf-8")
        conv_tsv = cc.convert(raw_tsv)
        if raw_tsv != conv_tsv:
            tsv_path.write_text(conv_tsv, encoding="utf-8")
            print(f"-> 已完成转换: {tsv_path}")


if __name__ == "__main__":
    main()
