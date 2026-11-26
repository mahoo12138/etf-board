import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { X } from 'lucide-react';
import type { DailyFlowPoint, DailyKlinePoint, EtfLiveQuote } from '../types/market';
import { formatSigned } from '../utils/indicators';
import { EChartBox } from './EChartBox';

interface EtfDetailDrawerProps {
  etf: EtfLiveQuote | null;
  isDark: boolean;
  onClose: () => void;
}

export function EtfDetailDrawer({ etf, isDark, onClose }: EtfDetailDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [klines, setKlines] = useState<DailyKlinePoint[]>([]);
  const [flows, setFlows] = useState<DailyFlowPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!etf) return;
    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/etf-detail?code=${etf.code}`)
      .then((res) => {
        if (!res.ok) throw new Error('无法拉取该 ETF 历史明细');
        return res.json();
      })
      .then((data: { klines: DailyKlinePoint[]; flows: DailyFlowPoint[] }) => {
        if (!active) return;
        setKlines(data.klines || []);
        setFlows(data.flows || []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : '加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [etf]);

  const priceOption: EChartsOption = useMemo(() => {
    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)';
    return {
      animationDuration: 300,
      tooltip: { trigger: 'axis' },
      grid: { left: 48, right: 16, top: 20, bottom: 26 },
      xAxis: {
        type: 'category',
        data: klines.map((k) => k.date.slice(5)),
        axisLabel: { color: axisColor, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
        axisLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
      },
      series: [
        {
          name: '收盘价',
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 2, color: '#1D4ED8' },
          areaStyle: {
            color: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(29,78,216,0.08)',
          },
          data: klines.map((k) => k.close),
        },
      ],
    };
  }, [klines, isDark]);

  const flowOption: EChartsOption = useMemo(() => {
    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)';
    return {
      animationDuration: 300,
      tooltip: { trigger: 'axis' },
      grid: { left: 48, right: 16, top: 20, bottom: 26 },
      xAxis: {
        type: 'category',
        data: flows.map((f) => f.date.slice(5)),
        axisLabel: { color: axisColor, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
        axisLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'value',
        name: '净流入(亿)',
        nameTextStyle: { color: axisColor, fontSize: 10 },
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
      },
      series: [
        {
          name: '主力净流入(亿)',
          type: 'bar',
          barMaxWidth: 14,
          data: flows.map((f) => ({
            value: f.mainNetInflowYi,
            itemStyle: {
              color: f.mainNetInflowYi >= 0 ? '#DC2626' : '#059669',
              borderRadius: [2, 2, 0, 0],
            },
          })),
        },
      ],
    };
  }, [flows, isDark]);

  if (!etf) return null;

  const colorClass = (v: number) =>
    v > 0
      ? 'text-red-600 dark:text-red-400'
      : v < 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-600 dark:text-slate-400';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${etf.name} 资金与走势详情`}
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 h-full overflow-y-auto border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{etf.name}</h2>
            <p className="text-xs font-mono-num text-slate-500 dark:text-slate-400 mt-0.5">
              {etf.thscode} · {etf.categoryLabel} · 跟踪 {etf.benchmark}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭ETF详情抽屉"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">最新价格</div>
              <div className="mt-1 text-lg font-bold font-mono-num text-slate-900 dark:text-slate-50">
                {etf.price.toFixed(3)}
              </div>
              <div className={`text-xs font-mono-num ${colorClass(etf.changePct)}`}>
                {formatSigned(etf.changePct, 2, '%')}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">今日成交额</div>
              <div className="mt-1 text-lg font-bold font-mono-num text-slate-900 dark:text-slate-50">
                {etf.turnoverYi.toFixed(2)}亿
              </div>
              <div className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                量比 {etf.volumeRatio.toFixed(2)}x
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">主力净流入</div>
              <div className={`mt-1 text-lg font-bold font-mono-num ${colorClass(etf.mainNetInflowYi)}`}>
                {formatSigned(etf.mainNetInflowYi, 2)}亿
              </div>
              <div className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                占比 {formatSigned(etf.mainNetInflowRatioPct, 1, '%')}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">国家队估算持仓</div>
              <div className="mt-1 text-lg font-bold font-mono-num text-slate-900 dark:text-slate-50">
                {etf.nationalTeamValueYi.toFixed(1)}亿
              </div>
              <div className={`text-xs font-mono-num ${colorClass(etf.nationalTeamDailyPnlYi)}`}>
                日盈亏 {formatSigned(etf.nationalTeamDailyPnlYi, 2)}亿
              </div>
            </div>
          </div>

          {error ? (
            <div className="p-4 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : loading ? (
            <div className="space-y-4">
              <div className="h-[220px] rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-[220px] rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  近 60 个交易日价格走势
                </h3>
                <EChartBox
                  option={priceOption}
                  height={210}
                  ariaLabel={`${etf.name} 近60日价格走势`}
                />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  近 30 个交易日主力资金净流入（亿元）
                </h3>
                <EChartBox
                  option={flowOption}
                  height={210}
                  ariaLabel={`${etf.name} 近30日主力资金净流入`}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
