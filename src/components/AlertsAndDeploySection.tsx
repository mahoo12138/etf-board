import { useState, type FormEvent } from 'react';
import { Bell, CheckCheck, Play, Plus, Trash2, Volume2, VolumeX } from 'lucide-react';
import { CORE_ETF_CATALOG, KEY_INDICES_CATALOG } from '../data/etfCatalog';
import type {
  AlertMetric,
  AlertOperator,
  AlertRule,
  MarketOverviewResponse,
  TriggeredAlert,
} from '../types/market';
import {
  ALERT_METRIC_LABELS,
  extractRuleMetricValue,
  formatRuleCondition,
} from '../utils/alerts';

interface AlertsAndDeploySectionProps {
  overview: MarketOverviewResponse;
  rules: AlertRule[];
  history: TriggeredAlert[];
  soundEnabled: boolean;
  browserNotifyPermission: NotificationPermission | 'unsupported';
  onToggleRule: (id: string) => void;
  onDeleteRule: (id: string) => void;
  onAddRule: (rule: Omit<AlertRule, 'id'>) => void;
  onRunManualCheck: () => void;
  onSimulateAlert: () => void;
  onMarkAllRead: () => void;
  onClearHistory: () => void;
  onToggleSound: () => void;
  onRequestBrowserNotify: () => void;
}

