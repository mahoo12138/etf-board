import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  Building2,
  CalendarRange,
  Landmark,
  Menu,
  Moon,
  RefreshCw,
  Scale,
  Sun,
  X,
} from 'lucide-react';
import type {
  AlertRule,
  EquityBondIndexCode,
  EquityBondSpreadResponse,
  EtfLiveQuote,
  HistoryResponse,
  IndicesTrendResponse,
  MarketOverviewResponse,
  TriggeredAlert,
} from './types/market';
import { DEFAULT_ALERT_RULES, evaluateAlertRules } from './utils/alerts';
import { OverviewSection } from './components/OverviewSection';
import { NationalTeamSection } from './components/NationalTeamSection';
import { SupportHistorySection } from './components/SupportHistorySection';
import { EquityBondSpreadSection } from './components/EquityBondSpreadSection';
import { BullBearRatioSection } from './components/BullBearRatioSection';
import { AlertsAndDeploySection } from './components/AlertsAndDeploySection';
import { EtfDetailDrawer } from './components/EtfDetailDrawer';

type TabId = 'overview' | 'holdings' | 'history' | 'erp' | 'ratio' | 'alerts';

const STORAGE_RULES_KEY = 'nt_etf_alert_rules_v1';
const STORAGE_HISTORY_KEY = 'nt_etf_alert_history_v1';
const STORAGE_THEME_KEY = 'nt_etf_theme_v1';

const NAV_ITEMS: Array<{ id: TabId; label: string; subtitle: string; icon: typeof Activity }> = [
  { id: 'overview', label: '全景监控', subtitle: '实时资金与20只宽基', icon: Activity },
  { id: 'holdings', label: '国家队持仓', subtitle: '汇金/国新/社保估值', icon: Building2 },
  { id: 'history', label: '日度托底全景', subtitle: '托底异动与历史流向', icon: CalendarRange },
  { id: 'erp', label: '股债利差看板', subtitle: '沪深300 / 中证500 ERP', icon: Landmark },
  { id: 'ratio', label: '牛熊比值看板', subtitle: '创业板指(399006)/红利', icon: Scale },
  { id: 'alerts', label: '实时预警', subtitle: '规则引擎与部署配置', icon: Bell },
];

function playAlertChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio playback may be blocked prior to user gesture
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const [overview, setOverview] = useState<MarketOverviewResponse | null>(null);
  const [historyData, setHistoryData] = useState<HistoryResponse | null>(null);
  const [erpCache, setErpCache] = useState<
    Partial<Record<EquityBondIndexCode, EquityBondSpreadResponse>>
  >({});
  const [ratioTrend, setRatioTrend] = useState<IndicesTrendResponse | null>(null);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingErp, setLoadingErp] = useState(false);
  const [loadingRatio, setLoadingRatio] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [pollIntervalSec, setPollIntervalSec] = useState<number>(30);
  const [historyDays, setHistoryDays] = useState<number>(45);
  const [erpIndexCode, setErpIndexCode] = useState<EquityBondIndexCode>('000300');
  const [ratioDays, setRatioDays] = useState<number>(250);
  const [selectedEtf, setSelectedEtf] = useState<EtfLiveQuote | null>(null);

  const [rules, setRules] = useState<AlertRule[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_RULES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_ALERT_RULES;
  });

  const [alertHistory, setAlertHistory] = useState<TriggeredAlert[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [toastAlert, setToastAlert] = useState<TriggeredAlert | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserNotifyPermission, setBrowserNotifyPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem(STORAGE_THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_RULES_KEY, JSON.stringify(rules));
    } catch {
      // ignore
    }
  }, [rules]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(alertHistory.slice(0, 50)));
    } catch {
      // ignore
    }
  }, [alertHistory]);

  const dispatchTriggeredAlerts = useCallback(
    (triggered: TriggeredAlert[]) => {
      if (triggered.length === 0) return;
      setAlertHistory((prev) => [...triggered, ...prev].slice(0, 50));
      setToastAlert(triggered[0]);
      if (soundEnabled) playAlertChime();

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const first = triggered[0];
        new Notification(`国资资金脉搏预警：${first.ruleName}`, {
          body: first.message,
        });
      }
    },
    [soundEnabled]
  );

  const runAlertCheck = useCallback(
    (data: MarketOverviewResponse, ignoreCooldown = false) => {
      const { triggered, updatedRules } = evaluateAlertRules(
        rulesRef.current,
        data,
        Date.now(),
        { ignoreCooldown }
      );
      if (triggered.length > 0) {
        setRules(updatedRules);
        dispatchTriggeredAlerts(triggered);
      }
      return triggered.length;
    },
    [dispatchTriggeredAlerts]
  );

  const fetchOverview = useCallback(
    async (force = false) => {
      if (force) setRefreshing(true);
      setErrorMsg(null);
      try {
        const qs = force ? '?refresh=1' : '';
        const mktRes = await fetch(`/api/market${qs}`);
        if (!mktRes.ok) throw new Error('行情接口响应异常，请稍后重试');
        const mktData: MarketOverviewResponse = await mktRes.json();
        setOverview(mktData);
        runAlertCheck(mktData, false);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : '数据加载失败');
      } finally {
        setLoadingOverview(false);
        setRefreshing(false);
      }
    },
    [runAlertCheck]
  );

  const fetchHistory = useCallback(async (days: number) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/history?days=${days}`);
      if (res.ok) {
        const data: HistoryResponse = await res.json();
        setHistoryData(data);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const fetchEquityBond = useCallback(async (code: EquityBondIndexCode) => {
    setLoadingErp(true);
    try {
      const res = await fetch(`/api/equity-bond?index=${code}`);
      if (res.ok) {
        const data: EquityBondSpreadResponse = await res.json();
        setErpCache((prev) => ({ ...prev, [code]: data }));
      }
    } finally {
      setLoadingErp(false);
    }
  }, []);

  const fetchRatioTrend = useCallback(async (days: number) => {
    setLoadingRatio(true);
    try {
      const res = await fetch(`/api/indices?days=${days}`);
      if (res.ok) {
        const data: IndicesTrendResponse = await res.json();
        setRatioTrend(data);
      }
    } finally {
      setLoadingRatio(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchOverview(false);
  }, [fetchOverview]);

  // Lazy load history / equity-bond spread / ratio when visiting those views or changing parameters
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory(historyDays);
    }
  }, [activeTab, historyDays, fetchHistory]);

  useEffect(() => {
    if (activeTab === 'erp' && !erpCache[erpIndexCode]) {
      fetchEquityBond(erpIndexCode);
    }
  }, [activeTab, erpIndexCode, erpCache, fetchEquityBond]);

  useEffect(() => {
    if (activeTab === 'ratio') {
      fetchRatioTrend(ratioDays);
    }
  }, [activeTab, ratioDays, fetchRatioTrend]);

  // Real-time auto-polling timer
  useEffect(() => {
    if (pollIntervalSec <= 0) return;
    const timer = window.setInterval(() => {
      fetchOverview(true);
    }, pollIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [pollIntervalSec, fetchOverview]);

  // Auto dismiss toast after 6s
  useEffect(() => {
    if (!toastAlert) return;
    const t = window.setTimeout(() => setToastAlert(null), 6000);
    return () => window.clearTimeout(t);
  }, [toastAlert]);

  const unreadCount = useMemo(
    () => alertHistory.filter((a) => !a.read).length,
    [alertHistory]
  );

  const handleExportCsv = () => {
    if (!overview) return;
    const header = [
      '代码',
      '同花顺代码',
      '名称',
      '类别',
      '跟踪指数',
      '最新价',
      '涨跌幅(%)',
      '成交额(亿元)',
      '主力净流入(亿元)',
      '量比',
      '国家队估算持仓(亿元)',
    ];
    const rows = overview.etfs.map((e) => [
      e.code,
      e.thscode,
      e.name,
      e.categoryLabel,
      e.benchmark,
      e.price.toFixed(3),
      e.changePct.toFixed(2),
      e.turnoverYi.toFixed(2),
      e.mainNetInflowYi.toFixed(2),
      e.volumeRatio.toFixed(2),
      e.nationalTeamValueYi.toFixed(2),
    ]);
    const csvContent =
      '\uFEFF' + [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `national-team-etf-flow-${overview.source.tradingDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleJumpToIndex = (code: string) => {
    if (code === '399006' || code === '000922') {
      setActiveTab('ratio');
      return;
    }
    setErpIndexCode(code === '000905' ? '000905' : '000300');
    setActiveTab('erp');
  };

  const handleManualCheck = () => {
    if (!overview) return;
    const fired = runAlertCheck(overview, true);
    if (fired === 0) {
      setToastAlert({
        id: `manual-ok-${Date.now()}`,
        ruleId: 'manual',
        ruleName: '规则巡检完成',
        message: '所有已启用的监测规则均已校验完毕，当前无新触发异动。',
        actualValue: 0,
        threshold: 0,
        unit: '',
        severity: 'medium',
        triggeredAt: new Date().toISOString(),
        read: true,
      });
    }
  };

  const handleSimulateAlert = () => {
    const sample: TriggeredAlert = {
      id: `sim-${Date.now()}`,
      ruleId: 'sim',
      ruleName: '模拟预警推送 · 国家队宽基放量信号',
      message: `沪深300ETF(510300) 与 20只宽基主力资金监测通道正常，当前合计成交额 ${overview?.summary.totalEtfTurnoverYi.toFixed(1) ?? '--'} 亿元。`,
      actualValue: overview?.summary.totalEtfTurnoverYi ?? 0,
      threshold: 20,
      unit: '亿元',
      severity: 'high',
      triggeredAt: new Date().toISOString(),
      read: false,
    };
    dispatchTriggeredAlerts([sample]);
  };

  const handleRequestBrowserNotify = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setBrowserNotifyPermission(perm);
  };

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeTab)!;

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen">
        <div className="px-5 h-16 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
          <img
            src="/logo.svg"
            alt="国资资金脉搏 Logo"
            className="w-8 h-8 shrink-0"
          />
          <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            国资资金脉搏
          </span>
        </div>

        <nav aria-label="主功能导航" className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight whitespace-nowrap">
                      {item.label}
                    </div>
                    <div
                      className={`text-[11px] truncate mt-0.5 ${
                        isActive ? 'text-slate-300 dark:text-blue-100' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {item.subtitle}
                    </div>
                  </div>
                </div>
                {item.id === 'alerts' && unreadCount > 0 && (
                  <span className="font-mono-num text-xs font-semibold text-amber-500 dark:text-amber-300 shrink-0">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Bottom Controls: Auto Refresh & Theme */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div>
            <label
              htmlFor="poll-interval"
              className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
            >
              实时轮询频率
            </label>
            <select
              id="poll-interval"
              value={pollIntervalSec}
              onChange={(e) => setPollIntervalSec(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
            >
              <option value={15}>每 15 秒自动更新</option>
              <option value={30}>每 30 秒自动更新</option>
              <option value={60}>每 60 秒自动更新</option>
              <option value={0}>暂停自动刷新</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setIsDark((d) => !d)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <span>{isDark ? '切换浅色研究模式' : '切换深色暗盘模式'}</span>
            {isDark ? <Sun className="w-3.5 h-3.5" aria-hidden="true" /> : <Moon className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] bg-white dark:bg-slate-900 h-full flex flex-col border-r border-slate-200 dark:border-slate-800 z-10">
            <div className="px-5 h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src="/logo.svg"
                  alt="国资资金脉搏 Logo"
                  className="w-7 h-7 shrink-0"
                />
                <span className="font-display text-base font-bold text-slate-900 dark:text-white">
                  国资资金脉搏
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="关闭导航菜单"
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-blue-600'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsDark((d) => !d)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                <span>{isDark ? '切换浅色模式' : '切换深色模式'}</span>
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Contextual Workspace Header (Single Row, Clean 3-Zone) */}
        <header className="h-16 px-4 sm:px-6 lg:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="打开导航菜单"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                {activeNavMeta.label}
              </h1>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                {overview
                  ? `${overview.source.marketStatusLabel} · 交易日 ${overview.source.tradingDate} · 北京时间 ${new Date(overview.source.fetchedAt).toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })}`
                  : '正在同步 A 股实时行情与资金流向...'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('alerts')}
              aria-label={`查看实时预警，当前未读 ${unreadCount} 条`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">预警</span>
              {unreadCount > 0 && (
                <span className="font-mono-num text-amber-600 dark:text-amber-400 font-semibold">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => fetchOverview(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {refreshing ? '刷新中' : '立即刷新'}
            </button>
          </div>
        </header>

        {/* Live Triggered Alert Toast */}
        {toastAlert && (
          <div
            role="status"
            aria-live="polite"
            className="mx-4 sm:mx-6 lg:mx-8 mt-4 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-start justify-between gap-4"
          >
            <div className="text-xs text-amber-950 dark:text-amber-100">
              <span className="font-semibold">{toastAlert.ruleName}：</span>
              <span>{toastAlert.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastAlert(null)}
              aria-label="关闭预警提示"
              className="text-amber-700 dark:text-amber-300 hover:text-amber-900 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {errorMsg && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 flex items-center justify-between gap-4 text-sm text-red-700 dark:text-red-300"
            >
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => fetchOverview(true)}
                className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 shrink-0"
              >
                重试
              </button>
            </div>
          )}

          {loadingOverview && !overview ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((k) => (
                  <div
                    key={k}
                    className="h-28 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse"
                  />
                ))}
              </div>
              <div className="h-[340px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
              <div className="h-[380px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
            </div>
          ) : overview ? (
            <>
              {activeTab === 'overview' && (
                <OverviewSection
                  overview={overview}
                  isDark={isDark}
                  onSelectEtf={setSelectedEtf}
                  onJumpToIndex={handleJumpToIndex}
                  onJumpToRatio={() => setActiveTab('ratio')}
                  onExportCsv={handleExportCsv}
                />
              )}
              {activeTab === 'holdings' && (
                <NationalTeamSection
                  etfs={overview.etfs}
                  isDark={isDark}
                  onSelectEtf={setSelectedEtf}
                />
              )}
              {activeTab === 'history' && (
                <SupportHistorySection
                  history={historyData}
                  loading={loadingHistory}
                  daysWindow={historyDays}
                  isDark={isDark}
                  onChangeDaysWindow={setHistoryDays}
                />
              )}
              {activeTab === 'erp' && (
                <EquityBondSpreadSection
                  data={erpCache[erpIndexCode] ?? null}
                  loading={loadingErp}
                  indexCode={erpIndexCode}
                  isDark={isDark}
                  onChangeIndexCode={setErpIndexCode}
                />
              )}
              {activeTab === 'ratio' && (
                <BullBearRatioSection
                  trendData={ratioTrend}
                  loading={loadingRatio}
                  daysWindow={ratioDays}
                  isDark={isDark}
                  onChangeDaysWindow={setRatioDays}
                />
              )}
              {activeTab === 'alerts' && (
                <AlertsAndDeploySection
                  overview={overview}
                  rules={rules}
                  history={alertHistory}
                  soundEnabled={soundEnabled}
                  browserNotifyPermission={browserNotifyPermission}
                  onToggleRule={(id) =>
                    setRules((prev) =>
                      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
                    )
                  }
                  onDeleteRule={(id) =>
                    setRules((prev) => prev.filter((r) => r.id !== id))
                  }
                  onAddRule={(rule) =>
                    setRules((prev) => [{ ...rule, id: `rule-${Date.now()}` }, ...prev])
                  }
                  onRunManualCheck={handleManualCheck}
                  onSimulateAlert={handleSimulateAlert}
                  onMarkAllRead={() =>
                    setAlertHistory((prev) => prev.map((a) => ({ ...a, read: true })))
                  }
                  onClearHistory={() => setAlertHistory([])}
                  onToggleSound={() => setSoundEnabled((s) => !s)}
                  onRequestBrowserNotify={handleRequestBrowserNotify}
                />
              )}
            </>
          ) : null}
        </main>

        {/* Quiet Institutional Footer */}
        <footer className="px-4 sm:px-6 lg:px-8 py-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            数据源：{overview?.source.providerLabel ?? 'A股实时行情引擎'} · 国家队持仓份额基于基金定期报告公开披露
          </span>
          <span>仅供量化研究与资金流观测参考，不构成投资建议</span>
        </footer>
      </div>

      {/* ETF Drill-Down Drawer */}
      <EtfDetailDrawer
        etf={selectedEtf}
        isDark={isDark}
        onClose={() => setSelectedEtf(null)}
      />
    </div>
  );
}
