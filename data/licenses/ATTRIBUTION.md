# 词库来源与署名

此目录及 `data/books/`、`data/sources/` 中的语言数据有独立许可，不以应用程序源码的许可替代。

## 英文词表与考试标签

- 来源：[skywind3000 / ECDICT](https://github.com/skywind3000/ECDICT)。
- 许可：MIT，完整声明见 `ECDICT-MIT.txt`。
- mword 只提取原始 CSV 的 `word` 与 `tag` 字段，选择 `cet4`、`cet6`、`ky`，规范化并按字母顺序排序。
- 未分发 ECDICT 的中文释义、英文释义、例句、词源、音频或词频数据。
- 考试标签是该开源数据集的分类；不表示 mword 获得考试机构认证，也不保证等于当年最新官方大纲。

## 中文基础释义、词性与国际音标

- 作者：中文维基词典贡献者。
- 提取：Tatu Ylonen / [Kaikki.org](https://kaikki.org/zhwiktionary/) / Wiktextract。
- 源页面：[中文维基词典](https://zh.wiktionary.org/)；每条提取释义在 `definitionSourceUrl` 中保留具体词条页面。
- 原始数据：2026-10-01 中文维基词典转储，Kaikki 于 2026-10-02 提取。
- 本次保留 `英語` 和 `英语` 两个标题分类的数据。源校验值、提取量见 `data/sources/wiktionary-glosses.json`。
- 许可：选用 CC BY-SA 4.0 路径，正文见 `CC-BY-SA-4.0.txt`；[许可说明](https://creativecommons.org/licenses/by-sa/4.0/)。
- 修改：筛选英语词条，去除空释义和模板异常，选择一条非过时/非罕见优先的基础释义，提取 IPA 与词性，保留原始义项编号；未收录例句、音频、图片或词源。
- 源释义含简体与繁体中文。本版保留来源写法，没有进行自动简繁转换。

## 补充翻译候选

- 作者：CC-CEDICT 贡献者；由 [MDBG](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) 分发。
- 许可：CC BY-SA 4.0。
- 修改：仅在缺少维基词典释义时，对与词条完全一致的英文释义、或 `to + 动词` 进行反查，最多展示三个中文候选。
- 这些内容明确标记为 `reverse-gloss-draft`，需要人工校对；它们是翻译候选，不是完整英汉义项库。
- 若存在 `editorial-glosses.json`，其中 `editorial-draft` 是 mword 自行整理的简短基础释义，同样以 CC BY-SA 4.0 提供，并列入待校对内容。

## 分发要求

分发 app / Web 时应同时提供本署名、来源链接、许可链接和许可正文，允许获得这些语言数据及其修改版的透明副本。mword 对上述开放语言数据的筛选、整理和补充按 CC BY-SA 4.0 分发。应用功能、账户系统和 AI 调用代码与词库数据独立管理。

AI 费用是生成/讲解服务的额度消耗；阅读缓存或下载这份开放基础词库不应被说明为购买数据版权。
