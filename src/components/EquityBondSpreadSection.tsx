import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type {
  EquityBondIndexCode,
  EquityBondSpreadResponse,
  EquityBondZoneId,
} from '../types/market';
import { EChartBox } from './EChartBox';

interface EquityBondSpreadSectionProps {
  data: EquityBondSpreadResponse | null;
  loading: boolean;
  indexCode: EquityBondIndexCode;
  isDark: boolean;
  onChangeIndexCode: (code: EquityBondIndexCode) => void;
}

type RangeId = 'all' | '1y' | '3y' | '5y';

const RANGE_OPTIONS: Array<{ id: RangeId; label: string; years: number | null }> = [
  { id: 'all', label: '全部数据', years: null },
  { id: '1y', label: '近 1 年', years: 1 },
  { id: '3y', label: '近 3 年', years: 3 },
  { id: '5y', label: '近 5 年', years: 5 },
];

export function EquityBondSpreadSection({
  data,
  loading,
  indexCode,
  isDark,
  onChangeIndexCode,
}: EquityBondSpreadSectionProps) {
  const [range, setRange] = useState<RangeId>('5y');

  const visiblePoints = useMemo(() => {
    const all = data?.points || [];
    if (all.length === 0) return [];
    const opt = RANGE_OPTIONS.find((r) => r.id === range);
    if (!opt || opt.years === null) return all;
    const latestMs = Date.parse(all[all.length - 1].date);
    const cutoffMs = latestMs - opt.years * 365.25 * 24 * 60 * 60 * 1000;
    const filtered = all.filter((p) => Date.parse(p.date) >= cutoffMs);
    return filtered.length > 0 ? filtered : all;
  }, [data, range]);

  const spreadChartOption: EChartsOption = useMemo(() => {
    const dates = visiblePoints.map((p) => p.date);
    const spreads = visiblePoints.map((p) => p.spreadPct);
    const closes = visiblePoints.map((p) => p.close);

    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)';
    const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
    const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
    const tooltipText = isDark ? '#F1F5F9' : '#0F172A';

    const meanSpread =
      spreads.length > 0
        ? Number((spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(2))
        : 0;
    const sortedSpreads = [...spreads].sort((a, b) => a - b);
    const p80 =
      sortedSpreads.length > 0
        ? sortedSpreads[Math.min(sortedSpreads.length - 1, Math.floor(sortedSpreads.length * 0.8))]
        : 0;
    const p20 =
      sortedSpreads.length > 0
        ? sortedSpreads[Math.floor(sortedSpreads.length * 0.2)]
        : 0;

    const idxName = data?.indexName ?? '沪深300';

    return {
      animationDuration: 350,
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [];
          if (list.length === 0) return '';
          const idx = (list[0] as { dataIndex?: number }).dataIndex ?? 0;
          const pt = visiblePoints[idx];
          if (!pt) return '';
          return [
            `<div style="font-weight:600;margin-bottom:4px">${pt.date}</div>`,
            `<div>股债利差 (ERP)：<span style="font-weight:600;color:#2563EB">${pt.spreadPct.toFixed(2)}%</span></div>`,
            `<div>盈利收益率 (100/PE)：${pt.earningsYieldPct.toFixed(2)}% &nbsp;(PE ${pt.pe.toFixed(2)})</div>`,
            `<div>中国10年期国债：${pt.bondYield10yPct.toFixed(3)}%</div>`,
            `<div>${idxName}收盘：<span style="font-weight:600;color:#DC2626">${pt.close.toFixed(2)}</span></div>`,
          ].join('');
        },
      },
      legend: {
        top: 0,
        left: 'center',
        textStyle: { color: axisColor, fontSize: 12 },
        data: ['股债利差 (ERP)', `${idxName}点位`],
      },
      grid: { left: 56, right: 60, top: 48, bottom: 52 },
      dataZoom: [
        {
          type: 'slider',
          height: 18,
          bottom: 6,
          borderColor: gridColor,
          backgroundColor: isDark ? 'rgba(30,41,59,0.5)' : 'rgba(241,245,249,0.8)',
          fillerColor: isDark ? 'rgba(37,99,235,0.28)' : 'rgba(37,99,235,0.16)',
          handleStyle: { color: '#2563EB' },
          textStyle: { color: axisColor, fontSize: 10 },
        },
      ],
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      },
      yAxis: [
        {
          type: 'value',
          name: '股债利差(%)',
          scale: true,
          nameTextStyle: { color: axisColor, fontSize: 11 },
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: {
            color: axisColor,
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            formatter: '{value}%',
          },
        },
        {
          type: 'value',
          name: `${idxName}点位`,
          scale: true,
          nameTextStyle: { color: axisColor, fontSize: 11 },
          splitLine: { show: false },
          axisLabel: {
            color: axisColor,
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            formatter: (v: number) => Math.round(v).toLocaleString('en-US'),
          },
        },
      ],
      series: [
        {
          name: '股债利差 (ERP)',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          lineStyle: { width: 2.2, color: '#2563EB' },
          itemStyle: { color: '#2563EB' },
          areaStyle: {
            color: isDark ? 'rgba(37,99,235,0.12)' : 'rgba(37,99,235,0.08)',
          },
          data: spreads,
          markLine:
            spreads.length > 0
              ? {
                  silent: true,
                  symbol: 'none',
                  label: {
                    position: 'insideEndTop',
                    fontSize: 10,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: axisColor,
                  },
                  data: [
                    {
                      yAxis: p80,
                      lineStyle: { color: 'rgba(220,38,38,0.45)', type: 'dotted', width: 1 },
                      label: { formatter: `80%分位 ${p80.toFixed(2)}%` },
                    },
                    {
                      yAxis: meanSpread,
                      lineStyle: { color: isDark ? '#64748B' : '#94A3B8', type: 'dashed', width: 1 },
                      label: { formatter: `均值 ${meanSpread.toFixed(2)}%` },
                    },
                    {
                      yAxis: p20,
                      lineStyle: { color: 'rgba(5,150,105,0.45)', type: 'dotted', width: 1 },
                      label: { formatter: `20%分位 ${p20.toFixed(2)}%` },
                    },
                  ],
                }
              : undefined,
        },
        {
          name: `${idxName}点位`,
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          lineStyle: { width: 1.6, color: '#DC2626' },
          itemStyle: { color: '#DC2626' },
          data: closes,
        },
      ],
    };
  }, [visiblePoints, data?.indexName, isDark]);

  const ratioChartOption: EChartsOption = useMemo(() => {
    const dates = visiblePoints.map((p) => p.date);
    const ratios = visiblePoints.map((p) => p.ratio);
    const closes = visiblePoints.map((p) => p.close);

    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)';
    const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
    const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
    const tooltipText = isDark ? '#F1F5F9' : '#0F172A';

    const meanRatio =
      ratios.length > 0
        ? Number((ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2))
        : 0;
    const idxName = data?.indexName ?? '沪深300';

    return {
      animationDuration: 350,
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [];
          if (list.length === 0) return '';
          const idx = (list[0] as { dataIndex?: number }).dataIndex ?? 0;
          const pt = visiblePoints[idx];
          if (!pt) return '';
          return [
            `<div style="font-weight:600;margin-bottom:4px">${pt.date}</div>`,
            `<div>股债比：<span style="font-weight:600;color:#7C3AED">${pt.ratio.toFixed(2)} 倍</span></div>`,
            `<div>盈利收益率 ${pt.earningsYieldPct.toFixed(2)}% ÷ 10Y国债 ${pt.bondYield10yPct.toFixed(3)}%</div>`,
            `<div>${idxName}收盘：<span style="font-weight:600;color:#DC2626">${pt.close.toFixed(2)}</span></div>`,
          ].join('');
        },
      },
      legend: {
        top: 0,
        left: 'center',
        textStyle: { color: axisColor, fontSize: 12 },
        data: ['股债比 (倍)', `${idxName}点位`],
      },
      grid: { left: 56, right: 60, top: 48, bottom: 52 },
      dataZoom: [
        {
          type: 'slider',
          height: 18,
          bottom: 6,
          borderColor: gridColor,
          backgroundColor: isDark ? 'rgba(30,41,59,0.5)' : 'rgba(241,245,249,0.8)',
          fillerColor: isDark ? 'rgba(124,58,237,0.28)' : 'rgba(124,58,237,0.16)',
          handleStyle: { color: '#7C3AED' },
          textStyle: { color: axisColor, fontSize: 10 },
        },
      ],
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      },
      yAxis: [
        {
          type: 'value',
          name: '股债比(倍)',
          scale: true,
          nameTextStyle: { color: axisColor, fontSize: 11 },
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: {
            color: axisColor,
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            formatter: '{value}x',
          },
        },
        {
          type: 'value',
          name: `${idxName}点位`,
          scale: true,
          nameTextStyle: { color: axisColor, fontSize: 11 },
          splitLine: { show: false },
          axisLabel: {
            color: axisColor,
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            formatter: (v: number) => Math.round(v).toLocaleString('en-US'),
          },
        },
      ],
      series: [
        {
          name: '股债比 (倍)',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          lineStyle: { width: 2.2, color: '#7C3AED' },
          itemStyle: { color: '#7C3AED' },
          areaStyle: {
            color: isDark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.07)',
          },
          data: ratios,
          markLine:
            ratios.length > 0
              ? {
                  silent: true,
                  symbol: 'none',
                  label: {
                    position: 'insideEndTop',
                    fontSize: 10,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: axisColor,
                  },
                  data: [
                    {
                      yAxis: meanRatio,
                      lineStyle: { color: isDark ? '#64748B' : '#94A3B8', type: 'dashed', width: 1 },
                      label: { formatter: `均值 ${meanRatio.toFixed(2)}倍` },
                    },
                  ],
                }
              : undefined,
        },
        {
          name: `${idxName}点位`,
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          lineStyle: { width: 1.6, color: '#DC2626' },
          itemStyle: { color: '#DC2626' },
          data: closes,
        },
      ],
    };
  }, [visiblePoints, data?.indexName, isDark]);

  const zoneColorClass = (zone?: EquityBondZoneId) => {
    switch (zone) {
      case 'very_attractive':
      case 'attractive':
        return 'text-red-600 dark:text-red-400';
      case 'cautious':
      case 'expensive':
        return 'text-emerald-600 dark:text-emerald-400';
      default:
        return 'text-amber-600 dark:text-amber-400';
    }
  };

  const fiveYearPct =
    data?.percentiles.find((p) => p.id === '5y')?.spreadPercentilePct ??
    data?.percentiles[0]?.spreadPercentilePct ??
    50;

  return (
    <div className="space-y-6">
      {/* Header & Index/Range Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {data?.indexName ?? (indexCode === '000905' ? '中证500' : '沪深300')} 股债利差、股债比与股权风险溢价 (ERP)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            股债利差 = 100 / PE-TTM − 中国10年期国债收益率；股债比 = 盈利收益率 ÷ 10年期国债收益率（利差越高，权益相对债券性价比越高）
          </p>
        </div>

        <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 shrink-0 self-start xl:self-auto">
          <div
            role="group"
            aria-label="选择目标指数"
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
          >
            <button
              type="button"
              onClick={() => onChangeIndexCode('000300')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                indexCode === '000300'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              沪深300 (000300)
            </button>
            <button
              type="button"
              onClick={() => onChangeIndexCode('000905')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                indexCode === '000905'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              中证500 (000905)
            </button>
          </div>

          <div
            role="group"
            aria-label="选择图表展示区间"
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
          >
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  range === opt.id
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top 5-Column Core Metric Strip (baifenwei.com inspired) */}
      <section aria-label="股债利差核心指标">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">股债利差 (ERP)</span>
              <span className="font-mono-num whitespace-nowrap shrink-0">
                {data
                  ? `${data.spreadChange1dBp >= 0 ? '+' : ''}${data.spreadChange1dBp}bp`
                  : '--'}
              </span>
            </div>
            <div
              data-testid="erp-latest-spread"
              className="mt-2 text-2xl font-bold font-mono-num text-blue-600 dark:text-blue-400"
            >
              {data && data.totalPoints > 0 ? `${data.latestSpreadPct.toFixed(2)}%` : '--'}
            </div>
            <p className="mt-1.5 text-xs font-mono-num text-slate-500 dark:text-slate-400 truncate">
              盈利 {data && data.totalPoints > 0 ? `${data.latestEarningsYieldPct.toFixed(2)}%` : '--'} − 债{' '}
              {data && data.totalPoints > 0 ? `${data.latestBondYield10yPct.toFixed(2)}%` : '--'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">股债比 (倍数)</span>
              <span className="font-mono-num whitespace-nowrap shrink-0">E/P ÷ CN10Y</span>
            </div>
            <div
              data-testid="erp-latest-ratio"
              className="mt-2 text-2xl font-bold font-mono-num text-violet-600 dark:text-violet-400"
            >
              {data && data.totalPoints > 0 ? `${data.latestRatio.toFixed(2)}倍` : '--'}
            </div>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
              盈利收益率相对国债倍数
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">指数 PE-TTM</span>
              <span className="font-mono-num whitespace-nowrap shrink-0">中证官方口径</span>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-50">
              {data && data.totalPoints > 0 ? data.latestPe.toFixed(2) : '--'}
            </div>
            <p className="mt-1.5 text-xs font-mono-num text-slate-500 dark:text-slate-400 truncate">
              收盘 {data && data.totalPoints > 0 ? data.latestClose.toFixed(2) : '--'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">中国10年期国债</span>
              <span className="font-mono-num whitespace-nowrap shrink-0">无风险基准</span>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-50">
              {data && data.totalPoints > 0 ? `${data.latestBondYield10yPct.toFixed(3)}%` : '--'}
            </div>
            <p className="mt-1.5 text-xs font-mono-num text-slate-500 dark:text-slate-400 truncate">
              截至 {data?.latestDate || '--'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">性价比位置判研</span>
              <span className="font-mono-num whitespace-nowrap shrink-0">
                5年 {data && data.totalPoints > 0 ? `${fiveYearPct.toFixed(1)}%` : '--'}
              </span>
            </div>
            <div
              className={`mt-2 text-lg font-bold truncate ${zoneColorClass(data?.zoneSignal.zone)}`}
            >
              {data && data.totalPoints > 0 ? data.zoneSignal.label : '计算中...'}
            </div>
            <div className="mt-2.5">
              <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-600 relative">
                <div
                  className="w-2.5 h-2.5 rounded-full bg-slate-900 dark:bg-white border-2 border-white dark:border-slate-900 absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                  style={{ left: `${Math.max(0, Math.min(100, fiveYearPct))}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Historical Percentile Matrix Table (matching baifenwei.com) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              股债利差与股债比历史百分位
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              切换图表展示区间不改变各时间跨度的历史百分位样本定义（历史起点：{data?.historyStartDate || '--'}，共 {data?.totalPoints ?? 0} 个交易日）
            </p>
          </div>
          {data && data.totalPoints > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
              {data.zoneSignal.summary}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-5 font-medium">指标 / 时间跨度</th>
                {(data?.percentiles || [
                  { id: 'all', label: '全部样本' },
                  { id: '5y', label: '近 5 年' },
                  { id: '3y', label: '近 3 年' },
                  { id: '1y', label: '近 1 年' },
                ]).map((w) => (
                  <th key={w.id} className="py-2.5 px-5 font-medium text-right whitespace-nowrap">
                    {w.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <tr>
                <td className="py-3 px-5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  股债利差当前百分位
                </td>
                {(data?.percentiles || []).map((w) => (
                  <td
                    key={w.id}
                    className={`py-3 px-5 text-right font-mono-num font-semibold whitespace-nowrap ${
                      w.spreadPercentilePct >= 70
                        ? 'text-red-600 dark:text-red-400'
                        : w.spreadPercentilePct <= 30
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {w.spreadPercentilePct.toFixed(2)}%
                  </td>
                ))}
                {!data &&
                  [0, 1, 2, 3].map((k) => (
                    <td key={k} className="py-3 px-5 text-right font-mono-num text-slate-400">
                      --
                    </td>
                  ))}
              </tr>
              <tr>
                <td className="py-3 px-5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  股债比当前百分位
                </td>
                {(data?.percentiles || []).map((w) => (
                  <td
                    key={w.id}
                    className="py-3 px-5 text-right font-mono-num font-medium text-violet-600 dark:text-violet-400 whitespace-nowrap"
                  >
                    {w.ratioPercentilePct.toFixed(2)}%
                  </td>
                ))}
                {!data &&
                  [0, 1, 2, 3].map((k) => (
                    <td key={k} className="py-3 px-5 text-right font-mono-num text-slate-400">
                      --
                    </td>
                  ))}
              </tr>
              <tr>
                <td className="py-3 px-5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  区间利差均值（最低 ~ 最高）
                </td>
                {(data?.percentiles || []).map((w) => (
                  <td
                    key={w.id}
                    className="py-3 px-5 text-right font-mono-num text-slate-600 dark:text-slate-400 whitespace-nowrap"
                  >
                    {w.meanSpreadPct.toFixed(2)}%{' '}
                    <span className="text-slate-400 dark:text-slate-500">
                      ({w.minSpreadPct.toFixed(1)}%~{w.maxSpreadPct.toFixed(1)}%)
                    </span>
                  </td>
                ))}
                {!data &&
                  [0, 1, 2, 3].map((k) => (
                    <td key={k} className="py-3 px-5 text-right font-mono-num text-slate-400">
                      --
                    </td>
                  ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Chart 1: Equity-Bond Spread vs Index Close (Dual Axis) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              股债利差 (ERP) 与{data?.indexName ?? '沪深300'}历史走势
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              左轴蓝线为股债利差（100/PE − 10Y国债），右轴红线为指数收盘点位；虚线标示区间 80% / 均值 / 20% 分位线
            </p>
          </div>
          <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400 shrink-0">
            共 {visiblePoints.length} 个交易日
          </span>
        </div>

        <div className="mt-4">
          {loading && visiblePoints.length === 0 ? (
            <div className="h-[360px] rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
              正在同步中证官方历史 PE 与十年期国债收益率...
            </div>
          ) : (
            <EChartBox
              option={spreadChartOption}
              height={360}
              testId="erp-spread-chart"
              ariaLabel="股债利差与指数点位双轴历史走势图"
            />
          )}
        </div>
      </section>

      {/* Chart 2: Equity-Bond Ratio vs Index Close (Dual Axis) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              股债比 (倍) 与{data?.indexName ?? '沪深300'}历史走势
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              左轴紫线为股债比（盈利收益率 ÷ 10Y国债收益率），右轴红线为指数收盘点位；倍数越高代表股票盈利回报相对无风险利率越具优势
            </p>
          </div>
          <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400 shrink-0">
            最新 {data && data.totalPoints > 0 ? `${data.latestRatio.toFixed(2)} 倍` : '--'}
          </span>
        </div>

        <div className="mt-4">
          {loading && visiblePoints.length === 0 ? (
            <div className="h-[340px] rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ) : (
            <EChartBox
              option={ratioChartOption}
              height={340}
              testId="erp-ratio-chart"
              ariaLabel="股债比与指数点位双轴历史走势图"
            />
          )}
        </div>
      </section>

      {/* Methodology & Reading Guide */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          计算口径与读图说明
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
            <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
              1. 核心公式（FED 模型）
            </div>
            <p>
              股债利差 = <span className="font-mono-num">100 / PE-TTM − 10Y国债收益率</span>（百分点）；股债比 ={' '}
              <span className="font-mono-num">(100 / PE-TTM) ÷ 10Y国债收益率</span>（倍），分别从差值与倍数观察股票相对债券的配置性价比。
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
            <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
              2. 高分位 vs 低分位含义
            </div>
            <p>
              利差处于历史 70%–80% 以上高分位时，意味着股票盈利收益率相对国债的补偿极高，历史上多对应市场低估底部；反之处于 20% 以下低分位时需注意估值透支风险。
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
            <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
              3. 数据来源与局限性
            </div>
            <p>
              指数 PE 与收盘点位来自中证指数官方披露，十年期国债收益率来自银行间国债收益率曲线。股债利差受盈利周期、利率中枢与风险偏好共同影响，仅作历史估值位置参考。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
