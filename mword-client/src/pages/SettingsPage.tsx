import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Check, Cloud, Download, LogOut, RefreshCw, ShieldCheck, Smartphone, Sparkles, Wallet } from 'lucide-react';
import { useLearningStore } from '../lib/store';
import { enableReviewReminder } from '../lib/native';
import type { AiTask, AppVersionResponse, Profile } from '../lib/types';
import { Heading, Notice, Select, TaskCard, formatTime } from '../components/ui';
import { SCENE_NAMES } from '../lib/types';
import { UpdateModal } from '../components/UpdateModal';
import { BookSelectionModal } from '../components/BookSelectionModal';
import { AiTasksModal } from '../components/AiTasksModal';
import { checkAppUpdate, getLocalAppInfo, type LocalAppInfo } from '../lib/version';

const DAILY_WORD_COUNTS = [10, 15, 20, 30, 50, 100];
const LEVEL_OPTIONS = ['基础起步', '高中水平 / 四级基础', '六级水平 / 具备常用词汇量', '考研或挑战专业高级词汇'];

function normalizeFormProfile(profile: Profile): Profile {
  const isLegacyDefault =
    !profile.onboardingCompleted &&
    (profile.goal === '读懂英文文章' || profile.goal === '读懂感兴趣的英文文章');
  const cleanedInterests = !profile.onboardingCompleted
    ? profile.interests.filter(item => item !== '科技' && item !== '旅行')
    : profile.interests;
  return {
    ...profile,
    goal: isLegacyDefault ? '' : profile.goal,
    interests: cleanedInterests,
    dailyMinutes: DAILY_WORD_COUNTS.includes(profile.dailyMinutes) ? profile.dailyMinutes : 20,
    level: LEVEL_OPTIONS.includes(profile.level) ? profile.level : '基础起步'
  };
}

