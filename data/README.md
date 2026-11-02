# mword 预设词库数据

- `books/cet4.json`：大学英语四级。
- `books/cet6.json`：大学英语六级。
- `books/postgraduate.json`：考研词汇。
- `sources/`：可复现构建的必要来源子集及校验值，含带逐句署名的 Tatoeba 例句、已选定义项和既有助记草稿。
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

实际数量为四级 3,849、六级 5,407、考研 4,801；跨书 6,160 个独立词条。四级源表误拼 `reservior` 已记录修正为 `reservoir`。基础释义缺项已补齐，但包含精确反查候选和整理草稿，不能当成人工审校通过率。

2026-11-02：补入 2,572 个独立词条的中英例句；四级/六级/考研分别覆盖 2,204/2,216/2,289 词。保留英文与译句作者、原句链接、CC-BY-2.0-FR 许可及中文简化说明。例句按词形自动匹配，译文和义项对应关系仍待核对。其余词条不制造占位例句；10 个既有助记词条保留为草稿。质量报告包含这些覆盖数。

从下载的完整 `cmn-eng.zip` 更新冻结例句时，使用安装了 `opencc-python-reimplemented` 的 Python 执行 `python3 data/tools/import_examples.py /path/to/cmn-eng.zip`，然后运行上述构建、校验命令。日常从冻结来源重建仅需标准库，不访问网络或 AI。

`definitionStatus` 保留释义状态：`source-extracted` 为开放来源提取，`reverse-gloss-draft` 为精确反查候选，`editorial-draft` 为自行整理草稿，`missing` 为缺失。调用方须对空释义提供明确提示，不应以词书标题掩盖数据缺口。

词库数量由 JSON 的 `wordCount` 及 `quality-report.json` 计算，不使用宣传词数。许可说明见 [署名文档](licenses/ATTRIBUTION.md) 与 [来源文档](../docs/VOCABULARY_SOURCES.md)。
