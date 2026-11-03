import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  Edit3,
  History,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  X
} from 'lucide-react';
import { useLearningStore } from '../lib/store';
import type { AdminData, AdminLedgerEntry, AdminTask, AdminUsage, AdminUser, AiScene, AiStats, PageResult, ProviderInput } from '../lib/types';
import { SCENE_NAMES } from '../lib/types';
import { Heading, Metric, Notice, Select, formatTime } from '../components/ui';

function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel = '条记录'
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newSize: number) => void;
  itemLabel?: string;
}) {
  const safeTotalPages = Math.max(1, totalPages);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid #edf2e8',
        fontSize: 12,
        color: '#6d8357'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>
          共 <b>{total}</b> {itemLabel} · 第 <b>{page}</b> / <b>{safeTotalPages}</b> 页
        </span>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            style={{
              border: '1px solid #d4dfcc',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 11,
              background: '#fcfdf9',
              color: '#4c5e41',
              cursor: 'pointer'
            }}
          >
            <option value={10}>10 条/页</option>
            <option value={20}>20 条/页</option>
            <option value={50}>50 条/页</option>
          </select>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          className="button secondary small"
          style={{ padding: '2px 8px', fontSize: 11, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
        >
          首页
        </button>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="button secondary small"
          style={{ padding: '2px 10px', fontSize: 11, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
        >
          上一页
        </button>
        <span style={{ padding: '0 4px', fontWeight: 600, color: '#4c5e41' }}>{page}</span>
        <button
          type="button"
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(page + 1)}
          className="button secondary small"
          style={{ padding: '2px 10px', fontSize: 11, opacity: page >= safeTotalPages ? 0.4 : 1, cursor: page >= safeTotalPages ? 'not-allowed' : 'pointer' }}
        >
          下一页
        </button>
        <button
          type="button"
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(safeTotalPages)}
          className="button secondary small"
          style={{ padding: '2px 8px', fontSize: 11, opacity: page >= safeTotalPages ? 0.4 : 1, cursor: page >= safeTotalPages ? 'not-allowed' : 'pointer' }}
        >
          末页
        </button>
      </div>
    </div>
  );
}

const emptyProvider: ProviderInput = {
  name: '',
  baseUrl: '',
  model: '',
  apiKey: '',
  enabled: true,
  scenes: ['EXPLAIN', 'MEMORY', 'CONTEXT', 'ARTICLE'],
  priority: 0
};

const LEDGER_KIND_LABELS: Record<string, string> = {
  GRANT: '初始发放',
  ADJUST: '人工调整',
  RESERVE: '任务预占',
  SETTLE: '任务结算',
  RELEASE: '失败释放'
};

export function AdminAiPage() {
  const {
    user,
    loadAdmin,
    loadAdminUsagePage,
    loadAdminTasksPage,
    loadAiStats,
    saveProvider,
    deleteProvider
  } = useLearningStore();

  const [data, setData] = useState<{ providers: AdminData['providers']; users: AdminUser[] }>({
    providers: [],
    users: []
  });
  const [stats, setStats] = useState<AiStats>({ totalTokens: 0, activeTasks: 0, totalTasks: 0 });
  const [form, setForm] = useState<ProviderInput>({ ...emptyProvider });
  const [editing, setEditing] = useState<string | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // AI 调用与用户用量明细服务端分页状态
  const [usagePage, setUsagePage] = useState(1);
  const [usagePageSize, setUsagePageSize] = useState(10);
  const [usageSearchInput, setUsageSearchInput] = useState('');
  const [usageSearch, setUsageSearch] = useState('');
  const [usageData, setUsageData] = useState<PageResult<AdminUsage>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1
  });
  const [usageLoading, setUsageLoading] = useState(false);

  // 服务端异步生成任务队列服务端分页状态
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(10);
  const [taskStatus, setTaskStatus] = useState<string>('ALL');
  const [taskData, setTaskData] = useState<PageResult<AdminTask>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1
  });
  const [taskLoading, setTaskLoading] = useState(false);

  async function refreshProvidersAndStats() {
    try {
      const [adminRes, statsRes] = await Promise.all([
        loadAdmin(),
        loadAiStats().catch(() => null)
      ]);
      setData({ providers: adminRes.providers, users: adminRes.users });
      if (statsRes) {
        setStats(statsRes);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 管理数据加载失败');
    }
  }

  async function fetchUsage(page: number, pageSize: number, search: string) {
    setUsageLoading(true);
    try {
      const res = await loadAdminUsagePage(page, pageSize, search);
      setUsageData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : '用量明细加载失败');
    } finally {
      setUsageLoading(false);
    }
  }

  async function fetchTasks(page: number, pageSize: number, status: string) {
    setTaskLoading(true);
    try {
      const res = await loadAdminTasksPage(page, pageSize, status);
      setTaskData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : '任务队列加载失败');
    } finally {
      setTaskLoading(false);
    }
  }

  async function refreshAll() {
    setBusy(true);
    try {
      await Promise.all([
        refreshProvidersAndStats(),
        fetchUsage(usagePage, usagePageSize, usageSearch),
        fetchTasks(taskPage, taskPageSize, taskStatus)
      ]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (user?.role === 'ADMIN') void refreshProvidersAndStats();
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'ADMIN') void fetchUsage(usagePage, usagePageSize, usageSearch);
  }, [user?.role, usagePage, usagePageSize, usageSearch]);

  useEffect(() => {
    if (user?.role === 'ADMIN') void fetchTasks(taskPage, taskPageSize, taskStatus);
  }, [user?.role, taskPage, taskPageSize, taskStatus]);

  useEffect(() => {
    if (!showForm) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowForm(false);
        setEditing(undefined);
        setForm({ ...emptyProvider });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showForm]);

  if (user?.role !== 'ADMIN') {
    return <Notice kind="error">当前账号没有后台管理权限。</Notice>;
  }

  const enabledCount = data.providers.filter(p => p.enabled).length;

  function closeForm() {
    setShowForm(false);
    setEditing(undefined);
    setForm({ ...emptyProvider });
  }

  async function persistProvider() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await saveProvider({ ...form, apiKey: form.apiKey?.trim() || undefined }, editing);
      closeForm();
      setMessage('供应商配置已保存，密钥已加密入库。');
      await refreshProvidersAndStats();
    } catch (e) {
      setForm(previous => ({ ...previous, apiKey: '' }));
      setError(e instanceof Error ? e.message : '配置未保存，请重新输入密钥后重试');
    } finally {
      setBusy(false);
    }
  }

  async function toggleProviderEnabled(provider: AdminData['providers'][number]) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await saveProvider(
        {
          name: provider.name,
          baseUrl: provider.baseUrl,
          model: provider.model,
          enabled: !provider.enabled,
          scenes: provider.scenes,
          priority: provider.priority
        },
        provider.id
      );
      setMessage(`已${provider.enabled ? '停用' : '启用'}供应商“${provider.name}”`);
      await refreshProvidersAndStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : '状态切换失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading
        eyebrow="AI ADMINISTRATION"
        title="AI 管理"
        description="集中配置大模型供应商与密钥，监控全站 AI 调用耗时、Token 消耗及异步任务队列。"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() => {
                void refreshAll();
              }}
            >
              <RefreshCw size={13} className={busy ? 'spin' : ''} /> 刷新数据
            </button>
            <button
              className="button small"
              onClick={() => {
                setEditing(undefined);
                setForm({ ...emptyProvider });
                setShowForm(true);
              }}
            >
              <Plus size={14} /> 新增供应商
            </button>
          </div>
        }
      />

      {error && (
        <Notice kind="error" onDismiss={() => setError('')}>
          {error}
        </Notice>
      )}
      {message && <Notice onDismiss={() => setMessage('')}>{message}</Notice>}

      <section className="admin-metrics">
        <Metric
          label="已配置供应商"
          value={data.providers.length}
          unit="个"
          detail={`当前已启用 ${enabledCount} 个供应商`}
          icon={<ShieldCheck size={14} />}
        />
        <Metric
          label="AI 调用总计"
          value={usageData.total}
          unit="次"
          detail="模型请求记录总数"
          icon={<Sparkles size={14} />}
        />
        <Metric
          label="累计 Token 消耗"
          value={stats.totalTokens.toLocaleString()}
          unit="tokens"
          detail="输入与输出 Token 合计"
          icon={<Wallet size={14} />}
        />
        <Metric
          label="活跃生成任务"
          value={stats.activeTasks}
          unit="个"
          detail={`任务队列总计 ${taskData.total || stats.totalTasks} 条`}
          icon={<RefreshCw size={14} />}
        />
      </section>

      {showForm && (
        <div className="admin-modal-overlay" onClick={closeForm}>
          <section className="admin-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="card-title">
              <h2>{editing ? '编辑 AI 供应商' : '新增 AI 供应商'}</h2>
              <button className="icon-button" aria-label="关闭弹窗" onClick={closeForm}>
                <X size={16} />
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                显示名称
                <input
                  autoFocus
                  value={form.name}
                  onChange={event => setForm({ ...form, name: event.target.value })}
                  placeholder="例如：DeepSeek 官方 / 硅基流动"
                />
              </label>
              <label className="field">
                模型标识 (Model)
                <input
                  value={form.model}
                  onChange={event => setForm({ ...form, model: event.target.value })}
                  placeholder="例如：deepseek-chat"
                />
              </label>
              <label className="field full">
                兼容 OpenAI 接口地址 (Base URL)
                <input
                  value={form.baseUrl}
                  type="url"
                  onChange={event => setForm({ ...form, baseUrl: event.target.value })}
                  placeholder="https://api.deepseek.com"
                />
                <small>需为 HTTPS 地址，且域名位于服务端 MW_PROVIDER_HOSTS 白名单内。</small>
              </label>
              <label className="field full">
                API Key 密钥
                <input
                  value={form.apiKey}
                  type="password"
                  autoComplete="new-password"
                  onChange={event => setForm({ ...form, apiKey: event.target.value })}
                  placeholder={editing ? '留空则保留现有密钥不变' : '输入供应商 API Key'}
                />
                <small>密钥仅在服务端使用 AES-GCM 强加密存储，前端不缓存且不回显明文。</small>
              </label>
              <div className="field">
                <span>启用状态</span>
                <Select
                  ariaLabel="启用状态"
                  value={form.enabled ? 'on' : 'off'}
                  options={[
                    { value: 'on', label: '立即启用' },
                    { value: 'off', label: '暂不启用' }
                  ]}
                  onChange={value => setForm({ ...form, enabled: value === 'on' })}
                />
              </div>
              <label className="field">
                调度优先级（数值越大越优先）
                <input
                  type="number"
                  value={form.priority}
                  onChange={event => setForm({ ...form, priority: Number(event.target.value) })}
                />
              </label>
              <div className="field full">
                <span>支持的学习场景（点击切换）</span>
                <div className="chips">
                  {(Object.keys(SCENE_NAMES) as AiScene[]).map(scene => (
                    <button
                      key={scene}
                      type="button"
                      className={`chip ${form.scenes?.includes(scene) ? 'selected' : ''}`}
                      onClick={() =>
                        setForm({
                          ...form,
                          scenes: form.scenes?.includes(scene)
                            ? form.scenes.filter(item => item !== scene)
                            : [...(form.scenes ?? []), scene]
                        })
                      }
                    >
                      {SCENE_NAMES[scene]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button
                className="button"
                disabled={busy || !form.name || !form.baseUrl || !form.model || (!editing && !form.apiKey)}
                onClick={() => void persistProvider()}
              >
                <Check size={14} /> 保存供应商配置
              </button>
              <button className="button secondary" onClick={closeForm}>
                取消
              </button>
            </div>
          </section>
        </div>
      )}

      <section className="card settings-card">
        <div className="card-title">
          <h2>AI 供应商列表</h2>
          <small>按优先级从高到低匹配对应场景的可用供应商</small>
        </div>
        {data.providers.length ? (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>供应商名称 / 地址</th>
                  <th>模型标识</th>
                  <th>支持场景</th>
                  <th>优先级</th>
                  <th>状态 / 密钥</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.map(provider => (
                  <tr key={provider.id}>
                    <td>
                      <b>{provider.name}</b>
                      <small>{provider.baseUrl}</small>
                    </td>
                    <td>
                      <code>{provider.model}</code>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {provider.scenes.map(s => (
                          <span key={s} className="pill" style={{ fontSize: 10, padding: '2px 7px' }}>
                            {SCENE_NAMES[s]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{provider.priority}</td>
                    <td>
                      <span
                        className="pill"
                        style={{
                          background: provider.enabled ? '#e7f2dc' : '#f3f4f1',
                          color: provider.enabled ? '#4d6b31' : '#8d9683'
                        }}
                      >
                        {provider.enabled ? '已启用' : '已停用'}
                      </span>
                      <small>{provider.hasKey ? '密钥已配置' : '未配置密钥'}</small>
                    </td>
                    <td>{formatTime(provider.updatedAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => void toggleProviderEnabled(provider)}
                        >
                          {provider.enabled ? '停用' : '启用'}
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditing(provider.id);
                            setForm({
                              name: provider.name,
                              baseUrl: provider.baseUrl,
                              model: provider.model,
                              enabled: provider.enabled,
                              scenes: provider.scenes,
                              priority: provider.priority,
                              apiKey: ''
                            });
                            setShowForm(true);
                          }}
                        >
                          编辑
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`删除 ${provider.name}`}
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`确认删除供应商“${provider.name}”吗？`)) {
                              void deleteProvider(provider.id)
                                .then(refreshProvidersAndStats)
                                .catch(e => setError(e instanceof Error ? e.message : '删除失败'));
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-copy">尚未配置任何 AI 供应商。点击右上角「新增供应商」即可添加。</p>
        )}
      </section>

      <section className="card settings-card">
        <div className="card-title">
          <h2>AI 调用与用户用量明细</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, color: '#9aa88a' }} />
              <input
                value={usageSearchInput}
                onChange={e => setUsageSearchInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setUsagePage(1);
                    setUsageSearch(usageSearchInput.trim());
                  }
                }}
                placeholder="搜索用户名或场景…"
                style={{
                  border: '1px solid #e2e8da',
                  borderRadius: 8,
                  padding: '6px 10px 6px 28px',
                  fontSize: 11,
                  background: '#fcfdf9',
                  minWidth: 180
                }}
              />
            </div>
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                setUsagePage(1);
                setUsageSearch(usageSearchInput.trim());
              }}
              style={{ padding: '5px 10px', fontSize: 11 }}
            >
              搜索
            </button>
            {usageSearch && (
              <button
                type="button"
                className="button secondary small"
                onClick={() => {
                  setUsageSearchInput('');
                  setUsageSearch('');
                  setUsagePage(1);
                }}
                style={{ padding: '5px 8px', fontSize: 11 }}
              >
                重置
              </button>
            )}
          </div>
        </div>
        <p className="muted-copy">Token 与耗时来自服务端实时调用账本；失败或取消的任务会自动退回预占额度。</p>
        {usageLoading ? (
          <p className="muted-copy" style={{ padding: '24px 0', textAlign: 'center' }}>
            正在加载用量明细…
          </p>
        ) : usageData.items.length ? (
          <>
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>功能场景</th>
                    <th>状态 / 额度结算</th>
                    <th>输入 Token</th>
                    <th>输出 Token</th>
                    <th>响应耗时</th>
                    <th>调用时间</th>
                  </tr>
                </thead>
                <tbody>
                  {usageData.items.map(item => (
                    <tr key={item.id}>
                      <td>
                        <b>{item.username}</b>
                      </td>
                      <td>
                        <span className="pill">{SCENE_NAMES[item.scene] || item.scene}</span>
                      </td>
                      <td>
                        {item.status === 'FAILED' ? '已释放' : item.status === 'SUCCEEDED' ? '已消耗' : '预占中'}
                        <small>{item.status === 'FAILED' ? '未扣除额度' : `${item.cost} 额度`}</small>
                      </td>
                      <td>{item.inputTokens ?? '—'}</td>
                      <td>{item.outputTokens ?? '—'}</td>
                      <td>{item.durationMs == null ? '—' : `${(item.durationMs / 1000).toFixed(1)} 秒`}</td>
                      <td>{formatTime(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={usageData.page}
              totalPages={usageData.totalPages}
              total={usageData.total}
              pageSize={usagePageSize}
              onPageChange={setUsagePage}
              onPageSizeChange={size => {
                setUsagePageSize(size);
                setUsagePage(1);
              }}
              itemLabel="条记录"
            />
          </>
        ) : (
          <p className="muted-copy" style={{ marginTop: 14 }}>
            暂无匹配的模型调用记录。
          </p>
        )}
      </section>

      <section className="card settings-card">
        <div className="card-title">
          <div>
            <h2>服务端异步生成任务队列</h2>
            <small style={{ color: '#88987b', fontSize: 11 }}>持久化队列 · 用户离开页面后仍在后台执行</small>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { key: 'ALL', label: '全部' },
              { key: 'QUEUED', label: '等待中' },
              { key: 'RUNNING', label: '执行中' },
              { key: 'SUCCEEDED', label: '已成功' },
              { key: 'FAILED', label: '已失败' }
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setTaskStatus(tab.key);
                  setTaskPage(1);
                }}
                className={`pill ${taskStatus === tab.key ? 'active' : ''}`}
                style={{
                  border: taskStatus === tab.key ? '1px solid #6d8357' : '1px solid #d4dfcc',
                  background: taskStatus === tab.key ? '#6d8357' : '#fcfdf9',
                  color: taskStatus === tab.key ? '#ffffff' : '#5a6d4d',
                  cursor: 'pointer',
                  fontSize: 11,
                  padding: '3px 10px',
                  fontWeight: taskStatus === tab.key ? 600 : 400
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {taskLoading ? (
          <p className="muted-copy" style={{ padding: '24px 0', textAlign: 'center' }}>
            正在拉取任务队列…
          </p>
        ) : taskData.items.length ? (
          <>
            <div className="task-list">
              {taskData.items.map(task => (
                <div className="task-card" key={task.id}>
                  <header>
                    <span className="pill">{SCENE_NAMES[task.scene] || task.scene}</span>
                    <span className={`task-state ${task.status.toLowerCase()}`}>
                      {task.status === 'QUEUED'
                        ? '等待执行'
                        : task.status === 'RUNNING'
                          ? '执行中'
                          : task.status === 'SUCCEEDED'
                            ? '已成功'
                            : '已失败'}
                    </span>
                  </header>
                  <small>
                    用户：{task.username || data.users.find(item => item.id === task.userId)?.username || task.userId} ·{' '}
                    {formatTime(task.createdAt)} · {task.status === 'FAILED' ? '未扣除额度' : `${task.cost} 额度`}
                  </small>
                  {task.error && <p className="task-error">{task.error}</p>}
                  <p className="source-note">
                    请求编号：{task.requestId} · 最后更新：{formatTime(task.updatedAt)}
                  </p>
                </div>
              ))}
            </div>
            <PaginationBar
              page={taskData.page}
              totalPages={taskData.totalPages}
              total={taskData.total}
              pageSize={taskPageSize}
              onPageChange={setTaskPage}
              onPageSizeChange={size => {
                setTaskPageSize(size);
                setTaskPage(1);
              }}
              itemLabel="个任务"
            />
          </>
        ) : (
          <p className="muted-copy">暂无匹配的异步生成任务。</p>
        )}
      </section>
    </>
  );
}

type UserModalMode = 'create' | 'quota' | 'password' | 'remark' | 'ledger' | null;

export function AdminUsersPage() {
  const {
    user: currentUser,
    loadAdmin,
    adjustQuota,
    createAdminUser,
    updateUserStatus,
    updateUserRole,
    resetUserPassword,
    updateUserRemark,
    revokeUserSessions,
    loadUserLedger
  } = useLearningStore();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'USER'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'ACTIVE' | 'DISABLED'>('ALL');

  const [modalMode, setModalMode] = useState<UserModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // 新建用户表单状态
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'ADMIN'>('USER');
  const [newRemark, setNewRemark] = useState('');

  // 额度调整表单状态
  const [quotaAmount, setQuotaAmount] = useState('');
  const [quotaReason, setQuotaReason] = useState('');

  // 重置密码表单状态
  const [resetPwdValue, setResetPwdValue] = useState('');

  // 备注表单状态
  const [remarkValue, setRemarkValue] = useState('');

  // 额度流水明细状态
  const [ledgerEntries, setLedgerEntries] = useState<AdminLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    try {
      const adminData = await loadAdmin();
      setUsers(adminData.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : '用户列表加载失败');
    }
  }

  useEffect(() => {
    if (currentUser?.role === 'ADMIN') void refresh();
  }, [currentUser?.role]);

  useEffect(() => {
    if (!modalMode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeModal();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalMode]);

  const filteredUsers = useMemo(() => {
    return users.filter(item => {
      const itemStatus = item.status || 'ACTIVE';
      if (roleFilter !== 'ALL' && item.role !== roleFilter) return false;
      if (statusFilter !== 'ALL' && itemStatus !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = item.username.toLowerCase().includes(q);
        const matchRemark = (item.remark || '').toLowerCase().includes(q);
        const matchId = item.id.toLowerCase().includes(q);
        if (!matchName && !matchRemark && !matchId) return false;
      }
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  if (currentUser?.role !== 'ADMIN') {
    return <Notice kind="error">当前账号没有后台管理权限。</Notice>;
  }

  const activeCount = users.filter(u => (u.status || 'ACTIVE') === 'ACTIVE').length;
  const pendingCount = users.filter(u => u.status === 'PENDING').length;
  const disabledCount = users.filter(u => u.status === 'DISABLED').length;
  const adminCount = users.filter(u => u.role === 'ADMIN').length;
  const totalAvailableQuota = users.reduce((sum, u) => sum + (u.available || 0), 0);
  const totalActiveSessions = users.reduce((sum, u) => sum + (u.activeSessions || 0), 0);

  function closeModal() {
    setModalMode(null);
    setSelectedUser(null);
    setNewUsername('');
    setNewPassword('');
    setNewRole('USER');
    setNewRemark('');
    setQuotaAmount('');
    setQuotaReason('');
    setResetPwdValue('');
    setRemarkValue('');
    setLedgerEntries([]);
  }

  async function handleCreateUser() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await createAdminUser({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        remark: newRemark.trim() || undefined
      });
      setMessage(`已成功创建账号“${newUsername.trim()}”`);
      closeModal();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建用户失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdjustQuota() {
    if (!selectedUser) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await adjustQuota(selectedUser.id, Number(quotaAmount), quotaReason.trim());
      setMessage(`已调整用户“${selectedUser.username}”的学习额度（${Number(quotaAmount) > 0 ? `+${quotaAmount}` : quotaAmount}）`);
      closeModal();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '额度调整失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await resetUserPassword(selectedUser.id, resetPwdValue);
      setMessage(`已重置用户“${selectedUser.username}”的登录密码，并清理其旧登录会话。`);
      closeModal();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '密码重置失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateRemark() {
    if (!selectedUser) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await updateUserRemark(selectedUser.id, remarkValue);
      setMessage(`已更新用户“${selectedUser.username}”的备注信息。`);
      closeModal();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '备注更新失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveUser(target: AdminUser) {
    if (!window.confirm(`确认审核通过账号“${target.username}”吗？审核通过后该用户即可正常登录使用。`)) {
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await updateUserStatus(target.id, 'ACTIVE');
      setMessage(`已审核通过账号“${target.username}”，该用户现在可以登录。`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '审核操作失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStatus(target: AdminUser) {
    const currentStatus = target.status || 'ACTIVE';
    const nextStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : currentStatus === 'PENDING' ? 'DISABLED' : 'ACTIVE';
    const actionLabel = currentStatus === 'PENDING' ? '拒绝并禁用' : nextStatus === 'DISABLED' ? '禁用' : '恢复启用';
    if (!window.confirm(`确认要${actionLabel}账号“${target.username}”吗？${nextStatus === 'DISABLED' ? '禁用后该用户将无法登录。' : ''}`)) {
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await updateUserStatus(target.id, nextStatus);
      setMessage(`已${actionLabel}账号“${target.username}”`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${actionLabel}失败`);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleRole(target: AdminUser) {
    const nextRole = target.role === 'ADMIN' ? 'USER' : 'ADMIN';
    const actionLabel = nextRole === 'ADMIN' ? '设为管理员' : '降为普通用户';
    if (!window.confirm(`确认将账号“${target.username}”${actionLabel}吗？`)) {
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await updateUserRole(target.id, nextRole);
      setMessage(`已将“${target.username}”${actionLabel}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '角色修改失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevokeSessions(target: AdminUser) {
    if (!window.confirm(`确认强制下线“${target.username}”的所有已登录设备吗？`)) {
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await revokeUserSessions(target.id);
      setMessage(`已强制下线“${target.username}”的所有登录会话`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '强制下线失败');
    } finally {
      setBusy(false);
    }
  }

  async function openLedger(target: AdminUser) {
    setSelectedUser(target);
    setModalMode('ledger');
    setLedgerLoading(true);
    setError('');
    try {
      const list = await loadUserLedger(target.id);
      setLedgerEntries(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '额度流水加载失败');
    } finally {
      setLedgerLoading(false);
    }
  }

  return (
    <>
      <Heading
        eyebrow="USER MANAGEMENT"
        title="用户管理"
        description="管理全站用户账号、角色权限、账号启停状态、密码重置、在线会话及学习额度账本。"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void refresh().finally(() => setBusy(false));
              }}
            >
              <RefreshCw size={13} /> 刷新列表
            </button>
            <button
              className="button small"
              onClick={() => {
                closeModal();
                setModalMode('create');
              }}
            >
              <UserPlus size={14} /> 新建用户
            </button>
          </div>
        }
      />

      {error && (
        <Notice kind="error" onDismiss={() => setError('')}>
          {error}
        </Notice>
      )}
      {message && <Notice onDismiss={() => setMessage('')}>{message}</Notice>}
      {pendingCount > 0 && (
        <Notice kind="warning">
          当前有 <b>{pendingCount}</b> 个新注册账号等待管理员审核，审核通过后用户方可登录。
          {statusFilter !== 'PENDING' && (
            <button
              type="button"
              className="text-button"
              style={{ marginLeft: 10 }}
              onClick={() => setStatusFilter('PENDING')}
            >
              仅看待审核账号
            </button>
          )}
        </Notice>
      )}

      <section className="admin-metrics">
        <Metric
          label="注册用户总数"
          value={users.length}
          unit="人"
          detail={`正常 ${activeCount} 人 · 待审核 ${pendingCount} 人 · 已禁用 ${disabledCount} 人`}
          icon={<Users size={14} />}
        />
        <Metric
          label="管理员账号"
          value={adminCount}
          unit="人"
          detail={`普通用户 ${users.length - adminCount} 人`}
          icon={<Shield size={14} />}
        />
        <Metric
          label="全站可用总额度"
          value={totalAvailableQuota}
          unit="点"
          detail="所有账号剩余可用额度合计"
          icon={<Wallet size={14} />}
        />
        <Metric
          label="当前活跃会话"
          value={totalActiveSessions}
          unit="个"
          detail="有效期内已登录的设备会话"
          icon={<UserCheck size={14} />}
        />
      </section>

      {/* 居中模态弹窗区：新建用户 / 调额 / 改密 / 备注 / 额度流水 */}
      {modalMode === 'create' && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <section className="admin-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="card-title">
              <h2>新建用户账号</h2>
              <button className="icon-button" aria-label="关闭弹窗" onClick={closeModal}>
                <X size={16} />
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                用户名（3~40位字母、数字或下划线）
                <input
                  autoFocus
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="例如：student_01"
                />
              </label>
              <label className="field">
                初始登录密码（6~72位）
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="至少 6 位字符"
                />
              </label>
              <div className="field">
                <span>账号角色</span>
                <Select
                  ariaLabel="账号角色"
                  value={newRole}
                  options={[
                    { value: 'USER', label: '普通用户 (USER)' },
                    { value: 'ADMIN', label: '管理员 (ADMIN)' }
                  ]}
                  onChange={value => setNewRole(value)}
                />
              </div>
              <label className="field">
                管理员备注（选填）
                <input
                  value={newRemark}
                  onChange={e => setNewRemark(e.target.value)}
                  placeholder="例如：内测体验用户 / 同事账号"
                  maxLength={200}
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="button"
                disabled={busy || !/^[a-zA-Z0-9_]{3,40}$/.test(newUsername.trim()) || newPassword.length < 6}
                onClick={() => void handleCreateUser()}
              >
                <Check size={14} /> 确认创建账号
              </button>
              <button className="button secondary" onClick={closeModal}>
                取消
              </button>
            </div>
          </section>
        </div>
      )}

      {modalMode === 'quota' && selectedUser && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <section className="admin-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="card-title">
              <h2>调整学习额度 · {selectedUser.username}</h2>
              <button className="icon-button" aria-label="关闭弹窗" onClick={closeModal}>
                <X size={16} />
              </button>
            </div>
            <p className="muted-copy" style={{ marginBottom: 14 }}>
              当前可用额度：<b>{selectedUser.available}</b> 点 · 预占中：<b>{selectedUser.reserved}</b> 点
            </p>
            <div className="form-grid">
              <label className="field full">
                调整数量（正数增加，负数扣减）
                <input
                  autoFocus
                  type="number"
                  step="1"
                  value={quotaAmount}
                  onChange={e => setQuotaAmount(e.target.value)}
                  placeholder="例如：50 或 -10"
                />
                <div className="chips" style={{ marginTop: 6 }}>
                  {[10, 30, 50, 100, -10].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      className="chip"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      onClick={() => {
                        setQuotaAmount(String(preset));
                        if (!quotaReason.trim()) {
                          setQuotaReason(preset > 0 ? `管理员手动补充 ${preset} 点额度` : `管理员手动扣减 ${Math.abs(preset)} 点额度`);
                        }
                      }}
                    >
                      {preset > 0 ? `+${preset}` : preset}
                    </button>
                  ))}
                </div>
              </label>
              <label className="field full">
                调整原因（记入服务端审计账本）
                <input
                  value={quotaReason}
                  onChange={e => setQuotaReason(e.target.value)}
                  maxLength={200}
                  placeholder="例如：赠送正式学习额度"
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="button"
                disabled={
                  busy ||
                  !quotaAmount ||
                  !Number.isInteger(Number(quotaAmount)) ||
                  Number(quotaAmount) === 0 ||
                  !quotaReason.trim()
                }
                onClick={() => void handleAdjustQuota()}
              >
                <Check size={14} /> 确认调整额度
              </button>
              <button className="button secondary" onClick={closeModal}>
                取消
              </button>
            </div>
          </section>
        </div>
      )}

      {modalMode === 'password' && selectedUser && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <section className="admin-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="card-title">
              <h2>重置登录密码 · {selectedUser.username}</h2>
              <button className="icon-button" aria-label="关闭弹窗" onClick={closeModal}>
                <X size={16} />
              </button>
            </div>
            <div className="form-grid">
              <label className="field full">
                新登录密码（6~72位字符，重置后该用户所有已登录设备将自动下线）
                <input
                  autoFocus
                  type="password"
                  autoComplete="new-password"
                  value={resetPwdValue}
                  onChange={e => setResetPwdValue(e.target.value)}
                  placeholder="输入新的登录密码（至少 6 位）"
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="button"
                disabled={busy || resetPwdValue.length < 6}
                onClick={() => void handleResetPassword()}
              >
                <KeyRound size={14} /> 确认重置密码
              </button>
              <button className="button secondary" onClick={closeModal}>
                取消
              </button>
            </div>
          </section>
        </div>
      )}

      {modalMode === 'remark' && selectedUser && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <section className="admin-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="card-title">
              <h2>编辑用户备注 · {selectedUser.username}</h2>
              <button className="icon-button" aria-label="关闭弹窗" onClick={closeModal}>
                <X size={16} />
              </button>
            </div>
            <div className="form-grid">
              <label className="field full">
                备注内容（留空保存可清除备注，最多 200 字）
                <input
                  autoFocus
                  value={remarkValue}
                  onChange={e => setRemarkValue(e.target.value)}
                  maxLength={200}
                  placeholder="输入针对该用户的备注说明…"
                />
              </label>
            </div>
            <div className="form-actions">
              <button className="button" disabled={busy} onClick={() => void handleUpdateRemark()}>
                <Check size={14} /> 保存备注
              </button>
              <button className="button secondary" onClick={closeModal}>
                取消
              </button>
            </div>
          </section>
        </div>
      )}

      {modalMode === 'ledger' && selectedUser && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <section className="admin-modal wide" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="card-title">
              <h2>额度变动账本 · {selectedUser.username}</h2>
              <button className="icon-button" aria-label="关闭弹窗" onClick={closeModal}>
                <X size={16} />
              </button>
            </div>
            <p className="muted-copy">
              当前可用额度：<b>{selectedUser.available}</b> 点 · 预占额度：<b>{selectedUser.reserved}</b> 点
            </p>
            {ledgerLoading ? (
              <p className="muted-copy" style={{ marginTop: 14 }}>
                正在加载额度流水…
              </p>
            ) : ledgerEntries.length ? (
              <div className="table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>变动类型</th>
                      <th>变动额度</th>
                      <th>原因说明</th>
                      <th>关联单号</th>
                      <th>记录时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map(entry => (
                      <tr key={entry.id}>
                        <td>
                          <span className="pill">{LEDGER_KIND_LABELS[entry.kind] || entry.kind}</span>
                        </td>
                        <td>
                          <b style={{ color: entry.amount > 0 ? '#4d6b31' : entry.amount < 0 ? '#b96e51' : '#81966d' }}>
                            {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                          </b>
                        </td>
                        <td>{entry.reason}</td>
                        <td>
                          <small>{entry.referenceId}</small>
                        </td>
                        <td>{formatTime(entry.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted-copy" style={{ marginTop: 14 }}>
                暂无额度流水记录。
              </p>
            )}
          </section>
        </div>
      )}

      {/* 筛选与用户主表格 */}
      <section className="card settings-card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: 12 }}>
          <h2>全站用户列表 ({filteredUsers.length})</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, color: '#9aa88a' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索用户名、备注或ID…"
                style={{
                  border: '1px solid #e2e8da',
                  borderRadius: 8,
                  padding: '7px 10px 7px 28px',
                  fontSize: 12,
                  background: '#fcfdf9',
                  minWidth: 200
                }}
              />
            </div>
            <Select
              size="compact"
              ariaLabel="按角色筛选"
              value={roleFilter}
              options={[
                { value: 'ALL', label: '全部角色' },
                { value: 'ADMIN', label: '仅管理员 (ADMIN)' },
                { value: 'USER', label: '仅普通用户 (USER)' }
              ]}
              onChange={value => setRoleFilter(value)}
            />
            <Select
              size="compact"
              ariaLabel="按状态筛选"
              value={statusFilter}
              options={[
                { value: 'ALL', label: '全部状态' },
                { value: 'PENDING', label: `待审核 (${pendingCount})` },
                { value: 'ACTIVE', label: '正常启用' },
                { value: 'DISABLED', label: '已禁用' }
              ]}
              onChange={value => setStatusFilter(value)}
            />
          </div>
        </div>

        {filteredUsers.length ? (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户账号 / 备注</th>
                  <th>角色 / 状态</th>
                  <th>学习统计</th>
                  <th>AI 额度 / Token</th>
                  <th>在线会话 / 最近登录</th>
                  <th>注册时间</th>
                  <th>管理操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(item => {
                  const isSelf = item.id === currentUser.id;
                  const isDisabled = item.status === 'DISABLED';
                  const isPending = item.status === 'PENDING';
                  return (
                    <tr key={item.id} style={isDisabled ? { opacity: 0.65 } : undefined}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <b style={{ fontSize: 13, color: '#4c5e41' }}>{item.username}</b>
                          {isSelf && (
                            <span className="pill" style={{ fontSize: 9, padding: '1px 6px' }}>
                              当前登录
                            </span>
                          )}
                        </div>
                        <small style={{ color: item.remark ? '#6d8357' : '#b0bba4' }}>
                          {item.remark ? `备注：${item.remark}` : `ID: ${item.id.slice(0, 8)}…`}
                        </small>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span
                            className="pill"
                            style={{
                              background: item.role === 'ADMIN' ? '#e5efe9' : '#f1f5eb',
                              color: item.role === 'ADMIN' ? '#2f684e' : '#6c7f5b',
                              fontWeight: 600
                            }}
                          >
                            {item.role === 'ADMIN' ? '管理员' : '普通用户'}
                          </span>
                          <span
                            className="pill"
                            style={{
                              background: isPending ? '#fbf0e7' : isDisabled ? '#fceae3' : '#e7f2dc',
                              color: isPending ? '#b86e39' : isDisabled ? '#b95c40' : '#4d6b31',
                              fontWeight: isPending ? 600 : 500
                            }}
                          >
                            {isPending ? '待审核' : isDisabled ? '已禁用' : '正常'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <b>{item.wordCount ?? 0}</b> 词
                        <small>复习 {item.reviewCount ?? 0} 次</small>
                      </td>
                      <td>
                        <b>{item.available}</b> 可用
                        <small>
                          预占 {item.reserved} · {(item.totalTokens ?? 0).toLocaleString()} tokens
                        </small>
                      </td>
                      <td>
                        <b>{item.activeSessions ?? 0}</b> 台设备在线
                        <small>{item.lastLoginAt ? `最近：${formatTime(item.lastLoginAt)}` : '尚未记录登录'}</small>
                      </td>
                      <td>{formatTime(item.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            className="text-button"
                            onClick={() => {
                              closeModal();
                              setSelectedUser(item);
                              setModalMode('quota');
                            }}
                          >
                            <Wallet size={12} /> 调额
                          </button>
                          <button className="text-button" onClick={() => void openLedger(item)}>
                            <History size={12} /> 流水
                          </button>
                          <button
                            className="text-button"
                            onClick={() => {
                              closeModal();
                              setSelectedUser(item);
                              setModalMode('password');
                            }}
                          >
                            <KeyRound size={12} /> 改密
                          </button>
                          <button
                            className="text-button"
                            onClick={() => {
                              closeModal();
                              setSelectedUser(item);
                              setRemarkValue(item.remark || '');
                              setModalMode('remark');
                            }}
                          >
                            <Edit3 size={12} /> 备注
                          </button>
                          {!isSelf && (
                            <>
                              {isPending && (
                                <button
                                  className="text-button"
                                  style={{ color: '#3b6e28', fontWeight: 600 }}
                                  disabled={busy}
                                  onClick={() => void handleApproveUser(item)}
                                >
                                  <UserCheck size={12} /> 审核通过
                                </button>
                              )}
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() => void handleToggleRole(item)}
                              >
                                <Shield size={12} /> {item.role === 'ADMIN' ? '降为用户' : '设为管理员'}
                              </button>
                              <button
                                className="text-button"
                                style={{ color: isDisabled ? '#4d6b31' : '#b96e51' }}
                                disabled={busy}
                                onClick={() => void handleToggleStatus(item)}
                              >
                                <Ban size={12} /> {isPending ? '拒绝' : isDisabled ? '启用' : '禁用'}
                              </button>
                            </>
                          )}
                          {(item.activeSessions ?? 0) > 0 && !isSelf && (
                            <button
                              className="text-button"
                              style={{ color: '#a98152' }}
                              disabled={busy}
                              onClick={() => void handleRevokeSessions(item)}
                            >
                              <LogOut size={12} /> 踢下线
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-copy" style={{ marginTop: 16 }}>
            没有找到符合筛选条件的用户。
          </p>
        )}
      </section>
    </>
  );
}

export function AdminPage({ onBack }: { onBack?: () => void }) {
  const [tab, setTab] = useState<'ai' | 'users'>('ai');
  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button className={`button ${tab === 'ai' ? '' : 'secondary'} small`} onClick={() => setTab('ai')}>
          <Sparkles size={14} /> AI 管理
        </button>
        <button className={`button ${tab === 'users' ? '' : 'secondary'} small`} onClick={() => setTab('users')}>
          <Users size={14} /> 用户管理
        </button>
        {onBack && (
          <button className="text-button" style={{ marginLeft: 'auto' }} onClick={onBack}>
            返回设置
          </button>
        )}
      </div>
      {tab === 'ai' ? <AdminAiPage /> : <AdminUsersPage />}
    </>
  );
}
