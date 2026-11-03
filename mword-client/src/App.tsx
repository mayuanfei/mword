import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Brain, ChartNoAxesCombined, Check, ChevronRight, CircleUserRound, Cloud, CloudOff, Compass, Flame, Leaf, LoaderCircle, LogIn, RefreshCw, Search, Sparkles, Sprout, Target, Users, Volume2, Zap } from 'lucide-react';
import { useLearningStore } from './lib/store';
import { dailyNewWordGoal, localDayBounds, selectDailyPlan } from './lib/dailyPlan';
import { useLearningClock } from './lib/useLearningClock';
import { speakWord } from './lib/native';
import type { AppVersionResponse, Word } from './lib/types';
import { Brand, Heading, Metric, Notice, ProgressRing, formatTime } from './components/ui';
import { WordDrawer } from './components/WordDrawer';
import { UpdateModal } from './components/UpdateModal';
import { checkAppUpdate, isVersionSkipped } from './lib/version';
import { ReviewPage } from './pages/ReviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminAiPage, AdminPage, AdminUsersPage } from './pages/AdminPage';

type Page = 'today' | 'review' | 'progress' | 'settings' | 'admin' | 'admin-ai' | 'admin-users';

const navigation = [
  { id: 'today' as Page, name: '今日背词', mobile: '今日', icon: Compass },
  { id: 'review' as Page, name: '背词会话', mobile: '背词', icon: Brain },
  { id: 'progress' as Page, name: '词书进度', mobile: '词库', icon: ChartNoAxesCombined },
  { id: 'settings' as Page, name: '我的设置', mobile: '设置', icon: CircleUserRound }
];

const adminNavigation = [
  { id: 'admin-ai' as Page, name: 'AI 管理', mobile: 'AI', icon: Sparkles },
  { id: 'admin-users' as Page, name: '用户管理', mobile: '用户', icon: Users }
];