export function SettingsPage({ onAdmin, onArticle, onQuestion, onSaved }: { onAdmin: () => void; onArticle: (id: string) => void; onQuestion?: (task: AiTask) => void; onSaved: (message: string) => void }) {
  const { user, profile, books, saveProfile, synchronize, refreshAccount, logout, quota, aiTasks, sync, online, reviewStates, reloadWords } = useLearningStore();
  const [form, setForm] = useState<Profile>(() => normalizeFormProfile(profile));
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [appInfo, setAppInfo] = useState<LocalAppInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<AppVersionResponse | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [showAiTasksModal, setShowAiTasksModal] = useState(false);
  const interests = ['四级通关', '六级拔高', '考研冲刺', '雅思托福', '职场进阶', '科技前沿', '日常交流', '影视美剧'];

  useEffect(() => setForm(normalizeFormProfile(profile)), [profile]);
  useEffect(() => {
    void getLocalAppInfo().then(setAppInfo);
  }, []);
  const selectedBook = books.find(book => book.id === form.bookId);

  async function handleCheckUpdate() {
    setError('');
    setCheckingUpdate(true);
    try {
      const result = await checkAppUpdate();
      setAppInfo(result.local);
      setUpdateResult(result.remote);
      setHasUpdate(result.hasUpdate);
      if (result.hasUpdate) {
        setShowUpdateModal(true);
      } else {
        onSaved(`当前已是最新版本 (v${result.local.version})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '检查更新失败，请稍后重试');
    } finally {
      setCheckingUpdate(false);
    }
  }

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

  async function syncVocabCache() {
    setError('');
    setBusy(true);
    try {
      await reloadWords();
      onSaved('当前词库已从服务器同步至最新版本（已刷新本地缓存）');
    } catch (e) {
      setError(e instanceof Error ? e.message : '刷新词库失败，请检查网络');
    } finally {
      setBusy(false);
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

      <section className="card settings-card" style={{ marginBottom: 20 }}>
        <div className="card-title">
          <h2>当前学习词书</h2>
          <span className="pill">{selectedBook?.name || '未选择'}</span>
        </div>

        {selectedBook ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: selectedBook.id === 'cet4' ? '#4a6b57' : selectedBook.id === 'cet6' ? '#3b6e8c' : '#8c5b3b',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: 18,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
                  }}
                >
                  {selectedBook.id === 'cet4' ? '4' : selectedBook.id === 'cet6' ? '6' : selectedBook.id === 'postgraduate' ? '研' : selectedBook.name.slice(0, 1)}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1c1917' }}>{selectedBook.name}</h3>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#78716c' }}>
                    {selectedBook.wordCount.toLocaleString()} 词 · {selectedBook.version}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="button primary small"
                  onClick={() => setShowBookModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <BookOpen size={13} /> 更换词书 / 浏览书库
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => void syncVocabCache()}
                  title="重新拉取最新词条并刷新本地离线缓存"
                >
                  <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> 刷新缓存
                </button>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: '#57534e', lineHeight: 1.5 }}>
              {selectedBook.description}
            </p>

            <div className="source-note" style={{ margin: 0, padding: '10px 12px', background: '#f5f5f4', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11 }}>词表来源：<a href={selectedBook.sourceUrl} target="_blank" rel="noreferrer">查看原始词表</a> · {selectedBook.licenseUrl ? <a href={selectedBook.licenseUrl} target="_blank" rel="noreferrer">{selectedBook.license}</a> : selectedBook.license}</span>
                <span style={{ fontSize: 11, color: '#78716c' }}>切换词书将自动保留已背词汇学习记录</span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#a8a29e' }}>{selectedBook.attribution?.join("；")}</p>
              <div className="license-links" style={{ marginTop: 6 }}>
                <a href={`${import.meta.env.BASE_URL}licenses/ATTRIBUTION.md`} download>下载来源说明</a>
                <a href={`${import.meta.env.BASE_URL}licenses/CC-BY-SA-4.0.txt`} download>CC-BY-SA-4.0 许可</a>
                <a href={`${import.meta.env.BASE_URL}licenses/ECDICT-MIT.txt`} download>ECDICT MIT 许可</a>
                <a href={`${import.meta.env.BASE_URL}licenses/TATOEBA-CC-BY-2.0-FR.md`} download>例句许可与署名</a>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#78716c', marginBottom: 12 }}>尚未选择学习词书，请从词书库中挑选一本开启背词</p>
            <button type="button" className="button primary" onClick={() => setShowBookModal(true)}>
              <BookOpen size={14} style={{ marginRight: 6 }} /> 浏览词书库并选择
            </button>
          </div>
        )}
      </section>

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

          <div className="field">
            <span>每天背词数量</span>
            <Select
              ariaLabel="每天背词数量"
              value={form.dailyMinutes}
              options={DAILY_WORD_COUNTS.map(count => ({ value: count, label: `${count} 个新词` }))}
              onChange={value => setForm({ ...form, dailyMinutes: value })}
            />
          </div>

          <div className="field">
            <span>基础起点自评</span>
            <Select
              ariaLabel="基础起点自评"
              value={form.level}
              options={LEVEL_OPTIONS.map(level => ({ value: level, label: level }))}
              onChange={value => setForm({ ...form, level: value })}
            />
            <small>用于辅助 AI 难词释义与例句难度参考。</small>
          </div>
        </div>

        <div className="form-actions">
          <button className="button" disabled={busy} onClick={() => void save()}>
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
          <div>
            <div className="task-list" style={{ marginBottom: aiTasks.length > 2 ? 14 : 0 }}>
              {/* 仅展示最新 2 条快速回顾，避免无限拉长页面 */}
              {[...aiTasks]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 2)
                .map(task => (
                  <TaskCard key={task.id} task={task} onOpenArticle={onArticle} onOpenQuestion={onQuestion} />
                ))}
            </div>

            {aiTasks.length > 2 && (
              <button
                type="button"
                className="button secondary"
                style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '10px 16px' }}
                onClick={() => setShowAiTasksModal(true)}
              >
                <Sparkles size={14} color="#4a6b57" />
                查看全部已沉淀助记 ({aiTasks.length} 条) 与分类检索 &gt;
              </button>
            )}
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

      <section className="card settings-card">
        <div className="card-title">
          <h2>应用版本与更新检测</h2>
          <span className="pill">
            <Smartphone size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />
            {appInfo?.isNative ? (appInfo.platform === 'ios' ? 'iOS 客户端' : 'Android 客户端') : 'Web 在线端'}
          </span>
        </div>

        <div className="stat-line">
          <span>当前安装版本</span>
          <strong>v{appInfo?.version || '1.0.0'} {appInfo?.isNative ? `(Build ${appInfo.build})` : ''}</strong>
        </div>

        {hasUpdate && updateResult && (
          <div style={{ marginTop: 14, padding: 12, backgroundColor: '#ecfdf5', borderRadius: 12, border: '1px solid #a7f3d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong style={{ color: '#065f46', fontSize: 13, display: 'block' }}>
                  ✨ 发现新版本 v{updateResult.latestVersionName}
                </strong>
                <span style={{ color: '#047857', fontSize: 12 }}>
                  包含多项体验优化与功能更新，点击可查看更新日志
                </span>
              </div>
              <button
                type="button"
                className="button primary small"
                style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => setShowUpdateModal(true)}
              >
                查看更新
              </button>
            </div>
          </div>
        )}

        <div className="form-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="button secondary small"
            disabled={checkingUpdate || !online}
            onClick={() => void handleCheckUpdate()}
          >
            <RefreshCw size={13} className={checkingUpdate ? 'animate-spin' : ''} />
            {checkingUpdate ? '正在检查...' : '检查新版本'}
          </button>
          {updateResult && (
            <button
              type="button"
              className="text-button"
              style={{ fontSize: 13 }}
              onClick={() => setShowUpdateModal(true)}
            >
              查看更新日志
            </button>
          )}
        </div>
      </section>

      <div className="form-actions" style={{ justifyContent: 'space-between' }}>
        {user?.role === 'ADMIN' ? (
          <button className="button secondary" onClick={onAdmin}><ShieldCheck size={15} /> 后台管理</button>
        ) : <span />}
        <button className="text-button" onClick={() => void logout().catch(e => setError(e instanceof Error ? e.message : '退出失败'))}>
          <LogOut size={14} /> 退出账号
        </button>
      </div>

      <UpdateModal
        open={showUpdateModal}
        versionInfo={updateResult}
        currentVersion={appInfo?.version}
        onClose={() => setShowUpdateModal(false)}
      />

      <BookSelectionModal
        open={showBookModal}
        currentBookId={form.bookId}
        books={books}
        onSelect={bookId => {
          setForm(prev => ({ ...prev, bookId }));
          if (profile.onboardingCompleted) {
            void saveProfile({ bookId });
            onSaved(`已切换词书为：${books.find(b => b.id === bookId)?.name || bookId}`);
          }
        }}
        onClose={() => setShowBookModal(false)}
      />

      <AiTasksModal
        open={showAiTasksModal}
        tasks={aiTasks}
        onClose={() => setShowAiTasksModal(false)}
        onOpenArticle={onArticle}
        onOpenQuestion={onQuestion}
      />
    </>
  );
}
