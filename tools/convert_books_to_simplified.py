#!/usr/bin/env python3
"""将词库 JSON 文件中的所有繁体字统一转换为简体中文 (convert_books_to_simplified.py)"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
BOOKS_DIR = ROOT / "data" / "books"

cc = OpenCC("t2s")


def convert_val(val: Any) -> Any:
    if isinstance(val, str):
        # 如果是 URL 或纯英文 ASCII 字符串，不转换
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


def process_file(file_path: Path):
    print(f"正在处理: {file_path}")
    raw = file_path.read_text(encoding="utf-8")
    data = json.loads(raw)

    converted_data = convert_val(data)
    new_raw = json.dumps(converted_data, ensure_ascii=False, indent=2) + "\n"

    if raw != new_raw:
        file_path.write_text(new_raw, encoding="utf-8")
        print(f"-> 已完成转换并保存: {file_path}")
    else:
        print(f"-> 无繁体字改动: {file_path}")


def main():
    books = ["cet4.json", "cet6.json", "postgraduate.json"]
    for book_name in books:
        path = BOOKS_DIR / book_name
        if path.exists():
            process_file(path)


if __name__ == "__main__":
    main()
