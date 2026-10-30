# 预设词库来源、许可与质量边界

## 交付范围

第一版提供大学英语四级、大学英语六级、考研词汇三个可选词书，文件位于 `data/books/`。词数由实际 JSON 计算，详见 `data/quality-report.json`。本版收录 ECDICT 的 `cet4`、`cet6`、`ky` 标签全量词条；不称其为当年最新官方大纲、考试机构认证词库，也不固定宣称「考研 6000 词」。

本版基础释义只是学习入口，不能据此声称已经具备完整、多义项英汉词典。词书中出现同一个词时采用相同的 `id` 和 `senseId`，供跨词书、跨设备共用学习记录。

### 当前实际数量（2026-10-30 更新）

| 词书 | 实际词数 | 有基础释义/候选 | 缺释义 | 有 IPA | 重复 ID |
| --- | ---: | ---: | ---: | ---: | ---: |
| 大学英语四级 | 3,849 | 3,849（100.00%） | 0 | 1,409（36.61%） | 0 |
| 大学英语六级 | 5,407 | 5,407（100.00%） | 0 | 1,804（33.36%） | 0 |
| 考研词汇 | 4,801 | 4,801（100.00%） | 0 | 1,680（34.99%） | 0 |

跨书去重后为 **6,160** 个稳定词条编号。其中 2,138 个使用开放词典提取释义，3,264 个使用精确反查候选，758 个为补充整理的基础释义草稿（已通过 ECDICT 简明释义清洗回填补齐缺失项），0 个缺释义。这里的「有释义」覆盖率包含待校对候选，不能当成人工审校通过率。

四级源表中的 `reservior` 已修正为 `reservoir`，并与六级/考研的正确词条共用编号。原始错误拼写、对应考试标签和修正依据保存在 `spellingCorrections` 中；各书总量不变，跨书独立词条从原始 6,161 个合并为 6,160 个。`equipe` 与 `protend` 是需要语境说明的少见词，未直接当作拼写错误删除。`negro` 保留历史识别用途，并附当代用法提示。

## 实际采用的来源

| 数据 | 来源 | 许可 | 本次处理 |
| --- | --- | --- | --- |
| 英文词条与考试标签 | [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT) | [MIT](https://github.com/skywind3000/ECDICT/blob/master/LICENSE) | 只提取 `word`、`tag` 两列，规范化、去重并按字母排序 |
| 中文释义、词性、IPA | [Kaikki 中文维基词典提取](https://kaikki.org/zhwiktionary/) | CC BY-SA 4.0；来源也提供 GFDL 路径，本项目选 CC 路径 | 保留词表命中的英语词条，筛选空条目与模板错误，提取一条基础释义，保留逐词页面与原始义项编号 |
| 缺项的补充中文候选 | [CC-CEDICT / MDBG](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) | CC BY-SA 4.0 | 只进行与英文词条完全相等的释义反查，或 `to + 动词` 的精确匹配，明确标为待校对 |
| 少量补充基础释义 | mword 自行整理 | CC BY-SA 4.0 | 若存在整理数据，标为 `editorial-draft`，保留在来源子集中 |

Kaikki 明确说明其数据沿用 Wiktionary 许可。使用的是 2026-10-01 中文维基词典转储、2026-10-02 提取的英语内容，合并 `英語` 与 `英语` 两个标题分类。提取文件和完整原始下载的 SHA-256 保留在 `data/sources/` 中。

CC BY-SA 4.0 允许商业用途，但要求署名、保留许可链接、标明修改，并以同许可分发这些数据的改编；见 [Creative Commons 官方许可说明](https://creativecommons.org/licenses/by-sa/4.0/)。词库数据与程序代码独立管理，发布 app 和 Web 时需提供 `data/licenses/` 内容及这些数据的可获取副本。

英文词条/分类依据 ECDICT 仓库声明的 MIT 使用，并保留版权与许可声明。词条/分类没有商业释义那样的表达内容，本次没有据仓库 MIT 声明推断所有第三方词典内容都已获授权。

## 未采用的内容及原因

- ECDICT 的中文/英文释义、词源、词频、例句、音频不导入。本次不需要依赖其混合词典内容的许可链。
- [mahavivo/english-wordlists](https://github.com/mahavivo/english-wordlists) 未见明确的再分发许可，且 README 包含金山词霸、牛津词典等来源描述，不纳入交付。
- [exam-data/CETVocabulary](https://github.com/exam-data/CETVocabulary) 数据为 CC BY-NC-SA 4.0，不能将其非商业条件忽略后用于计划公开收费的服务，故不纳入。
- [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary) 虽声明 BSD-3-Clause，但释义、例句的上游授权未在本次确认，不直接使用。
- [Qwerty Learner](https://github.com/RealKai42/qwerty-learner) README 说明词典来源是爬取常见词典的 kajweb，故不把项目代码许可视为上游词典许可，不使用其释义或音频。
- Wiktionary 的例句可能引用另有版权的作品，音频也有逐文件许可；本次只收录释义文字与 IPA，不包含这些媒体和引用。

## 质量状态

每个词条携带 `definitionStatus`：

- `source-extracted`：开放词典提取的基础释义，仍需使用场景与义项校对。
- `reverse-gloss-draft`：从 CC-CEDICT 精确反查的中文翻译候选，需要人工确认；不是完整英汉定义。
- `editorial-draft`：自行整理的简短释义草稿，需要人工确认。
- `missing`：尚缺可用释义，调用方应明确提示缺失，不能将其解释为已经掌握该词。

IPA 缺失时可使用系统朗读，但不能把系统朗读当成已验证的离线真人音频。释义保留来源中的简体/繁体写法，后续简繁转换应作为有记录的内容修改。

`data/sample-articles.json` 另提供两篇预置短文，主题为 AI 学习与旅行摄影，每篇覆盖 `retain`、`evidence`、`capacity`、`adapt`、`reliable`、`influence` 六个共享词条，并配有中文翻译和一题理解练习。预置文章为内容草稿，使用 CC BY-SA 4.0；阅读它们不触发实时 AI 请求或额度消耗。

本版 `senseId = wordId + ':core'` 是基础学习入口。多个义项、同形词和大小写相关的意义差别还没有独立建模，后续文章讲解需根据句子确定目标义项。将来扩展义项时应迁移学习状态，不能通过更换词书编号重置进度。

## 可复现与校验

冻结来源子集中的 `exam-word-membership.json`、`wiktionary-glosses.json`、`cedict-reverse-glosses.json` 供离线重建使用；无需再联网或访问任何 API Key。

```sh
python3 data/tools/build_vocabularies.py
python3 data/tools/validate_vocabularies.py
```

校验会逐一检查来源标签覆盖、重复编号、跨书内容一致性、词条规范化、释义出处、质量报告与许可文件。它验证的是结构和来源可追溯性，不代替语言内容人工校对，也不验证与最新官方考试大纲逐词一致。
