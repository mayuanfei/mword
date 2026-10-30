#!/usr/bin/env python3
"""离线词库记忆资产生成与丰富工具 (enrich_books_offline.py)

功能：
1. 一次性离线批量为词库中的单词生成多维记忆资产（词根词缀、历史演变、记忆技巧、场景故事、常用搭配）。
2. 生成结果直接固化写入 data/books/*.json，彻底消除日常查词与背词对实时 AI 的依赖。
3. 学习时 100% 离线可用，零延迟、零 Token 消耗。
4. 支持断点续传（跳过已丰富词条）、并发请求、速率限制与结果校验。
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any, Dict, List, Optional
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
BOOKS_DIR = ROOT / "data" / "books"
cc = OpenCC("t2s")


def to_simplified(val: Any) -> Any:
    if isinstance(val, str):
        return cc.convert(val)
    elif isinstance(val, list):
        return [to_simplified(x) for x in val]
    elif isinstance(val, dict):
        return {k: to_simplified(v) for k, v in val.items()}
    return val

SYSTEM_PROMPT = """你是一个世界顶级的英语词源学家和记忆大师。
请针对给定的英文单词及其主要释义，生成高质量的记忆辅助资料。
请严格输出一个 JSON 对象，不得包含 Markdown 标记或其他多余文字，包含以下 5 个字段：
{
  "roots": "词根词缀拆解（如前缀、词根、后缀含义与逻辑串联，如无典型词根则说明构词特点）",
  "etymology": "词源历史与演变（真实历史背景，从拉丁语/古法语/日耳曼语到现代英语的语义演进，50字左右）",
  "mnemonics": "实用记忆技巧（联想记忆、谐音、熟词拆分或特征联想，通俗好记）",
  "story": "场景故事法/画面记忆法（一个生动画面或100字以内的趣味小故事，将单词和核心含义牢牢锁定）",
  "collocations": ["地道常用搭配1 (中文解释)", "地道常用搭配2 (中文解释)", "地道常用搭配3 (中文解释)"]
}"""

USER_PROMPT_TEMPLATE = """单词：{lemma}
词性：{part_of_speech}
基础释义：{meaning}
"""

SAMPLE_DATA: Dict[str, Dict[str, Any]] = {
    "abandon": {
        "roots": "前缀 a-（朝向、处于...状态）+ bandon（控制、法令、随意处置）。字面意为‘脱离法律管束、听凭处置’ -> 延伸为‘彻底放弃、遗弃’。",
        "etymology": "源自古法语 à bandon（任人支配），拉丁语 bannum（公告、法令，与 ban 禁止、bandit 强盗同源）。14世纪进入英语，早期指‘放弃控制权’，后演变为‘遗弃’。",
        "mnemonics": "谐音联想：a（一个）+ band（乐队）+ on（在...上）-> 一个乐队在台上演出，把主唱一人给 abandon（抛弃）在台下了。",
        "story": "中世纪的封建领主若宣布领地‘mise à bandon’，即表示放弃管辖权，任何人皆可处置。后来词义延伸至人们在绝境中放弃希望、或不顾责任遗弃亲属。",
        "collocations": ["abandon hope (放弃希望)", "abandon a plan (放弃计划)", "abandon a child (遗弃儿童)", "with abandon (放纵地、肆意地)"]
    },
    "ability": {
        "roots": "able（有能力的）+ -ity（名词后缀，表状态、性质）。源自拉丁语 habilis（易操作的、能干的）。",
        "etymology": "源自拉丁语 habilitas（能力），派生自动词 habere（拥有、掌握）。古法语转变为 ablete，14世纪英语借入后演变成 ability。",
        "mnemonics": "词形联想：able（能够的）变名词，去掉 e 加 ity -> 表示具备的能力或本领。",
        "story": "面试官问一位年轻工程师有何特长，他微笑着把复杂的电路图轻松拆解并重新优化。他说：'Ability comes from repeated curiosity and quiet practice.'（能力源自重复的好奇与沉静的练习）。",
        "collocations": ["athletic ability (运动能力)", "to the best of one's ability (尽最大努力)", "ability to do sth (做某事的能力)"]
    },
    "abnormal": {
        "roots": "ab-（偏离、离开）+ normal（正常的，源自 norma 规范/木工木尺）。偏离正常尺度的 -> ‘反常的、不正常的’。",
        "etymology": "由晚期拉丁语 abnormis（不合规范的）受古法语影响发展而来，ab-（远离）+ norma（木匠的角度尺、标准）。19世纪在心理学和医学中广泛用于描述病理性异常。",
        "mnemonics": "拆分联想：ab（离开）+ normal（正常）-> 离开了正常的轨迹 -> abnormal 反常的。",
        "story": "天气预报员发现夏季最高气温突然降到了零下五度，仪表显示一切平稳，他惊呼：'This abnormal drop in temperature must be caused by a sudden cold vortex!'",
        "collocations": ["abnormal behavior (反常行为)", "abnormal condition (异常情况)", "abnormal cells (异常细胞)"]
    },
    "observe": {
        "roots": "ob-（朝向、在...前）+ serve（源自拉丁语 servare，意为注视、看管、遵守，同源词 reserve 保留, preserve 保护）。",
        "etymology": "源自拉丁语 observare（看守、注视、遵守法规）。14世纪进入中古英语，既保留‘观察事实’之意，也用于‘遵守法律/节日’。",
        "mnemonics": "拆分联想：ob（在眼前）+ serve（服侍/照看）-> 紧紧盯着眼前的事物看管照料 -> 细心观察，认真遵守。",
        "story": "达尔文乘小猎犬号航行时，数小时坐在甲板上静静观察海鸥的捕食轨迹。正是这种细致入微的 observation，催生了演化论的灵感火花。",
        "collocations": ["observe carefully (仔细观察)", "observe the rules (遵守规则)", "observe a holiday (庆祝/遵守节日)"]
    },
    "experience": {
        "roots": "ex-（向外、彻底）+ peri（尝试、冒险，源自印欧词根 *per- 穿过、试验，同源词 experiment 实验, peril 危险）+ -ence（名词后缀）。",
        "etymology": "源自拉丁语 experientia（通过实际行动获得的试炼与知识），由动词 experiri（去尝试、去试探）派生。14世纪借入英语，指在实践中经历的事物与积累的经验。",
        "mnemonics": "对比记忆：experiment 是科学上的‘实验’，experience 则是人生中的‘历练’与‘经验’。",
        "story": "一位老水手指着脸上的风暴疤痕对年轻人说：'Books can teach you navigation, but only twenty years on the high seas can give you real experience.'",
        "collocations": ["gain experience (获得经验)", "past experience (过往经历)", "work experience (工作经验)", "rich experience (丰富经验)"]
    },
    "retain": {
        "roots": "re-（向后、保持）+ tain（源自拉丁语 tenere 握住、持有，同源词 contain 包含, maintain 维持, sustain 支撑）。保持在手中不放 -> ‘保留、保持、记住’。",
        "etymology": "源自拉丁语 retinere（拽住、抑制、扣留），re-（后退/反复）+ tenere（拿住）。14世纪经盎格鲁-诺曼法语进入中古英语，广泛用于法律留存及记忆储存。",
        "mnemonics": "拆分联想：re（再次）+ tain（hold 握住）-> 再次紧紧握在手里不丢失 -> retain 保留、记住。",
        "story": "古老城堡的图书管理员小心翼翼地把羊皮纸卷锁进干燥石室。尽管历经百年战乱，这部珍贵手稿依然 retained its original colors and clarity.",
        "collocations": ["retain memory (保持记忆)", "retain ownership (保留所有权)", "retain control (保持控制)", "retain talent (留住人才)"]
    },
    "conversation": {
        "roots": "con-（共同、一起）+ vers（源自拉丁语 vertere 转动、来回往复，同源词 verse 诗行, reverse 反转）+ -ation（名词后缀）。两人在思想上‘来回往复旋转交流’ -> ‘谈话、会话’。",
        "etymology": "源自拉丁语 conversatio（共同生活、频繁往来、打交道），源于 conversari（生活在一起）。中古英语中原意指‘交往行为方式’，16世纪词义收窄为口头的语言交流。",
        "mnemonics": "拆分联想：con（一起）+ vers（转动）+ ation -> 两个人思想和目光转到一起 -> conversation 谈话。",
        "story": "在维也纳的咖啡馆里，两杯热黑咖啡散发着浓香，两位学者从午后一直聊到黄昏，一场深刻的 conversation 往往比翻阅数本厚重的教科书更具启发。",
        "collocations": ["have a conversation (交谈)", "casual conversation (随意的聊天)", "private conversation (私下交谈)", "strike up a conversation (搭话/攀谈)"]
    },
    "habit": {
        "roots": "源自拉丁语 habitus（状态、仪态、习惯），源于动词 habere（持有、拥有、处于某种常态）。同源词 inhabit 居住。",
        "etymology": "古罗马人最初用 habitus 形容一个人的体态或外表装束（如僧侣的长袍也称 habit），后来哲学上引申为‘长期持有且难以更改的心智或行为状态’。",
        "mnemonics": "联想记忆：habit 就像你的外衣（habit 本意也有修士外袍），一旦穿久了就成了身体的一部分 -> 习惯成自然。",
        "story": "作家每天清晨五点准时坐在书桌前，哪怕只写三句话也不中断。他说：'First you make your habits, and then your habits make you.'",
        "collocations": ["develop a habit (养成习惯)", "break a habit (改掉习惯)", "force of habit (习惯的力量)", "good/bad habit (好/坏习惯)"]
    },
    "progress": {
        "roots": "pro-（向前、朝前）+ gress（源自拉丁语 gradi 迈步、走动，同源词 aggressive 攻击性的/咄咄逼人的, congress 代表大会/走到一起）。",
        "etymology": "源自拉丁语 progressus（前进、向前走），pro-（前）+ gradi（走）。15世纪进入英语，早期指巡行或向前行进，17世纪科学革命后演化为事物逐步改善或技术‘进步’。",
        "mnemonics": "拆分联想：pro（向前）+ gress（迈步）-> 一步步向前迈进 -> progress 进步、进展。",
        "story": "登山队员在风雪中扎营，队长指着地图上的红线：'We only climbed two miles today, but every footstep forward is progress toward the summit.'",
        "collocations": ["make progress (取得进步)", "in progress (正在进行中)", "steady progress (平稳进展)", "technological progress (技术进步)"]
    },
    "attention": {
        "roots": "ad-（朝向，同化为 at-）+ tend/tent（伸展、伸出，源自拉丁语 tendere 伸展，同源词 extend 延伸, intend 打算）+ -ion（名词后缀）。心灵朝向某物伸展聚焦 -> ‘注意力、留心’。",
        "etymology": "源自拉丁语 attendere（注意、留心），字面意为‘将心灵伸向某处’。古法语将其转为 atention，14世纪进入英语。",
        "mnemonics": "拆分联想：at（在某点）+ tent（帐篷/伸出）+ ion -> 把触角全部伸向同一个焦点 -> attention 注意力。",
        "story": "教室里，魔术师只是把一枚硬币抛向空中，所有孩子们的 eyes were fixed with full attention，完全没有察觉他的另一只手已变出一朵玫瑰花。",
        "collocations": ["pay attention to (注意...)", "draw/attract attention (引起注意)", "focus attention on (集中注意力于)", "center of attention (关注的焦点)"]
    },
    "valuable": {
        "roots": "value（价值，源自拉丁语 valere 有力量、有价值）+ -able（能够...的、值得...的形容词后缀）。",
        "etymology": "源自古法语 valoir（值得）的名词形式 value，再派生出形容词 valuable。16世纪末在商业与法律文书中流行，指有货币价值或极具重要意义的事物。",
        "mnemonics": "构词：value（价值）+ able（有...能力的）-> 有极高价值的 -> 珍贵的、贵重的。",
        "story": "老爷爷将一只陈旧的手表交到孙子手中：'It isn't made of gold, but it taught me to respect time. That makes it more valuable than diamonds.'",
        "collocations": ["valuable advice (宝贵的建议)", "valuable experience (宝贵的经验)", "valuable asset (宝贵的资产)", "highly valuable (极有价值的)"]
    }
}


def call_ai_for_word(lemma: str, pos: str, meaning: str, api_base: str, api_key: str, model: str) -> Optional[Dict[str, Any]]:
    """调用大模型为单词生成结构化记忆资产"""
    url = api_base.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(lemma=lemma, part_of_speech=pos or "v./n./adj.", meaning=meaning)}
        ]
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            # 校验字段
            for field in ("roots", "etymology", "mnemonics", "story"):
                if field not in parsed or not isinstance(parsed[field], str):
                    parsed[field] = ""
            if "collocations" not in parsed or not isinstance(parsed["collocations"], list):
                parsed["collocations"] = []
            return parsed
    except Exception as e:
        print(f"[WARN] 生成 {lemma} 失败: {e}", file=sys.stderr)
        return None


def enrich_book(book_path: Path, api_base: Optional[str] = None, api_key: Optional[str] = None, model: Optional[str] = None, limit: Optional[int] = None, force: bool = False, use_samples: bool = True):
    """丰富指定词书文件"""
    if not book_path.exists():
        print(f"文件不存在: {book_path}", file=sys.stderr)
        return

    print(f"正在读取词库: {book_path}")
    raw_text = book_path.read_text(encoding="utf-8")
    book_data = json.loads(raw_text)
    words: List[Dict[str, Any]] = book_data.get("words", [])

    updated_count = 0
    skipped_count = 0

    to_process = []
    for word in words:
        lemma = word.get("lemma", "").strip().lower()
        has_assets = bool(word.get("memoryAssets"))
        if has_assets and not force:
            skipped_count += 1
            continue
        to_process.append(word)

    print(f"总词数: {len(words)}, 已有记忆资产: {skipped_count}, 待处理: {len(to_process)}")
    if limit:
        to_process = to_process[:limit]
        print(f"按限制仅处理前 {len(to_process)} 词")

    for idx, word in enumerate(to_process, 1):
        lemma = word.get("lemma", "").strip().lower()
        pos = word.get("partOfSpeech", "")
        meaning = word.get("meaning", "")

        assets = None
        # 1. 优先使用内置高质量样本
        if use_samples and lemma in SAMPLE_DATA:
            assets = SAMPLE_DATA[lemma]
            print(f"[{idx}/{len(to_process)}] 注入高质量内置样本: {lemma}")
        # 2. 调用 API 生成
        elif api_base and api_key and model:
            print(f"[{idx}/{len(to_process)}] AI 生成中: {lemma} ...")
            assets = call_ai_for_word(lemma, pos, meaning, api_base, api_key, model)
            time.sleep(0.2)  # 轻微休眠，防止频控

        if assets:
            word["memoryAssets"] = to_simplified(assets)
            updated_count += 1

        # 每 50 个落盘一次
        if updated_count > 0 and updated_count % 50 == 0:
            book_path.write_text(json.dumps(book_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"已临时保存 {updated_count} 个词条")

    # 最终保存
    if updated_count > 0:
        book_path.write_text(json.dumps(book_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"处理完成！成功为 {updated_count} 个词条添加离线记忆资产。已保存至: {book_path}")
    else:
        print("没有产生变动。")


def main():
    parser = argparse.ArgumentParser(description="离线词库记忆资产一次性批量丰富工具")
    parser.add_argument("--book", default="cet4", help="词书名称 (cet4, cet6, postgraduate 或指定 json 路径)")
    parser.add_argument("--all", action="store_true", help="处理所有词书")
    parser.add_argument("--api-base", default=os.getenv("AI_API_BASE", ""), help="OpenAI 兼容 API Base URL")
    parser.add_argument("--api-key", default=os.getenv("AI_API_KEY", ""), help="API 密钥")
    parser.add_argument("--model", default=os.getenv("AI_MODEL", "deepseek-chat"), help="模型名称")
    parser.add_argument("--limit", type=int, default=None, help="最多处理词数（用于测试）")
    parser.add_argument("--force", action="store_true", help="强制覆盖已有的 memoryAssets")
    parser.add_argument("--inject-samples-only", action="store_true", help="仅注入内置的高频精编样本")

    args = parser.parse_args()

    target_books = []
    if args.all:
        target_books = [BOOKS_DIR / f"{name}.json" for name in ("cet4", "cet6", "postgraduate")]
    else:
        book_file = BOOKS_DIR / f"{args.book}.json" if not args.book.endswith(".json") else Path(args.book)
        target_books = [book_file]

    for b in target_books:
        enrich_book(
            b,
            api_base=args.api_base if not args.inject_samples_only else None,
            api_key=args.api_key if not args.inject_samples_only else None,
            model=args.model,
            limit=args.limit,
            force=args.force,
            use_samples=True
        )


if __name__ == "__main__":
    main()
