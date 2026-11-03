import { useMemo, useState } from 'react';
import { BookOpen, Check, Clock, Search, Sparkles, X } from 'lucide-react';
import type { Book } from '../lib/types';

interface BookSelectionModalProps {
  open: boolean;
  currentBookId: string;
  books: Book[];
  onSelect: (bookId: string) => void;
  onClose: () => void;
}

export interface TopicItem {
  title: string;
  wordCount: string;
  examples: string;
  status: 'AVAILABLE' | 'UPCOMING';
  bookId?: string;
  description?: string;
}

export interface SectionPlan {
  id: string;
  name: string;
  icon: string;
  description: string;
  topics: TopicItem[];
}

// 完整的板块规划体系（包含当前升学考试与即将上线的生活场景主题）
export const BOOK_SECTIONS: SectionPlan[] = [
  {
    id: 'exam',
    name: '升学与考试',
    icon: '🎓',
    description: '大学英语四六级、全国考研等升学备战核心权威词库',
    topics: [
      {
        bookId: 'cet4',
        title: '大学英语四级 (CET-4)',
        wordCount: '3,849 词',
        examples: 'abandon, abstract, benefit, capacity, essential',
        status: 'AVAILABLE',
        description: '教育部考试大纲高频核心词，配官方例句与难词助记',
      },
      {
        bookId: 'cet6',
        title: '大学英语六级 (CET-6)',
        wordCount: '5,407 词',
        examples: 'aesthetic, chronic, deprive, elite, formidable',
        status: 'AVAILABLE',
        description: '六级拔高进阶词库，涵盖学术讨论与复杂长难句高频词',
      },
      {
        bookId: 'postgraduate',
        title: '全国考研英语核心词',
        wordCount: '4,801 词',
        examples: 'arbitrary, compile, deteriorate, exploit, hierarchy',
        status: 'AVAILABLE',
        description: '考研阅读真题高频核心词，深度强化熟词僻义与难词助记',
      },
    ],
  },
  {
    id: 'food',
    name: '舌尖与美食',
    icon: '🍔',
    description: '日常食材与厨房烹饪、西餐厅点餐与口感风味、咖啡烘焙与调酒饮品',
    topics: [
      {
        bookId: 'food-cooking',
        title: '日常食材与厨房烹饪',
        wordCount: '50 词',
        examples: 'crispy, simmer, broccoli, fillet, whisk, marinate',
        status: 'AVAILABLE',
        description: '常见果蔬蛋肉、调料香辛料与切片煎炒焖煮日常烹饪动作',
      },
      {
        bookId: 'food-dining',
        title: '西餐厅点餐与风味口感',
        wordCount: '24 词',
        examples: 'entree, dressing, tender, rare, savory, appetizing',
        status: 'AVAILABLE',
        description: '头盘前菜、牛排熟度、沙拉酱汁与层次丰富的味觉描述',
      },
      {
        bookId: 'food-drinks',
        title: '咖啡、烘焙与酒饮文化',
        wordCount: '17 词',
        examples: 'espresso, sourdough, acidity, brew, aroma, tannin',
        status: 'AVAILABLE',
        description: '意式手冲品类、面包烘焙工艺与精酿红酒风味品鉴词汇',
      },
    ],
  },
  {
    id: 'health',
    name: '身体与健康',
    icon: '🧍',
    description: '人体器官外观、日常身体不适就医问诊、健身锻炼与解剖运动',
    topics: [
      {
        title: '人体器官与外观特征',
        wordCount: '约 200 词',
        examples: 'knuckle, nostril, torso, dimple, collarbone, freckle',
        status: 'UPCOMING',
        description: '精细五官手足、骨骼器官与辨识度极高的外形特征表达',
      },
      {
        title: '常见不适与医院问诊',
        wordCount: '约 150~200 词',
        examples: 'nausea, prescribe, allergy, bruise, sprain, clinic',
        status: 'UPCOMING',
        description: '感冒发烧头疼、突发扭伤过敏及海外看病问诊关键沟通词',
      },
      {
        title: '健身锻炼与运动解剖',
        wordCount: '约 180 词',
        examples: 'hamstring, plank, cardio, hypertrophy, core, endurance',
        status: 'UPCOMING',
        description: '核心肌群、健身动作要领与有氧增肌运动专项英语',
      },
    ],
  },
  {
    id: 'traffic',
    name: '出行与车辆',
    icon: '🚗',
    description: '车型车身部件、日常驾车路况交通、公共交通与出境航旅',
    topics: [
      {
        title: '常见车型与车身部件',
        wordCount: '约 150~200 词',
        examples: 'sedan, bumper, sunroof, gearbox, windshield, hood',
        status: 'UPCOMING',
        description: '轿车SUV跑车、车灯保险杠雨刮器与机械部件通识',
      },
      {
        title: '日常驾车与路况交通',
        wordCount: '约 150 词',
        examples: 'congestion, detour, overtake, lane, tollgate, roundabout',
        status: 'UPCOMING',
        description: '早晚高峰堵车、变道超车与自驾环岛导航实用表达',
      },
      {
        title: '公共交通与机场出国',
        wordCount: '约 200 词',
        examples: 'boarding pass, transit, layover, carousel, customs',
        status: 'UPCOMING',
        description: '登机牌转机托运、行李转盘提取与海关出入境全流程',
      },
    ],
  },
  {
    id: 'life',
    name: '日常起居与生活',
    icon: '🏠',
    description: '家居日用好物、数码科技消费好物、日常服饰面料与穿搭风格',
    topics: [
      {
        title: '家居好物与生活杂件',
        wordCount: '约 250 词',
        examples: 'detergent, faucet, duvet, coaster, broom, hanger',
        status: 'UPCOMING',
        description: '卫浴洁具、厨房清洁用品、床上寝具与角落日用杂物',
      },
      {
        title: '数码科技与数码好物',
        wordCount: '约 200 词',
        examples: 'charger, bluetooth, latency, firmware, adapter, gadget',
        status: 'UPCOMING',
        description: '充电外设、低延迟固件升级与科技发烧友常用数码术语',
      },
      {
        title: '服饰穿搭与面料材质',
        wordCount: '约 200 词',
        examples: 'denim, cashmere, zipper, oversized, velvet, knitwear',
        status: 'UPCOMING',
        description: '羊绒牛仔棉麻面料、版型剪裁与时尚日常搭配风格',
      },
    ],
  },
  {
    id: 'social',
    name: '职场与社交',
    icon: '💼',
    description: '外企高频黑话与日常交流、细腻情绪感知与人格性格精准描述',
    topics: [
      {
        title: '外企高频黑话与日常交流',
        wordCount: '约 180 词',
        examples: 'sync, ping, touch base, alignment, recap, deliverable',
        status: 'UPCOMING',
        description: '敏捷会议对齐、即时沟通回溯与职场高效沟通高频词汇',
      },
      {
        title: '情绪感知与性格描述',
        wordCount: '约 200 词',
        examples: 'stubborn, empathetic, witty, subtle, arrogant, reliable',
        status: 'UPCOMING',
        description: '多维度情商心理、性格特质与生活人物肖像生动表达',
      },
    ],
  },
];

