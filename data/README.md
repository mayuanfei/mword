# mword 预设词库数据

- `books/cet4.json`：大学英语四级。
- `books/cet6.json`：大学英语六级。
- `books/postgraduate.json`：考研词汇。
- `sources/`：可复现构建的必要来源子集及校验值，不包含商用词典内容。
- `quality-report.json`：按实际数据计算的词数、重复、缺释义、缺音标和校对状态。
- `sample-articles.json`：两篇覆盖六个目标词的预置短文，含翻译和理解练习，阅读不消耗 AI 额度。
- `licenses/`：数据许可与署名，发布时必须保留。
- `tools/`：仅依赖 Python 标准库的构建与校验工具。

## 从已冻结来源重新生成

```sh
python3 data/tools/build_vocabularies.py
python3 data/tools/validate_vocabularies.py
```

## 从完整原始下载提取来源

以下三个来源文件应完整下载。不要把 HTTP 中断后的文件作为完整词表导入。

```sh
python3 data/tools/build_vocabularies.py \
  --ecdict /path/to/ecdict.csv \
  --wiktionary /path/to/kaikki-traditional.jsonl /path/to/kaikki-simplified.jsonl \
  --cedict /path/to/cedict_1_0_ts_utf-8_mdbg.txt.gz
```

## 数据边界

本版覆盖 ECDICT 三个考试标签下的实际全量词条；不宣称最新官方考试大纲、固定 6000 词或完整义项词典。共享编号如 `lemma:retain` 不含词书编号，因此换词书可以复用学习记录。`senseId` 的 `:core` 是本版基础学习入口，不代表一个词全部意义都已掌握。

实际数量为四级 3,849、六级 5,407、考研 4,801；跨书 6,160 个独立词条。四级源表误拼 `reservior` 已记录修正为 `reservoir`。当前仍有 511 个独立词条缺释义，大量已提供的释义为精确反查候选，详细覆盖率和校对状态见质量报告。

`definitionStatus` 保留释义状态：`source-extracted` 为开放来源提取，`reverse-gloss-draft` 为精确反查候选，`editorial-draft` 为自行整理草稿，`missing` 为缺失。调用方须对空释义提供明确提示，不应以词书标题掩盖数据缺口。

词库数量由 JSON 的 `wordCount` 及 `quality-report.json` 计算，不使用宣传词数。许可说明见 [署名文档](licenses/ATTRIBUTION.md) 与 [来源文档](../docs/VOCABULARY_SOURCES.md)。
