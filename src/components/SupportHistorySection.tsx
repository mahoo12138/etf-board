import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import type { HistoryResponse } from '../types/market';
import { formatSigned } from '../utils/indicators';
import { EChartBox } from './EChartBox';

interface SupportHistorySectionProps {
  history: HistoryResponse | null;
  loading: boolean;
  daysWindow: number;
  isDark: boolean;
  onChangeDaysWindow: (days: number) => void;
}

const WINDOWS = [30, 45, 60, 90];

export function SupportHistorySection({
  history,
  loading,
  daysWindow,
  isDark,
  onChangeDaysWindow,
}: SupportHistorySectionProps) {
  const days = history?.days || [];
  const supportDays = useMemo(() => [...days].filter((d) => d.isSupportDay).reverse(), [days]);

  const flowComboOption: EChartsOption = useMemo(() => {
    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)';
    const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
    const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
    const tooltipText = isDark ? '#F1F5F9' : '#0F172A';

    return {
      animationDuration: 350,
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
        axisPointer: { type: 'cross' },
      },
      legend: {
        top: 0,
        left: 'center',
        textStyle: { color: axisColor, fontSize: 12 },
        data: ['20只ETF主力净流入(亿)', '上证指数收盘'],
      },
      grid: { left: 54, right: 64, top: 48, bottom: 28 },
      xAxis: {
        type: 'category',
        data: days.map((d) => d.date.slice(5)),
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      },
      yAxis: [
        {
          type: 'value',
          name: '净流入(亿)',
          nameTextStyle: { color: axisColor, fontSize: 11 },
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: { color: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
        },
        {
          type: 'value',
          name: '上证指数',
          scale: true,
          nameTextStyle: { color: axisColor, fontSize: 11 },
          splitLine: { show: false },
          axisLabel: { color: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
        },
      ],
      series: [
        {
          name: '20只ETF主力净流入(亿)',
          type: 'bar',
          barMaxWidth: 14,
          data: days.map((d) => ({
            value: d.totalNetInflowYi,
            itemStyle: {
              color: d.isSupportDay
                ? '#D97706'
                : d.totalNetInflowYi >= 0
                  ? '#DC2626'
                  : '#059669',
              borderRadius: [2, 2, 0, 0],
            },
          })),
        },
        {
          name: '上证指数收盘',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          lineStyle: { width: 2, color: isDark ? '#60A5FA' : '#1D4ED8' },
          itemStyle: { color: isDark ? '#60A5FA' : '#1D4ED8' },
          data: days.map((d) => d.sseClose),
        },
      ],
    };
  }, [days, isDark]);

  const turnoverOption: EChartsOption = useMemo(() => {
    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)';
    const avgTurnover =
      days.length > 0
        ? days.reduce((acc, d) => acc + d.totalTurnoverYi, 0) / days.length
        : 0;

    return {
      animationDuration: 350,
      tooltip: { trigger: 'axis' },
      grid: { left: 54, right: 24, top: 28, bottom: 26 },
      xAxis: {
        type: 'category',
        data: days.map((d) => d.date.slice(5)),
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      },
      yAxis: {
        type: 'value',
        name: '日成交额(亿)',
        nameTextStyle: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      },
      series: [
        {
          name: '20只ETF合计成交额(亿)',
          type: 'bar',
          barMaxWidth: 14,
          data: days.map((d) => ({
            value: d.totalTurnoverYi,
            itemStyle: {
              color: d.isSupportDay
                ? '#D97706'
                : isDark
                  ? 'rgba(100,116,139,0.7)'
                  : 'rgba(100,116,139,0.5)',
              borderRadius: [2, 2, 0, 0],
            },
          })),
          markLine:
            avgTurnover > 0
              ? {
                  silent: true,
                  symbol: 'none',
                  label: {
                    formatter: `区间日均 ${avgTurnover.toFixed(0)}亿`,
                    color: axisColor,
                    fontSize: 10,
                  },
                  lineStyle: { type: 'dashed', color: '#D97706' },
                  data: [{ yAxis: Number(avgTurnover.toFixed(1)) }],
                }
              : undefined,
        },
      ],
    };
  }, [days, isDark]);

  const stats = useMemo(() => {
    if (days.length === 0) {
      return { cumInflow: 0, avgTurnover: 0, maxTurnover: 0, maxInflow: 0 };
    }
    const cumInflow = days.reduce((a, d) => a + d.totalNetInflowYi, 0);
    const avgTurnover = days.reduce((a, d) => a + d.totalTurnoverYi, 0) / days.length;
    const maxTurnover = Math.max(...days.map((d) => d.totalTurnoverYi));
    const maxInflow = Math.max(...days.map((d) => d.totalNetInflowYi));
    return { cumInflow, avgTurnover, maxTurnover, maxInflow };
  }, [days]);

  const colorClass = (v: number) =>
    v > 0
      ? 'text-red-600 dark:text-red-400'
      : v < 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-600 dark:text-slate-400';

  return (
    <div className="space-y-6">
      {/* Header & Window Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            宽基ETF托底信号与日度资金流向全景
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            琥珀色柱体标记自动识别的“托底异动日”（主力大幅净流入或逆势放量承接）
          </p>
        </div>
        <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start sm:self-auto">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onChangeDaysWindow(w)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                daysWindow === w
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              近 {w} 日
            </button>
          ))}
        </div>
      </div>

      {/* 4-column Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">区间累计主力净流入</div>
          <div className={`mt-1.5 text-xl font-bold font-mono-num ${colorClass(stats.cumInflow)}`}>
            {formatSigned(stats.cumInflow, 1)} 亿
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">区间日均宽基成交额</div>
          <div className="mt-1.5 text-xl font-bold font-mono-num text-slate-900 dark:text-slate-50">
            {stats.avgTurnover.toFixed(1)} 亿
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">单日峰值净流入</div>
          <div className="mt-1.5 text-xl font-bold font-mono-num text-red-600 dark:text-red-400">
            {formatSigned(stats.maxInflow, 1)} 亿
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">识别托底异动天数</div>
          <div className="mt-1.5 text-xl font-bold font-mono-num text-amber-600 dark:text-amber-400">
            {history?.supportDayCount ?? 0} 日
            <span className="ml-2 text-xs font-normal text-slate-400">
              {history?.latestSupportDate ? `最近 ${history.latestSupportDate}` : '区间无触发'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Historical Charts */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            日度宽基主力净流入 vs 上证指数走势
          </h3>
        </div>
        <div className="mt-4">
          {loading && days.length === 0 ? (
            <div className="h-[310px] rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ) : (
            <EChartBox
              option={flowComboOption}
              height={310}
              testId="history-flow-chart"
              ariaLabel="日度宽基ETF主力净流入与上证指数对比图"
            />
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            20只核心宽基ETF日度成交额与均线基准对比
          </h3>
        </div>
        <div className="mt-4">
          {loading && days.length === 0 ? (
            <div className="h-[240px] rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ) : (
            <EChartBox
              option={turnoverOption}
              height={240}
              ariaLabel="20只重点宽基ETF日度成交额柱状图"
            />
          )}
        </div>
      </div>

      {/* Support Days Log Table */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            区间托底异动日监测记录
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            满足主力净流入 ≥ 35 亿、或逆势放量承接 ≥ 1.45 倍、或单日成交放量 ≥ 1.85 倍且净流入为正的交易日
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/40 dark:bg-slate-900/60">
                <th className="py-3 pl-5 pr-3">交易日期</th>
                <th className="py-3 px-3">触发特征</th>
                <th className="py-3 px-3 text-right">宽基合计成交额(亿)</th>
                <th className="py-3 px-3 text-right">主力净流入(亿)</th>
                <th className="py-3 px-3 text-right">超大单净流入(亿)</th>
                <th className="py-3 pl-3 pr-5 text-right">上证收盘 / 涨跌幅</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {supportDays.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    近 {daysWindow} 个交易日内未触发强托底异动阈值，市场处于常态博弈区间。
                  </td>
                </tr>
              ) : (
                supportDays.map((row) => (
                  <tr key={row.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 pl-5 pr-3 font-mono-num font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {row.date}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-amber-700 dark:text-amber-400 font-medium whitespace-nowrap">
                      {row.supportReason}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-slate-800 dark:text-slate-200">
                      {row.totalTurnoverYi.toFixed(1)}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono-num font-semibold ${colorClass(row.totalNetInflowYi)}`}>
                      {formatSigned(row.totalNetInflowYi, 2)}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono-num ${colorClass(row.superLargeNetInflowYi)}`}>
                      {formatSigned(row.superLargeNetInflowYi, 2)}
                    </td>
                    <td className="py-2.5 pl-3 pr-5 text-right font-mono-num whitespace-nowrap">
                      <span className="text-slate-900 dark:text-slate-100">
                        {row.sseClose.toFixed(2)}
                      </span>
                      <span className={`ml-2 text-xs ${colorClass(row.sseChangePct)}`}>
                        {formatSigned(row.sseChangePct, 2, '%')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