export function BookSelectionModal({ open, currentBookId, books, onSelect, onClose }: BookSelectionModalProps) {
  const [selectedId, setSelectedId] = useState(currentBookId);
  const [activeSectionId, setActiveSectionId] = useState<string>('all');
  const [search, setSearch] = useState('');

  // 绑定真实书本数据
  const sectionsWithBooks = useMemo(() => {
    return BOOK_SECTIONS.map(section => {
      const enrichedTopics = section.topics.map(topic => {
        if (topic.bookId) {
          const realBook = books.find(b => b.id === topic.bookId);
          if (realBook) {
            return {
              ...topic,
              title: realBook.name,
              wordCount: `${realBook.wordCount.toLocaleString()} 词`,
              description: realBook.description,
            };
          }
        }
        return topic;
      });
      return {
        ...section,
        topics: enrichedTopics,
      };
    });
  }, [books]);

  // 按板块和搜索词过滤
  const displayedSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sectionsWithBooks
      .filter(sec => activeSectionId === 'all' || sec.id === activeSectionId)
      .map(sec => {
        if (!q) return sec;
        const matchedTopics = sec.topics.filter(t =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          t.examples.toLowerCase().includes(q)
        );
        return {
          ...sec,
          topics: matchedTopics,
        };
      })
      .filter(sec => sec.topics.length > 0);
  }, [sectionsWithBooks, activeSectionId, search]);

  if (!open) return null;

  const handleConfirm = () => {
    if (selectedId) {
      onSelect(selectedId);
      onClose();
    }
  };

  const selectedTopic = sectionsWithBooks
    .flatMap(s => s.topics)
    .find(t => t.bookId === selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white text-stone-800 rounded-2xl shadow-2xl border border-stone-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/90">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                <BookOpen size={17} />
              </span>
              <h2 className="text-base font-semibold text-stone-900 leading-tight">
                词书分类库与场景板块
              </h2>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              覆盖升学应试与生活场景 · 切换词书将自动保留已背词汇的记忆强度
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 rounded-lg p-1.5 transition-colors hover:bg-stone-100"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Section Navigation Tabs */}
        <div className="px-6 py-3 border-b border-stone-100 bg-white flex flex-col gap-2.5">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索词书、板块场景或代表单词（如：四级、美食、simmer、身体、车辆）..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all placeholder:text-stone-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-700 p-1"
              >
                清除
              </button>
            )}
          </div>

          {/* Section Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            <button
              type="button"
              onClick={() => setActiveSectionId('all')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors font-medium flex items-center gap-1.5 ${
                activeSectionId === 'all'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <span>🌟</span>
              全部板块
            </button>
            {BOOK_SECTIONS.map(sec => (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSectionId(sec.id)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors font-medium flex items-center gap-1.5 ${
                  activeSectionId === sec.id
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                <span>{sec.icon}</span>
                {sec.name}
              </button>
            ))}
          </div>
        </div>

        {/* Section List & Topics */}
        <div className="px-6 py-4 overflow-y-auto flex-1 flex flex-col gap-6">
          {displayedSections.map(section => (
            <div key={section.id} className="flex flex-col gap-2.5">
              {/* Section Header */}
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{section.icon}</span>
                  <h3 className="font-semibold text-stone-900 text-sm">{section.name}</h3>
                  <span className="text-xs text-stone-400 font-normal">({section.topics.length} 套词书)</span>
                </div>
                <span className="text-[11px] text-stone-500 hidden sm:inline">
                  {section.description}
                </span>
              </div>

              {/* Topics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {section.topics.map(topic => {
                  const isAvailable = topic.status === 'AVAILABLE' && Boolean(topic.bookId);
                  const isSelected = isAvailable && selectedId === topic.bookId;
                  const isCurrent = isAvailable && currentBookId === topic.bookId;

                  return (
                    <div
                      key={topic.title}
                      role={isAvailable ? 'button' : undefined}
                      tabIndex={isAvailable ? 0 : undefined}
                      onClick={() => {
                        if (isAvailable && topic.bookId) setSelectedId(topic.bookId);
                      }}
                      onKeyDown={e => {
                        if (isAvailable && topic.bookId && (e.key === 'Enter' || e.key === ' ')) {
                          setSelectedId(topic.bookId);
                        }
                      }}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                        isAvailable
                          ? isSelected
                            ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20 shadow-xs cursor-pointer'
                            : 'border-stone-200 hover:border-emerald-300 hover:bg-stone-50/60 bg-white cursor-pointer'
                          : 'border-dashed border-stone-200 bg-stone-50/40 opacity-85'
                      }`}
                    >
                      <div>
                        {/* Title & Badge */}
                        <div className="flex items-start justify-between gap-1.5">
                          <h4 className="font-semibold text-stone-900 text-sm leading-snug">
                            {topic.title}
                          </h4>
                          {isAvailable ? (
                            isSelected ? (
                              <span className="w-4 h-4 rounded-full bg-emerald-700 text-white flex items-center justify-center shrink-0">
                                <Check size={10} strokeWidth={3} />
                              </span>
                            ) : null
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded shrink-0">
                              <Clock size={9} />
                              规划中
                            </span>
                          )}
                        </div>

                        {/* Word Count */}
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                          <span>{topic.wordCount}</span>
                          {isCurrent && (
                            <span className="text-[10px] text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded font-semibold">
                              正在学习
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {topic.description && (
                          <p className="text-xs text-stone-600 mt-2 line-clamp-2 leading-relaxed">
                            {topic.description}
                          </p>
                        )}

                        {/* Example Words Preview */}
                        <div className="mt-2.5 pt-2 border-t border-stone-100 text-[11px] text-stone-500">
                          <span className="text-stone-400 block text-[10px] mb-0.5">典型代表词：</span>
                          <span className="italic text-stone-700 font-mono tracking-tight text-[11px] block truncate">
                            {topic.examples}
                          </span>
                        </div>
                      </div>

                      {/* Foot Action Tip */}
                      <div className="mt-3 pt-2 text-[11px]">
                        {isAvailable ? (
                          isSelected ? (
                            <span className="text-emerald-700 font-medium">已选中该词书</span>
                          ) : (
                            <span className="text-stone-400">点击切换为该词书</span>
                          )
                        ) : (
                          <span className="text-stone-400">词表已就绪，等待注入上线</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {displayedSections.length === 0 && (
            <div className="py-16 text-center text-stone-400 text-sm">
              未找到与 “{search}” 相关的词书或场景板块
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/60 flex items-center justify-between gap-3">
          <div className="text-xs text-stone-600 truncate">
            {selectedTopic ? (
              <span>
                已选词书：<strong className="text-stone-900">{selectedTopic.title}</strong>
              </span>
            ) : (
              '请从可用板块中选择一本词书'
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 border border-stone-200 rounded-xl hover:bg-stone-100 transition-colors"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-xs hover:shadow transition-all flex items-center gap-1.5"
            >
              <Check size={14} />
              确认切换词书
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