function LoginPage() {
  const { authenticate, error, clearError, loading } = useLearningStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError('');
    setInfoMessage('');
    clearError();
    if (mode === 'register') {
      if (password.length < 6) {
        setLocalError('密码长度至少需要 6 位字符。');
        return;
      }
      if (password !== confirm) {
        setLocalError('两次密码输入不一致，请检查。');
        return;
      }
    }
    setBusy(true);
    try {
      await authenticate(mode, { username: username.trim(), password });
      setPassword('');
      setConfirm('');
      if (mode === 'register' && !useLearningStore.getState().user) {
        setMode('login');
        setInfoMessage('注册申请已提交！请等待管理员审核通过后再登录。');
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '连接服务失败，请确认后台已启动后重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div className="login-story-main">
          <div className="eyebrow">EFFORTLESS VOCABULARY</div>
          <h1>
            每天背几个词，<br />
            开启你的<br />
            <em>word journey.</em>
          </h1>
          <p>纯粹聚焦在记牢单词的核心需求。结合艾宾浩斯智能复习与多维助记卡片，让背单词轻松自然、不易遗忘。</p>
          <div className="login-word">
            <b>remember</b>
            <span className="pronunciation">/rɪˈmembər/</span>
            <p>v. 记住；回想起<br />大脑的主动提取，才是对抗遗忘最有力的武器。</p>
            <small>ACTIVE RECALL · SPACED REPETITION</small>
          </div>
        </div>
        <div className="login-bottom">属于你的极简背词工具。Web · Android · iOS</div>
      </section>

      <section className="login-form-side">
        <form className="login-form" onSubmit={event => void submit(event)}>
          <div className="eyebrow">WELCOME TO YOUR WORD SPACE</div>
          <h2>{mode === 'login' ? '欢迎回来' : '开启背词旅程'}</h2>
          <p>{mode === 'login' ? '登录同一个账号，在不同设备上无缝同步进度。' : '创建服务端账号，保存你的词书进度与复习安排。'}</p>

          <div className="login-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => { setMode('login'); setLocalError(''); setInfoMessage(''); clearError(); }}
            >
              登录账号
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => { setMode('register'); setLocalError(''); setInfoMessage(''); clearError(); }}
            >
              注册账号
            </button>
          </div>

          {infoMessage && <Notice onDismiss={() => setInfoMessage('')}>{infoMessage}</Notice>}
          {(error || localError) && <Notice kind="error">{localError || error}</Notice>}

          <label className="field">
            账号
            <input
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={64}
              placeholder="输入你的账号"
              required
            />
          </label>

          <label className="field">
            密码
            <input
              value={password}
              onChange={event => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 6 : 1}
              maxLength={72}
              placeholder={mode === 'register' ? '至少 6 位字符' : '输入密码'}
              required
            />
          </label>

          {mode === 'register' && (
            <label className="field">
              确认密码
              <input
                value={confirm}
                onChange={event => setConfirm(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={6}
                maxLength={72}
                placeholder="再输入一次密码 (至少 6 位)"
                required
              />
            </label>
          )}

          <button className="button" disabled={busy || loading} type="submit">
            {busy ? <LoaderCircle size={15} className="spin" /> : <LogIn size={15} />}
            {busy ? '正在连接后台' : mode === 'login' ? '登录，开始背词' : '创建账号'}
          </button>

          <p className="login-hint">首次登录需要联网。已登录后，词库和基础复习支持全离线使用。</p>
          <details className="login-service">
            <summary>连接不上服务？</summary>
            <p className="login-hint">Web 请确认 /mword-api 服务已部署或本地后台已启动；手机安装包需要在构建时配置 HTTPS API 地址。</p>
          </details>
        </form>
      </section>
    </div>
  );
}

export default function App() {
  const state = useLearningStore();
  const { initialized, bootstrap, user, profile, books, words, events, reviewStates, sync, online, error, clearError, synchronize, recordEvent, studySessions, createStudySession, saveStudyQuestion } = state;
  const [page, setPage] = useState<Page>('today');
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [vocabPage, setVocabPage] = useState(0);
  const [toast, setToast] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'due' | 'learning' | 'new'>('all');
  const [autoUpdateInfo, setAutoUpdateInfo] = useState<AppVersionResponse | null>(null);
  const [currentAppVersion, setCurrentAppVersion] = useState<string>('');
  const [showAutoUpdate, setShowAutoUpdate] = useState(false);

  const currentSession = studySessions[profile.bookId];
  const hasPendingSession = !!currentSession && currentSession.index < currentSession.queue.length;
  const currentBook = books.find(book => book.id === profile.bookId);
  const now = useLearningClock(reviewStates);
  const currentWordIds = useMemo(() => new Set(words.map(word => word.id)), [words]);
  const due = useMemo(() => reviewStates.filter(item => currentWordIds.has(item.wordId) && Date.parse(item.dueAt) <= now), [reviewStates, currentWordIds, now]);
  const scheduled = useMemo(() => new Set(reviewStates.map(item => item.wordId)), [reviewStates]);
  const unlearnedWords = useMemo(() => words.filter(word => !scheduled.has(word.id)), [words, scheduled]);

  const dailyBatchSize = dailyNewWordGoal(profile.dailyMinutes);
  const dailyPlan = useMemo(() => selectDailyPlan(words, events, profile.dailyMinutes, now), [words, events, profile.dailyMinutes, now]);
  const todayNewWords = dailyPlan.remainingWords;
  const todayStudyWordIds = [...new Set([...due.map(state => state.wordId), ...todayNewWords.map(word => word.id)])];
  const pendingWordIds = useMemo(() => new Set(hasPendingSession ? currentSession.queue.slice(currentSession.index) : []), [hasPendingSession, currentSession]);
  const completedNewCount = useMemo(() => dailyPlan.targetWords.filter(word => !dailyPlan.remainingWords.some(rem => rem.id === word.id) && !pendingWordIds.has(word.id)).length, [dailyPlan, pendingWordIds]);
  const dailyTarget = dailyPlan.targetWords.length;
  const newGoalReached = dailyTarget > 0 && completedNewCount === dailyTarget && !hasPendingSession;

  // 今日打卡统计
  const todayEvents = useMemo(() => {
    const { start, end } = localDayBounds(now);
    return events.filter(item => Date.parse(item.occurredAt) >= start && Date.parse(item.occurredAt) < end);
  }, [events, now]);
  const todayRecalls = useMemo(() => todayEvents.filter(item => item.kind === 'RECALL'), [todayEvents]);
  const todayWords = useMemo(() => new Set(todayRecalls.map(item => item.wordId)), [todayRecalls]);

  const reviewedWords = useMemo(() => new Set(reviewStates.map(item => item.wordId)), [reviewStates]);
  const selectedReviewed = words.filter(word => reviewedWords.has(word.id)).length;

  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (user && !profile.onboardingCompleted) setPage('settings');
  }, [user?.id, profile.onboardingCompleted]);
  useEffect(() => {
    setSelectedWord(null);
  }, [user?.id]);
  useEffect(() => {
    if (!initialized) return;
    void (async () => {
      try {
        const { local, remote, hasUpdate } = await checkAppUpdate();
        setCurrentAppVersion(local.version);
        if (hasUpdate) {
          if (remote.forceUpdate || !isVersionSkipped(remote.latestVersionName)) {
            setAutoUpdateInfo(remote);
            setShowAutoUpdate(true);
          }
        }
      } catch {
        // 静默处理检测异常
      }
    })();
  }, [initialized]);

  function navigate(next: Page) {
    if (next === 'review' && !hasPendingSession && words.length > 0 && todayStudyWordIds.length > 0) {
      void beginSession(todayStudyWordIds);
      return;
    }
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function showWord(word: Word) {
    setSelectedWord(word);
    try {
      await recordEvent({ wordId: word.id, senseId: word.senseId, kind: 'EXPOSURE', rating: 1, usedHint: false });
    } catch (e) {
      setToast(e instanceof Error ? e.message : '查词记录保存失败');
    }
  }

  async function beginSession(ids: string[], append = false) {
    if (startingRef.current || !words.length) return;
    const accountId = user?.id;
    startingRef.current = true; setStarting(true);
    try {
      await createStudySession(ids, append);
      if (useLearningStore.getState().user?.id !== accountId) return;
      setSelectedWord(null); setPage('review');
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (e) {
      if (useLearningStore.getState().user?.id === accountId) setToast(e instanceof Error ? e.message : '会话未能保存，请重试。');
    } finally { startingRef.current = false; setStarting(false); }
  }

  function startStudySession(mode: 'all' | 'due' | 'new' = 'all') {
    if (!words.length) { setToast('词库正在加载，请稍候再试。'); return; }
    const ids = mode === 'due' ? due.map(state => state.wordId)
      : mode === 'new' ? todayNewWords.map(word => word.id) : todayStudyWordIds;
    if (!ids.length) { setToast('当前没有待学单词，可以主动加学或切换词书。'); return; }
    void beginSession(ids);
  }

  function learnMoreBatch() {
    if (!words.length) { setToast('词库正在加载，请稍候再试。'); return; }
    const ids = unlearnedWords.slice(0, dailyBatchSize).map(word => word.id);
    if (!ids.length) { setToast('词书中没有更多未学单词啦！'); return; }
    void beginSession(ids, hasPendingSession);
  }

  // 词库过滤与搜索
  const filteredWords = useMemo(() => {
    let list = words;
    if (filterStatus === 'due') {
      const dueSet = new Set(due.map(s => s.wordId));
      list = list.filter(w => dueSet.has(w.id));
    } else if (filterStatus === 'learning') {
      list = list.filter(w => scheduled.has(w.id));
    } else if (filterStatus === 'new') {
      list = list.filter(w => !scheduled.has(w.id));
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(w => w.lemma.toLowerCase().includes(q) || (w.meaning && w.meaning.toLowerCase().includes(q)));
    }
    return list;
  }, [words, filterStatus, searchTerm, due, scheduled]);

  const pageSize = 40;
  const pageCount = Math.max(1, Math.ceil(filteredWords.length / pageSize));
  const shownPage = Math.min(vocabPage, pageCount - 1);
  const visibleWords = filteredWords.slice(shownPage * pageSize, (shownPage + 1) * pageSize);
  useEffect(() => setVocabPage(0), [searchTerm, filterStatus, profile.bookId]);

  if (!initialized) return <div className="loading-screen"><div><Sprout size={36} /><p>正在加载你的单词空间…</p></div></div>;
  if (!user) return <LoginPage />;

  const currentNav = [...navigation, ...adminNavigation].find(item => item.id === page);
  const isGoalReached = words.length > 0 && newGoalReached && due.length === 0 && !hasPendingSession;

  return (
    <div className={`app ${page === 'review' ? 'studying' : ''}`}>
      <aside className="side">
        <Brand />
        <p className="nav-caption">EFFORTLESS VOCAB</p>
        <nav className="side-nav" aria-label="主要导航">
          {navigation.map(item => (
            <button
              key={item.id}
              className={`nav-button ${page === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              {item.name}
              {item.id === 'today' && due.length > 0 && <span className="nav-count">{due.length}</span>}
              {item.id === 'review' && due.length > 0 && <span className="nav-count">{due.length}</span>}
            </button>
          ))}
        </nav>

        {user.role === 'ADMIN' && (
          <>
            <p className="nav-caption" style={{ marginTop: 28 }}>ADMINISTRATION</p>
            <nav className="side-nav" aria-label="后台管理导航">
              {adminNavigation.map(item => (
                <button
                  key={item.id}
                  className={`nav-button ${page === item.id ? 'active' : ''}`}
                  onClick={() => navigate(item.id)}
                >
                  <item.icon size={18} />
                  {item.name}
                </button>
              ))}
            </nav>
          </>
        )}

        <div className="side-note">
          <Leaf size={19} />
          <h4>主动回忆，对抗遗忘。</h4>
          <p>看词想义，先在大脑中检索，再借助词根巧记强化记忆。</p>
        </div>

        <div className="side-account">
          <div className="avatar">{user.username.slice(0, 1).toUpperCase()}</div>
          <div>
            <b>{user.username}</b>
            <small>{currentBook?.name || '选择词书'}</small>
          </div>
          <button className="icon-button" aria-label="打开设置" onClick={() => navigate('settings')}>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="crumb">
            我的背词空间 <ChevronRight size={12} />
            <strong>{currentNav?.name || '后台管理'}</strong>
          </div>
          <div className="mobile-brand"><Brand /></div>
          <div className="topbar-tools">
            <button
              className={`sync-pill ${!online || sync.pending || sync.error ? 'warn' : ''}`}
              disabled={sync.status === 'syncing' || !online}
              onClick={() => void synchronize().catch(e => setToast(e instanceof Error ? e.message : '同步失败，记录保留在本地'))}
              title={sync.error || `上次成功：${formatTime(sync.lastSyncAt)}`}
            >
              {!online ? <CloudOff size={14} /> : sync.status === 'syncing' ? <LoaderCircle size={14} className="spin" /> : <Cloud size={14} />}
              <span>{!online ? '离线使用' : sync.status === 'syncing' ? '同步中' : sync.pending ? `${sync.pending} 条待同步` : sync.lastSyncAt ? '已同步' : '点击同步'}</span>
            </button>
            <div className="mini-profile">
              <span className="avatar" style={{ height: 27, width: 27, fontSize: 10 }}>{user.username.slice(0, 1).toUpperCase()}</span>
              {user.username}
            </div>
          </div>
        </header>

        <main className="main">
          {error && <Notice kind="error" onDismiss={clearError}>{error}</Notice>}
          {!online && <Notice kind="warning">当前离线。词库与主动回忆可照常使用，联网后自动同步进度。</Notice>}

          {/* 今日背词主页 */}
          {page === 'today' && (
            <>
              <Heading
                eyebrow="ONE WORD AT A TIME"
                title={`你好，${user.username}。今天也来背几词。`}
                description="主动提取、艾宾浩斯复习、词根巧记辅助，轻松记牢每一个词。"
              />

              <div className="today-columns">
                <div className="main-stack">
                  {/* 今日核心任务行动区 */}
                  <section className="study-hero">
                    <div className="hero-top">
                      <span className="pill"><Brain size={12} /> 今日背词计划</span>
                      <span className="pill grey">{currentBook?.name}</span>
                    </div>

                    <h2 className="study-hero-title">
                      {isGoalReached ? '🎉 今日背词任务已达成！' : '准备好开始今天的背词了吗？'}
                    </h2>

                    <p className="study-hero-desc">
                      {isGoalReached
                        ? `你今天已经完成了 ${todayWords.size} 个单词的主动回忆，到期复习也已全部清空。继续保持，词汇量自然飞跃！`
                        : '先通过艾宾浩斯周期对抗遗忘，再按部就班吸收新词。翻开卡片前先在脑中回忆，记忆更牢固。'}
                    </p>

                    <div className="study-task-badges">
                      <div className="study-badge orange">
                        <RefreshCw size={13} />
                        到期待复习 <b>{due.length}</b> 词
                      </div>
                      <div className="study-badge">
                        <Sprout size={13} />
                        今日新词 <b>{todayNewWords.length}</b> 词
                      </div>
                      <div className="study-badge">
                        <Flame size={13} />
                        今日已背 <b>{todayWords.size}</b> 词
                      </div>
                    </div>

                    {hasPendingSession && <p className="session-note">本机已保存本轮进度与错词队列。开启新一轮会替换当前会话，学习记录仍保留。</p>}
                    <div className="study-hero-actions">
                      <button className="button primary-hero" disabled={starting || !words.length || (!hasPendingSession && todayStudyWordIds.length === 0)} onClick={() => hasPendingSession ? navigate('review') : startStudySession('all')}>
                        <Zap size={16} /> {hasPendingSession ? `继续本轮背词 (${currentSession.queue.length - currentSession.index} 词)` : `开始今日背词 (${todayStudyWordIds.length} 词)`} <ArrowRight size={15} />
                      </button>

                      {hasPendingSession && todayStudyWordIds.length > 0 && <button className="button secondary" disabled={starting || !words.length} onClick={() => startStudySession('all')}>开始新一轮</button>}

                      {due.length > 0 && (
                        <button className="button secondary sub-hero" disabled={starting || !words.length} onClick={() => startStudySession('due')}>
                          仅复习到期词 ({due.length})
                        </button>
                      )}

                      {todayNewWords.length > 0 && (
                        <button className="button secondary sub-hero" disabled={starting || !words.length} onClick={() => startStudySession('new')}>
                          仅学新词 ({todayNewWords.length})
                        </button>
                      )}

                      {isGoalReached && unlearnedWords.length > 0 && (
                        <button className="button secondary sub-hero" disabled={starting || !words.length} onClick={learnMoreBatch}>
                          再学一组新词 (+{Math.min(dailyBatchSize, unlearnedWords.length)})
                        </button>
                      )}
                    </div>
                  </section>

                  {/* 核心指标行 */}
                  <div className="metric-row">
                    <Metric
                      label="今天已背"
                      value={todayWords.size}
                      unit="词"
                      detail="今日主动回忆词数"
                      icon={<Brain size={12} />}
                    />
                    <Metric
                      label="到期复习"
                      value={due.length}
                      unit="词"
                      detail={due.length ? '艾宾浩斯周期提醒' : '复习任务已清空'}
                      icon={<RefreshCw size={12} />}
                    />
                    <Metric
                      label="词书总进度"
                      value={`${Math.round((selectedReviewed / Math.max(1, currentBook?.wordCount ?? words.length)) * 100)}%`}
                      unit=""
                      detail={`已学 ${selectedReviewed} / ${currentBook?.wordCount ?? words.length} 词`}
                      icon={<BookOpen size={12} />}
                    />
                  </div>

                  {/* 今日新词预习快览 */}
                  <section className="card word-section">
                    <div className="card-title">
                      <h2>今日新词预习</h2>
                      <button className="text-button" onClick={() => navigate('progress')}>
                        查看全部词库 <ChevronRight size={12} />
                      </button>
                    </div>

                    <div className="word-grid">
                      {todayNewWords.map(word => (
                        <button className="word-tile" key={word.id} onClick={() => void showWord(word)}>
                          <b>{word.lemma}</b>
                          <p>{word.meaning || '点击查看完整释义与助记'}</p>
                          <small><Volume2 size={11} /> 点击预习发音 & 词根</small>
                        </button>
                      ))}
                    </div>

                    {!todayNewWords.length && (
                      <p className="muted-copy">{unlearnedWords.length ? '今日新词计划已完成，可以按自己的节奏主动加学。' : '当前词书已没有未学新词，太棒了！'}</p>
                    )}
                  </section>
                </div>

                {/* 右侧边栏 */}
                <aside className="right-stack">
                  <section className="card daily-plan">
                    <div className="card-title">
                      <h2>背词达成度</h2>
                      <span className="pill grey">每日目标</span>
                    </div>

                    <div className="plan-ring">
                      <ProgressRing value={dailyTarget ? (completedNewCount / dailyTarget) * 100 : 100} />
                      <div>
                        <b>{completedNewCount} / {dailyTarget} 词</b>
                        <p>{newGoalReached ? '今日新词目标已达成！' : hasPendingSession ? `当轮还有 ${currentSession.queue.length - currentSession.index} 词待强化` : '坚持每天背一组新词'}</p>
                      </div>
                    </div>

                    <div className="plan-list">
                      <div className={`plan-line ${due.length === 0 ? 'done' : ''}`}>
                        <span className="step-icon"><Check size={12} /></span>
                        清空到期复习 <strong>{due.length === 0 ? '已清空' : `剩 ${due.length} 词`}</strong>
                      </div>
                      <div className={`plan-line ${newGoalReached ? 'done' : ''}`}>
                        <span className="step-icon"><Check size={12} /></span>
                        吸收今日新词 <strong>{completedNewCount} / {dailyTarget}</strong>
                      </div>
                      <div className={`plan-line ${todayEvents.some(item => item.kind === 'CONTEXT') ? 'done' : ''}`}>
                        <span className="step-icon"><Check size={12} /></span>
                        新句检测巩固 <strong>{todayEvents.filter(item => item.kind === 'CONTEXT').length} 题</strong>
                      </div>
                    </div>
                  </section>

                  <section className="card review-callout">
                    <div className="eyebrow">SPACED REPETITION</div>
                    <div className="review-number">{due.length}<span>个词需要复习</span></div>
                    <p>{due.length ? '记忆在反复相遇中生根。花几分钟，巩固昨天的成果。' : '当前没有待复习的词，可以开启下一批新词！'}</p>
                    {due.length > 0 && (
                      <button className="button orange small" onClick={() => startStudySession('due')}>
                        立即复习 <ArrowRight size={12} />
                      </button>
                    )}
                  </section>

                  <div className="quote-note">
                    <p>“Repetition is the mother of learning, the father of action.”</p>
                    <small>重复是学习之母。每天一点，牢牢记住。</small>
                  </div>
                </aside>
              </div>
            </>
          )}

          {/* 背词会话页面 */}
          {page === 'review' && (
            <ReviewPage
              now={now}
              onOpenWord={word => setSelectedWord(word)}
              onSettings={() => navigate('settings')}
              onHome={() => navigate('today')}
              onLearnMore={learnMoreBatch}
            />
          )}

          {/* 词书与词库进度 */}
          {page === 'progress' && (
            <>
              <Heading
                eyebrow="VOCABULARY DASHBOARD"
                title="词书进度与词库检索"
                description="掌握当前词书的整体背词情况，支持快速检索查词、查看词根与助记。"
              />

              <div className="progress-grid" style={{ marginTop: 0, marginBottom: 24 }}>
                <section className="card progress-card">
                  <div className="card-title">
                    <h2>当前词书</h2>
                    <span className="pill">{currentBook?.name}</span>
                  </div>
                  <div className="progress-book">
                    <header>
                      <span>已开始学习</span>
                      <span>{selectedReviewed} / {currentBook?.wordCount ?? words.length} 词</span>
                    </header>
                    <div className="bar">
                      <div
                        className="bar-fill"
                        style={{ width: `${currentBook?.wordCount ? (selectedReviewed / currentBook.wordCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="stat-line">
                    <span>词书总词量</span>
                    <strong>{currentBook?.wordCount ?? words.length} 词</strong>
                  </div>
                  <div className="stat-line">
                    <span>到期待复习</span>
                    <strong style={{ color: due.length > 0 ? '#b86e39' : '#56723f' }}>{due.length} 词</strong>
                  </div>
                  <div className="stat-line">
                    <span>未学习新词</span>
                    <strong>{unlearnedWords.length} 词</strong>
                  </div>
                </section>

                <section className="card progress-card">
                  <div className="card-title">
                    <h2>最近背词足迹</h2>
                    <Flame size={16} color="#d2aa78" />
                  </div>
                  {events.filter(item => item.kind !== 'EXPOSURE').slice(-5).reverse().map(item => (
                    <div className="activity" key={item.eventId}>
                      <span className="activity-icon">
                        {item.kind === 'CONTEXT' ? <Target size={15} /> : <Brain size={15} />}
                      </span>
                      <div>
                        <b>{words.find(word => word.id === item.wordId)?.lemma || '单词'}</b>
                        <small>{item.kind === 'CONTEXT' ? '新句练习' : '主动回忆'} · {formatTime(item.occurredAt)}</small>
                      </div>
                      <span>
                        {item.kind === 'CONTEXT'
                          ? (item.rating >= 3 ? '理解正确' : '需巩固')
                          : ['', '忘记了', '费力想起', '正常想起', '轻松想起'][item.rating]}
                      </span>
                    </div>
                  ))}
                  {!events.some(item => item.kind !== 'EXPOSURE') && (
                    <p className="muted-copy">完成第一次背词后，这里将记录你的足迹。</p>
                  )}
                </section>
              </div>

              {/* 词库浏览与检索工具 */}
              <section className="card settings-card">
                <div className="card-title vocab-browser-header">
                  <h2>词书单词速查 ({filteredWords.length} 词)</h2>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(['all', 'due', 'learning', 'new'] as const).map(status => (
                      <button
                        key={status}
                        className={`chip ${filterStatus === status ? 'selected' : ''}`}
                        aria-pressed={filterStatus === status}
                        onClick={() => setFilterStatus(status)}
                        style={{ padding: '4px 10px', fontSize: 11 }}
                      >
                        {status === 'all' ? '全部' : status === 'due' ? `待复习 (${due.length})` : status === 'learning' ? '学习中' : '未学习'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="search-bar-wrap">
                  <Search size={16} className="search-icon" />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    aria-label="搜索词书单词"
                    placeholder="输入英文单词或中文释义搜索..."
                  />
                </div>

                <div className="vocab-table">
                  {visibleWords.map(word => {
                    const isDue = due.some(d => d.wordId === word.id);
                    const isLearning = scheduled.has(word.id);
                    return (
                      <button type="button" className="vocab-row" key={word.id} aria-label={`查看 ${word.lemma} 的释义与讲解`} onClick={() => void showWord(word)}>
                        <div className="vocab-word-info">
                          <b>{word.lemma}</b>
                          <span className="phonetic">{word.phonetic}</span>
                          <span className="vocab-meaning">{word.meaning}</span>
                        </div>
                        <span className={`vocab-status-pill ${isDue ? 'learning' : isLearning ? 'mastered' : 'new'}`}>
                          {isDue ? '待复习' : isLearning ? '已学习' : '未学习'}
                        </span>
                      </button>
                    );
                  })}
                  {pageCount > 1 && <nav className="vocab-pagination" aria-label="词库分页">
                    <button className="button secondary small" disabled={shownPage === 0} onClick={() => setVocabPage(shownPage - 1)}>上一页</button>
                    <span role="status">第 {shownPage + 1} / {pageCount} 页 · {shownPage * pageSize + 1}–{Math.min((shownPage + 1) * pageSize, filteredWords.length)} / {filteredWords.length} 词</span>
                    <button className="button secondary small" disabled={shownPage === pageCount - 1} onClick={() => setVocabPage(shownPage + 1)}>下一页</button>
                  </nav>}
                  {filteredWords.length === 0 && (
                    <p className="muted-copy" style={{ textAlign: 'center', padding: '24px 0' }}>
                      未找到匹配的单词。
                    </p>
                  )}
                </div>
              </section>
            </>
          )}

          {/* 设置页面 */}
          {page === 'settings' && (
            <SettingsPage
              onAdmin={() => setPage('admin')}
              onArticle={() => undefined}
              onQuestion={task => {
                const wordId = task.wordId;
                if (!wordId || !words.length) return;
                void (async () => {
                  if (!hasPendingSession || currentSession.queue[currentSession.index] !== wordId) {
                    await beginSession([wordId]);
                  } else {
                    setPage('review');
                  }
                  const latest = useLearningStore.getState().studySessions[profile.bookId];
                  if (latest && latest.queue[latest.index] === wordId) {
                    await saveStudyQuestion?.({ id: latest.id, index: latest.index }, { questionTaskId: task.id, questionAnswer: null, questionSubmitted: false, translationHintUsed: false });
                  }
                })();
              }}
              onSaved={message => {
                setToast(message);
                if (!profile.onboardingCompleted) setPage('today');
              }}
            />
          )}

          {/* 管理页面 */}
          {page === 'admin-ai' && <AdminAiPage />}
          {page === 'admin-users' && <AdminUsersPage />}
          {page === 'admin' && <AdminPage onBack={() => navigate('settings')} />}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="手机主要导航">
        {navigation.map(item => (
          <button
            key={item.id}
            className={page === item.id ? 'active' : ''}
            onClick={() => navigate(item.id)}
          >
            <item.icon size={21} />
            {item.mobile}
          </button>
        ))}
      </nav>

      {/* 单词抽屉（发音、释义、离线多维助记卡片） */}
      {selectedWord && (
        <WordDrawer
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
          reviewLabel={page === 'review' ? '关闭讲解，继续本轮' : hasPendingSession ? '加入本轮背词' : '单词专项复习'}
          onReview={() => {
            if (page === 'review') setSelectedWord(null);
            else void beginSession([selectedWord.id], hasPendingSession);
          }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      <UpdateModal
        open={showAutoUpdate}
        versionInfo={autoUpdateInfo}
        currentVersion={currentAppVersion}
        onClose={() => setShowAutoUpdate(false)}
      />
    </div>
  );
}