export function AlertsAndDeploySection({
  overview,
  rules,
  history,
  soundEnabled,
  browserNotifyPermission,
  onToggleRule,
  onDeleteRule,
  onAddRule,
  onRunManualCheck,
  onSimulateAlert,
  onMarkAllRead,
  onClearHistory,
  onToggleSound,
  onRequestBrowserNotify,
}: AlertsAndDeploySectionProps) {
  const [name, setName] = useState('');
  const [metric, setMetric] = useState<AlertMetric>('index_change_pct');
  const [targetCode, setTargetCode] = useState('000688');
  const [operator, setOperator] = useState<AlertOperator>('lt');
  const [threshold, setThreshold] = useState('-1.5');
  const [cooldownMinutes, setCooldownMinutes] = useState('15');
  const [formError, setFormError] = useState<string | null>(null);

  const metricMeta = ALERT_METRIC_LABELS[metric];

  const handleMetricChange = (nextMetric: AlertMetric) => {
    setMetric(nextMetric);
    const meta = ALERT_METRIC_LABELS[nextMetric];
    if (meta.needsTarget === 'index') {
      setTargetCode(KEY_INDICES_CATALOG[0].code);
    } else if (meta.needsTarget === 'etf') {
      setTargetCode(CORE_ETF_CATALOG[0].code);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const numThreshold = Number(threshold);
    const numCooldown = Number(cooldownMinutes);

    if (!name.trim()) {
      setFormError('请输入预警规则名称');
      return;
    }
    if (!Number.isFinite(numThreshold)) {
      setFormError('请输入有效的数字阈值');
      return;
    }
    if (!Number.isFinite(numCooldown) || numCooldown < 1) {
      setFormError('冷却时间需为大于等于 1 的整数分钟');
      return;
    }

    let resolvedTargetCode: string | undefined;
    let resolvedTargetName: string | undefined;
    if (metricMeta.needsTarget === 'index') {
      const idx = KEY_INDICES_CATALOG.find((i) => i.code === targetCode);
      resolvedTargetCode = idx?.code;
      resolvedTargetName = idx?.name;
    } else if (metricMeta.needsTarget === 'etf') {
      const etf = CORE_ETF_CATALOG.find((item) => item.code === targetCode);
      resolvedTargetCode = etf?.code;
      resolvedTargetName = etf?.shortName;
    }

    onAddRule({
      name: name.trim(),
      metric,
      targetCode: resolvedTargetCode,
      targetName: resolvedTargetName,
      operator,
      threshold: numThreshold,
      unit: metricMeta.unit,
      enabled: true,
      cooldownMinutes: Math.round(numCooldown),
    });

    setName('');
    setFormError(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Alert Rules Management & Create Form */}
        <div className="xl:col-span-7 space-y-6">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  实时资金与指数预警规则 ({rules.filter((r) => r.enabled).length}/{rules.length} 启用)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  每次实时行情刷新自动扫描所有启用规则，满足阈值立即触发提醒
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRunManualCheck}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  立即检测规则
                </button>
                <button
                  type="button"
                  onClick={onSimulateAlert}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                  测试推送
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {rules.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  当前没有配置任何预警规则，请在下方新建一条监测规则。
                </div>
              ) : (
                rules.map((rule) => {
                  const currentVal = extractRuleMetricValue(rule, overview);
                  return (
                    <div
                      key={rule.id}
                      className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium truncate ${
                              rule.enabled
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-slate-400 line-through'
                            }`}
                          >
                            {rule.name}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                          条件：{formatRuleCondition(rule)} · 冷却 {rule.cooldownMinutes} 分钟 · 当前值{' '}
                          <span className="text-slate-800 dark:text-slate-200 font-medium">
                            {currentVal !== null
                              ? `${currentVal.toFixed(rule.metric === 'star_dividend_ratio' ? 4 : 2)}${rule.unit}`
                              : '--'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleRule(rule.id)}
                          aria-label={`${rule.enabled ? '暂停' : '启用'}规则 ${rule.name}`}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                            rule.enabled
                              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                              : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {rule.enabled ? '运行中' : '已暂停'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRule(rule.id)}
                          aria-label={`删除规则 ${rule.name}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Create New Rule Form */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
              新增自定义监测预警规则
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="rule-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    规则名称
                  </label>
                  <input
                    id="rule-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：中证红利放量突破提醒"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                  />
                </div>

                <div>
                  <label
                    htmlFor="rule-metric"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    监测指标
                  </label>
                  <select
                    id="rule-metric"
                    value={metric}
                    onChange={(e) => handleMetricChange(e.target.value as AlertMetric)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                  >
                    {(Object.keys(ALERT_METRIC_LABELS) as AlertMetric[]).map((m) => (
                      <option key={m} value={m}>
                        {ALERT_METRIC_LABELS[m].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {metricMeta.needsTarget !== 'none' && (
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="rule-target"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      目标标的
                    </label>
                    <select
                      id="rule-target"
                      value={targetCode}
                      onChange={(e) => setTargetCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                    >
                      {metricMeta.needsTarget === 'index'
                        ? KEY_INDICES_CATALOG.map((i) => (
                            <option key={i.code} value={i.code}>
                              {i.name} ({i.code})
                            </option>
                          ))
                        : CORE_ETF_CATALOG.map((e) => (
                            <option key={e.code} value={e.code}>
                              {e.shortName} ({e.code})
                            </option>
                          ))}
                    </select>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="rule-op"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    触发方向
                  </label>
                  <select
                    id="rule-op"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value as AlertOperator)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                  >
                    <option value="gt">高于等于 (≥)</option>
                    <option value="lt">低于等于 (≤)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="rule-threshold"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    阈值 ({metricMeta.unit})
                  </label>
                  <input
                    id="rule-threshold"
                    type="number"
                    step="0.1"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                  />
                </div>

                {metricMeta.needsTarget === 'none' && (
                  <div>
                    <label
                      htmlFor="rule-cooldown"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      防重冷却(分)
                    </label>
                    <input
                      id="rule-cooldown"
                      type="number"
                      min="1"
                      value={cooldownMinutes}
                      onChange={(e) => setCooldownMinutes(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono-num bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                    />
                  </div>
                )}
              </div>

              {formError && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end pt-1">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  添加预警规则
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* Right: Triggered Log + Notification Preferences + Tonghuashun & Vercel Guide */}
        <div className="xl:col-span-5 space-y-6">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                实时预警触发记录 ({history.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleSound}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                >
                  {soundEnabled ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                      提示音开
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                      静音
                    </>
                  )}
                </button>
                {browserNotifyPermission !== 'unsupported' &&
                  browserNotifyPermission !== 'granted' && (
                    <button
                      type="button"
                      onClick={onRequestBrowserNotify}
                      className="px-2.5 py-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-950 rounded-md transition-colors"
                    >
                      开启桌面通知
                    </button>
                  )}
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {history.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  暂无已触发的预警记录。点击上方“立即检测规则”或“测试推送”可立即验证提醒通道。
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 text-xs ${
                      item.read
                        ? 'opacity-75'
                        : 'bg-amber-50/40 dark:bg-amber-950/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {item.ruleName}
                      </span>
                      <span className="font-mono-num text-[11px] text-slate-400 shrink-0">
                        {new Date(item.triggeredAt).toLocaleTimeString('zh-CN', {
                          hour12: false,
                          timeZone: 'Asia/Shanghai',
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                ))
              )}
            </div>

            {history.length > 0 && (
              <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                >
                  <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  全部标为已读
                </button>
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  清空记录
                </button>
              </div>
            )}
          </section>

          {/* Tonghuashun Financial API & Vercel Deployment Reference */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                同花顺金融数据工具对接与 Vercel 部署说明
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                当前运行通道：{overview.source.providerLabel}
              </p>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
              <p>
                1. 本项目已内置 <code className="font-mono-num px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">vercel.json</code> 与 <code className="font-mono-num px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">/api/*</code> Serverless 接口，推送至 GitHub 后在 Vercel 导入仓库即可零配置部署。
              </p>
              <p>
                2. 服务端已适配同花顺官方开放金融数据接口（<code className="font-mono-num px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">Hithink-Tech-Org/Financial-API</code>，端点 <code className="font-mono-num px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">fuyao.aicubes.cn</code>）。在 Vercel 项目环境变量中配置 <code className="font-mono-num px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">HITHINK_API_KEY</code> 后，后台将自动切换为同花顺官方通道并保留实时主力流增强。
              </p>
              <p>
                3. 未配置 API Key 时，服务端默认通过公开 A 股实时行情接口聚合 20 只宽基 ETF 与重点指数实时走势，确保部署即用。
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
