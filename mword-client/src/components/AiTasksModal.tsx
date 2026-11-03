import { useMemo, useState } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import type { AiScene, AiTask } from '../lib/types';
import { SCENE_NAMES } from '../lib/types';
import { TaskCard } from './ui';

interface AiTasksModalProps {
  open: boolean;
  tasks: AiTask[];
  onClose: () => void;
  onOpenArticle: (id: string) => void;
  onOpenQuestion?: (task: AiTask) => void;
}

export function AiTasksModal({ open, tasks, onClose, onOpenArticle, onOpenQuestion }: AiTasksModalProps) {
  const [search, setSearch] = useState('');
  const [selectedScene, setSelectedScene] = useState<string>('ALL');

  const filteredTasks = useMemo(() => {
    let list = [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (selectedScene !== 'ALL') {
      list = list.filter(task => task.scene === selectedScene);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(task => {
        const text = `${task.result || ''} ${task.error || ''} ${SCENE_NAMES[task.scene]}`.toLowerCase();
        return text.includes(q);
      });
    }
    return list;
  }, [tasks, selectedScene, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white text-stone-800 rounded-2xl shadow-2xl border border-stone-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-stone-900 leading-tight">
                已沉淀的 AI 助记与练习库
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                共 {tasks.length} 条个性化讲解与造句记录
              </p>
            </div>
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

        {/* Filter Toolbar */}
        <div className="px-6 py-3 border-b border-stone-100 bg-white flex flex-col gap-2.5">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索难词释义、例句或讲解要点..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all placeholder:text-stone-400"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            <button
              type="button"
              onClick={() => setSelectedScene('ALL')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors font-medium ${
                selectedScene === 'ALL'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              全部场景 ({tasks.length})
            </button>
            {(['EXPLAIN', 'MEMORY', 'CONTEXT', 'ARTICLE'] as AiScene[]).map(scene => {
              const count = tasks.filter(t => t.scene === scene).length;
              return (
                <button
                  key={scene}
                  type="button"
                  onClick={() => setSelectedScene(scene)}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors font-medium ${
                    selectedScene === scene
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {SCENE_NAMES[scene]} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Task Cards List */}
        <div className="px-6 py-4 overflow-y-auto flex-1 flex flex-col gap-3">
          {filteredTasks.length > 0 ? (
            filteredTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onOpenArticle={id => {
                  onClose();
                  onOpenArticle(id);
                }}
                onOpenQuestion={t => {
                  onClose();
                  if (onOpenQuestion) onOpenQuestion(t);
                }}
              />
            ))
          ) : (
            <div className="py-12 text-center text-stone-400 text-sm">
              {tasks.length === 0 ? '暂无生成的 AI 助记内容。' : '未匹配到符合条件的助记任务。'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-100 bg-stone-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
