import { useEffect, useState } from 'react';
import { ArrowRight, Check, Cloud, LogOut, RefreshCw, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { useLearningStore } from '../lib/store';
import { dailyNewWordGoal } from '../lib/dailyPlan';
import { enableReviewReminder } from '../lib/native';
import type { AiTask, Profile } from '../lib/types';
import { Heading, Notice, TaskCard, formatTime } from '../components/ui';
import { SCENE_NAMES } from '../lib/types';

export function SettingsPage({ onAdmin, onArticle, onQuestion, onSaved }: { onAdmin: () => void; onArticle: (id: string) => void; onQuestion?: (task: AiTask) => void; onSaved: (message: string) => void }) {
  const { user, profile, books, saveProfile, synchronize, refreshAccount, logout, quota, aiTasks, sync, online, reviewStates } = useLearningStore();
  const [form, setForm] = useState<Profile>(profile);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const interests = ['四级通关', '六级拔高', '考研冲刺', '雅思托福', '职场进阶', '科技前沿', '日常交流', '影视美剧'];

  useEffect(() => setForm(profile), [profile]);
  const selectedBook = books.find(book => book.id === form.bookId);

  async function save() {
    setError('');
    setBusy(true);
    try {
      const additions = extra.split(/[,，、\n]/).map(item => item.trim()).filter(Boolean);
      const merged = [...new Set([...form.interests, ...additions])];
      await saveProfile({ ...form, interests: merged, onboardingCompleted: true });
      setExtra('');
      onSaved('学习偏好已保存，离线记录将在联网后同步。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '偏好未保存，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function notify() {
    setError('');
    try {
      await enableReviewReminder(reviewStates.map(state => state.dueAt).sort()[0]);
      onSaved('已请求提醒权限。可在系统设置中管理通知。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '当前设备暂不支持复习通知');
    }
  }

  return (
    <>
      <Heading
        eyebrow="MAKE IT YOUR OWN"
        title={profile.onboardingCompleted ? '我的设置与同步' : '开始前，认识一下你'}
        description={profile.onboardingCompleted ? '词书选择、背词节奏与数据同步，随时调整。' : '选择一套词书与目标，开启轻松高效的背词之旅。'}
      />

      {error && <Notice kind="error" onDismiss={() => setError('')}>{error}</Notice>}

      <div className="card-title">
        <h2>选择你的词书</h2>
        <small>切换词书会保留重叠词的学习记录</small>
      </div>

      <div className="books">
        {books.map((book, index) => (
          <button
            type="button"
            key={book.id}
            className={`book-card ${form.bookId === book.id ? 'selected' : ''}`}
            onClick={() => setForm({ ...form, bookId: book.id })}
          >
            <div className="book-cover">{index === 0 ? '4' : index === 1 ? '6' : '研'}</div>
            <h3>{book.name}</h3>
            <p>{book.description}</p>
            <div className="book-foot">
              <span>{book.wordCount.toLocaleString()} 词 · {book.version}</span>
              {form.bookId === book.id && <Check size={14} />}
            </div>
          </button>
        ))}
      </div>

      {selectedBook && (
        <div className="source-note" style={{ marginBottom: 23 }}>
          词表来源：<a href={selectedBook.sourceUrl} target="_blank" rel="noreferrer">查看原始词表</a> · {selectedBook.licenseUrl ? <a href={selectedBook.licenseUrl} target="_blank" rel="noreferrer">{selectedBook.license}</a> : selectedBook.license}。
          <p>{selectedBook.attribution?.join("；")}</p>
          <div className="license-links">
            <a href={`${import.meta.env.BASE_URL}licenses/ATTRIBUTION.md`} download>下载来源说明</a>
            <a href={`${import.meta.env.BASE_URL}licenses/CC-BY-SA-4.0.txt`} download>CC-BY-SA-4.0 许可</a>
            <a href={`${import.meta.env.BASE_URL}licenses/ECDICT-MIT.txt`} download>ECDICT MIT 许可</a>
            <a href={`${import.meta.env.BASE_URL}licenses/TATOEBA-CC-BY-2.0-FR.md`} download>例句许可与署名</a>
          </div>
        </div>
      )}

      <section className="card settings-card">
        <div className="card-title">
          <h2>个人背词偏好</h2>
          <span className="pill">目标设置</span>
        </div>

        <div className="form-grid">
          <label className="field full">
            背词目标
            <input
              value={form.goal}
              maxLength={120}
              placeholder="例如：备战大学英语四级 / 考研英语高分冲刺 / 积累日常高频词"
              onChange={event => setForm({ ...form, goal: event.target.value })}
            />
          </label>

          <div className="field full">
            <span>选择关注方向</span>
            <div className="chips">
              {interests.map(interest => (
                <button
                  key={interest}
                  className={`chip ${form.interests.includes(interest) ? 'selected' : ''}`}
                  onClick={() => setForm({
                    ...form,
                    interests: form.interests.includes(interest)
                      ? form.interests.filter(item => item !== interest)
                      : [...form.interests, interest]
                  })}
                >
                  {interest}
                </button>
              ))}
            </div>
            {form.interests.filter(item => !interests.includes(item)).length > 0 && (
              <div className="chips">
                {form.interests.filter(item => !interests.includes(item)).map(interest => (
                  <button
                    className="chip selected"
                    key={interest}
                    onClick={() => setForm({ ...form, interests: form.interests.filter(item => item !== interest) })}
                  >
                    {interest} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="field">
            每天计划背词时间
            <select
              value={form.dailyMinutes}
              onChange={event => setForm({ ...form, dailyMinutes: Number(event.target.value) })}
            >
              {[10, 15, 20, 30, 45].map(minutes => (
                <option value={minutes} key={minutes}>{minutes} 分钟 (每日 {dailyNewWordGoal(minutes)} 个新词)</option>
              ))}
            </select>
          </label>

          <label className="field">
            基础起点自评
            <select
              value={form.level}
              onChange={event => setForm({ ...form, level: event.target.value })}
            >
              <option>基础起步</option>
              <option>高中水平 / 四级基础</option>
              <option>六级水平 / 具备常用词汇量</option>
              <option>考研或挑战专业高级词汇</option>
            </select>
            <small>用于辅助 AI 难词释义与例句难度参考。</small>
          </label>
        </div>

        <div className="form-actions">
          <button className="button" disabled={busy || !form.goal.trim()} onClick={() => void save()}>
            {busy ? '正在保存' : profile.onboardingCompleted ? '保存学习偏好' : '保存，开始背词'}
            <ArrowRight size={14} />
          </button>
        </div>
      </section>

      <div className="progress-grid">
        <section className="card settings-card">
          <div className="card-title">
            <h2>AI 学习额度</h2>
            <Wallet size={17} color="#9bad87" />
          </div>
          <div className="quota-number">{quota?.available ?? '—'}<span>可用额度</span></div>
          <p className="quota-info">用于针对性难词讲解、个性化联想助记与新句练习。额度由管理员分配。</p>
          {(quota?.reserved ?? 0) > 0 && (
            <p className="quota-info">另有 {quota!.reserved} 额度被正在处理的任务预占。</p>
          )}
          <div className="stat-line">
            <span>难词精讲</span>
            <strong>{quota?.sceneCosts.EXPLAIN ?? '—'} / 次</strong>
          </div>
          <div className="stat-line">
            <span>记忆辅助 / 新句练习</span>
            <strong>{quota?.sceneCosts.MEMORY ?? '—'} / {quota?.sceneCosts.CONTEXT ?? '—'}</strong>
          </div>
          <button className="text-button" style={{ marginTop: 17 }} disabled={!online} onClick={() => void refreshAccount().catch(e => setError(e instanceof Error ? e.message : '刷新失败'))}>
            <RefreshCw size={12} /> 刷新额度
          </button>
        </section>

        <section className="card settings-card">
          <div className="card-title">
            <h2>跨设备数据同步</h2>
            <Cloud size={17} color="#9bad87" />
          </div>
          <div className="sync-status">
            <Cloud size={22} />
            <div>
              {sync.status === 'syncing' ? '正在同步' : sync.pending ? `${sync.pending} 条记录等待同步` : sync.lastSyncAt ? '背词记录已同步' : '尚未完成首次同步'}
              <small>上次成功：{formatTime(sync.lastSyncAt)}</small>
            </div>
          </div>
          <p className="quota-info">本地断网可正常背词，联网后自动同步进度。不同设备登录同一账号自动合并。</p>
          {sync.error && <p className="task-error" style={{ marginTop: 10 }}>{sync.error}</p>}
          <div className="form-actions">
            <button
              className="button secondary small"
              disabled={sync.status === 'syncing' || !online}
              onClick={() => void synchronize().catch(e => setError(e instanceof Error ? e.message : '同步暂未成功，记录仍保留在本地'))}
            >
              <RefreshCw size={13} /> 立即同步
            </button>
            <button className="button secondary small" onClick={() => void notify()}>
              开启复习提醒
            </button>
          </div>
          <p className="source-note" style={{ marginTop: 15 }}>账号：{user?.username} · 数据按账号隔离。</p>
        </section>
      </div>

      <section className="card settings-card">
        <div className="card-title">
          <h2>已保存的 AI 助记内容</h2>
          <span className="pill"><Sparkles size={11} />{aiTasks.length} 个任务</span>
        </div>
        {aiTasks.length ? (
          <div className="task-list">
            {[...aiTasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(task => (
              <TaskCard key={task.id} task={task} onOpenArticle={onArticle} onOpenQuestion={onQuestion} />
            ))}
          </div>
        ) : (
          <p className="muted-copy">还没有使用 AI。背单词遇到难记生词时，可点击“需要针对性辅导”唤起 AI 精讲。</p>
        )}
      </section>

      <section className="card settings-card">
        <div className="card-title">
          <h2>额度使用记录</h2>
          <small>以服务端账本为准</small>
        </div>
        {quota?.usage.length ? (
          quota.usage.map(item => (
            <div className="usage-row" key={item.id}>
              <div>
                {SCENE_NAMES[item.scene]}
                <small>
                  {formatTime(item.createdAt)} · {item.status === 'FAILED' ? '已释放 / 未扣除' : item.status === 'SUCCEEDED' ? '已消耗' : item.status === 'QUEUED' || item.status === 'RUNNING' ? '预占中' : item.status}
                </small>
              </div>
              <strong>
                {item.status === 'FAILED' ? '未扣除' : item.status === 'SUCCEEDED' ? `-${item.cost}` : item.status === 'QUEUED' || item.status === 'RUNNING' ? `预占 ${item.cost}` : String(item.cost)}
              </strong>
            </div>
          ))
        ) : (
          <p className="muted-copy">暂无用量记录。</p>
        )}
      </section>

      <div className="form-actions" style={{ justifyContent: 'space-between' }}>
        {user?.role === 'ADMIN' ? (
          <button className="button secondary" onClick={onAdmin}><ShieldCheck size={15} /> 后台管理</button>
        ) : <span />}
        <button className="text-button" onClick={() => void logout().catch(e => setError(e instanceof Error ? e.message : '退出失败'))}>
          <LogOut size={14} /> 退出账号
        </button>
      </div>
    </>
  );
}
