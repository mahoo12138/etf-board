import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type {
  BullBearRegimeId,
  IndicesTrendResponse,
  StarDividendRatioAnalytics,
} from '../types/market';
import { formatSigned } from '../utils/indicators';
import { EChartBox } from './EChartBox';

interface BullBearRatioSectionProps {
  trendData: IndicesTrendResponse | null;
  loading: boolean;
  daysWindow: number;
  isDark: boolean;
  onChangeDaysWindow: (days: number) => void;
}

const RATIO_WINDOWS: Array<{ days: number; label: string }> = [
  { days: 60, label: '近 60 日' },
  { days: 120, label: '近半年' },
  { days: 250, label: '近 1 年' },
  { days: 500, label: '近 2 年' },
];

const REGIME_FRAMEWORK: Array<{
  id: BullBearRegimeId;
  name: string;
  scoreRange: string;
  criteria: string;
  marketMeaning: string;
}> = [
  {
    id: 'bull_strong',
    name: '成长牛市格局',
    scoreRange: '72 – 100',
    criteria: '比值 > MA20 > MA60 且处于区间高分位',
    marketMeaning: '风险偏好全面扩张，科技成长主线领涨，典型牛市进攻阶段',
  },
  {
    id: 'bull_emerging',
    name: '牛熊拐点偏多',
    scoreRange: '58 – 71',
    criteria: '比值站上中期均线，20日动量转正抬升',
    marketMeaning: '资金从红利防御切向成长进攻，具备结构性转牛特征',
  },
  {
    id: 'transition',
    name: '牛熊震荡轮动',
    scoreRange: '43 – 57',
    criteria: '比值在 MA20 与 MA60 区间内反复收敛',
    marketMeaning: '科技成长与高股息红利交替领跑，存量结构市特征明显',
  },
  {
    id: 'bear_defensive',
    name: '防御偏熊格局',
    scoreRange: '29 – 42',
    criteria: '比值跌破 MA20 与 MA60，动能持续走弱',
    marketMeaning: '市场风险偏好收缩，资金回流红利低波与高股息资产避险',
  },
  {
    id: 'bear_deep',
    name: '深度避险熊市',
    scoreRange: '0 – 28',
    criteria: '比值空头排列并落入区间低分位（≤30%）',
    marketMeaning: '防御情绪极端化，成长估值出清中，留意左侧底背离拐点',
  },
];

export function BullBearRatioSection({
  trendData,
  loading,
  daysWindow,
  isDark,
  onChangeDaysWindow,
}: BullBearRatioSectionProps) {
  const [showSseOverlay, setShowSseOverlay] = useState(true);

  const ratioData: StarDividendRatioAnalytics | null = trendData?.chinextDividendRatio ?? null;

  const ratioChartOption: EChartsOption = useMemo(() => {
    const points = ratioData?.points || [];
    const dates = points.map((p) => (daysWindow >= 250 ? p.date : p.date.slice(5)));
    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)';
    const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
    const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
    const tooltipText = isDark ? '#F1F5F9' : '#0F172A';

    const mean = ratioData?.meanRatio ?? 0;
    const std = ratioData?.stdRatio ?? 0;
    const upperBand = Number((mean + std).toFixed(4));
    const lowerBand = Number(Math.max(0, mean - std).toFixed(4));

    const hasSseData = showSseOverlay && points.some((p) => p.sseClose !== null);
    const ratioSeriesName = '创业板指/中证红利 比值';
    const legendItems = [ratioSeriesName, 'MA20', 'MA60'];
    if (hasSseData) legendItems.push('上证指数');

    const yAxes: EChartsOption['yAxis'] = [
      {
        type: 'value',
        name: '比值',
        scale: true,
        nameTextStyle: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: axisColor,
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
          formatter: (val: number) => val.toFixed(3),
        },
      },
    ];

    if (hasSseData) {
      (yAxes as Array<Record<string, unknown>>).push({
        type: 'value',
        name: '上证指数',
        scale: true,
        nameTextStyle: { color: axisColor, fontSize: 11 },
        splitLine: { show: false },
        axisLabel: {
          color: axisColor,
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
          formatter: (val: number) => Math.round(val).toString(),
        },
      });
    }

    const series: EChartsOption['series'] = [
      {
        name: ratioSeriesName,
        type: 'line',
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { width: 2.4, color: '#DC2626' },
        itemStyle: { color: '#DC2626' },
        areaStyle: {
          color: isDark ? 'rgba(220,38,38,0.10)' : 'rgba(220,38,38,0.06)',
        },
        data: points.map((p) => p.ratio),
        markLine:
          mean > 0
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
                    yAxis: mean,
                    name: '区间均值',
                    lineStyle: { color: isDark ? '#64748B' : '#94A3B8', type: 'dashed', width: 1 },
                    label: { formatter: `均值 ${mean.toFixed(4)}` },
                  },
                  ...(std > 0
                    ? [
                        {
                          yAxis: upperBand,
                          name: '+1σ 偏强线',
                          lineStyle: { color: 'rgba(220,38,38,0.45)', type: 'dotted' as const, width: 1 },
                          label: { formatter: `+1σ ${upperBand.toFixed(4)}` },
                        },
                        {
                          yAxis: lowerBand,
                          name: '-1σ 偏弱线',
                          lineStyle: { color: 'rgba(5,150,105,0.45)', type: 'dotted' as const, width: 1 },
                          label: { formatter: `-1σ ${lowerBand.toFixed(4)}` },
                        },
                      ]
                    : []),
                ],
              }
            : undefined,
      },
      {
        name: 'MA20',
        type: 'line',
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { width: 1.5, color: '#2563EB' },
        itemStyle: { color: '#2563EB' },
        data: points.map((p) => p.ma20),
      },
      {
        name: 'MA60',
        type: 'line',
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { width: 1.7, color: '#D97706' },
        itemStyle: { color: '#D97706' },
        data: points.map((p) => p.ma60),
      },
    ];

    if (hasSseData) {
      series.push({
        name: '上证指数',
        type: 'line',
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: {
          width: 1.4,
          type: 'dashed',
          color: isDark ? '#94A3B8' : '#475569',
        },
        itemStyle: { color: isDark ? '#94A3B8' : '#475569' },
        data: points.map((p) => p.sseClose),
      });
    }

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
          const pt = points[idx];
          if (!pt) return '';
          const rows = [
            `<div style="font-weight:600;margin-bottom:4px">${pt.date}</div>`,
            `<div>${ratioSeriesName}：<span style="font-weight:600">${pt.ratio.toFixed(4)}</span></div>`,
            `<div>${ratioData?.numeratorName ?? '创业板指'}：${pt.starClose.toFixed(2)} &nbsp;/&nbsp; ${ratioData?.denominatorName ?? '中证红利'}：${pt.dividendClose.toFixed(2)}</div>`,
            pt.ma20 !== null ? `<div>MA20：${pt.ma20.toFixed(4)}</div>` : '',
            pt.ma60 !== null ? `<div>MA60：${pt.ma60.toFixed(4)}</div>` : '',
            hasSseData && pt.sseClose !== null
              ? `<div>上证指数：${pt.sseClose.toFixed(2)}</div>`
              : '',
          ].filter(Boolean);
          return rows.join('');
        },
      },
      legend: {
        top: 0,
        left: 'center',
        textStyle: { color: axisColor, fontSize: 12 },
        data: legendItems,
      },
      grid: { left: 58, right: hasSseData ? 58 : 24, top: 48, bottom: 28 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      },
      yAxis: yAxes,
      series,
    };
  }, [ratioData, daysWindow, showSseOverlay, isDark]);

  const momentumOption: EChartsOption = useMemo(() => {
    const points = (ratioData?.points || []).filter((p) => p.deviationMa60Pct !== null);
    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)';
    const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
    const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
    const tooltipText = isDark ? '#F1F5F9' : '#0F172A';

    return {
      animationDuration: 300,
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
      },
      grid: { left: 50, right: 18, top: 26, bottom: 26 },
      xAxis: {
        type: 'category',
        data: points.map((p) => (daysWindow >= 250 ? p.date.slice(2) : p.date.slice(5))),
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
      },
      yAxis: {
        type: 'value',
        name: '偏离MA60(%)',
        nameTextStyle: { color: axisColor, fontSize: 10 },
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: axisColor,
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          formatter: '{value}%',
        },
      },
      series: [
        {
          name: '比值偏离MA60(%)',
          type: 'bar',
          barMaxWidth: 8,
          data: points.map((p) => {
            const val = p.deviationMa60Pct ?? 0;
            return {
              value: val,
              itemStyle: {
                color: val >= 0 ? '#DC2626' : '#059669',
                borderRadius: val >= 0 ? [2, 2, 0, 0] : [0, 0, 2, 2],
              },
            };
          }),
        },
      ],
    };
  }, [ratioData, daysWindow, isDark]);

  const regimeColorClass = (regime?: BullBearRegimeId) => {
    switch (regime) {
      case 'bull_strong':
      case 'bull_emerging':
        return 'text-red-600 dark:text-red-400';
      case 'bear_defensive':
      case 'bear_deep':
        return 'text-emerald-600 dark:text-emerald-400';
      default:
        return 'text-amber-600 dark:text-amber-400';
    }
  };

  const signedColor = (v: number | null) =>
    v === null
      ? 'text-slate-500'
      : v > 0
        ? 'text-red-600 dark:text-red-400'
        : v < 0
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-slate-600 dark:text-slate-400';

  const score = ratioData?.signal.score ?? 50;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            创业板指 (399006) / 中证红利 (000922) · 牛熊比值风向标
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            创业板指（高弹性成长风向标）对比中证红利（高股息防御基准）：比值上行站稳 MA60 偏牛，下行跌破均线偏熊
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start xl:self-auto">
          <div
            role="group"
            aria-label="选择历史周期窗口"
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
          >
            {RATIO_WINDOWS.map((w) => (
              <button
                key={w.days}
                type="button"
                onClick={() => onChangeDaysWindow(w.days)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  daysWindow === w.days
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top 4-Column Bull/Bear Quantitative KPI Strip */}
      <section aria-label="牛熊比值核心量化指标">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">创业板指 / 中证红利 比值</span>
              <span
                className={`font-mono-num whitespace-nowrap shrink-0 ${signedColor(ratioData?.dailyChangePct ?? null)}`}
              >
                日变动 {ratioData ? formatSigned(ratioData.dailyChangePct, 2, '%') : '--'}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                data-testid="ratio-latest-value"
                className="text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-50"
              >
                {ratioData && ratioData.latestRatio > 0 ? ratioData.latestRatio.toFixed(4) : '--'}
              </span>
            </div>
            <p className="mt-2 text-xs font-mono-num text-slate-500 dark:text-slate-400 truncate">
              {ratioData && ratioData.latestRatio > 0
                ? `${ratioData.numeratorName} ${ratioData.latestStarClose.toFixed(1)} ÷ 红利 ${ratioData.latestDividendClose.toFixed(1)}`
                : '正在计算实时点位比值...'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">当前牛熊周期判研</span>
              <span className="font-mono-num whitespace-nowrap shrink-0">
                温度 {ratioData ? `${score} / 100` : '--'}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                data-testid="ratio-regime-label"
                className={`text-xl font-bold truncate ${regimeColorClass(ratioData?.signal.regime)}`}
              >
                {ratioData ? ratioData.signal.label : '数据加载中'}
              </span>
            </div>
            <div className="mt-2.5">
              <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-600 relative overflow-visible">
                <div
                  className="w-2.5 h-2.5 rounded-full bg-slate-900 dark:bg-white border-2 border-white dark:border-slate-900 absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all"
                  style={{ left: `${score}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                <span>避险熊市 (0)</span>
                <span>震荡 (50)</span>
                <span>成长牛市 (100)</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">区间历史分位 · Z-Score</span>
              <span className="font-mono-num whitespace-nowrap shrink-0">
                Z {ratioData ? formatSigned(ratioData.zScore, 2) : '--'}σ
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-50">
                {ratioData ? `${ratioData.percentilePct.toFixed(1)}%` : '--'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">分位点</span>
            </div>
            <p className="mt-2 text-xs font-mono-num text-slate-500 dark:text-slate-400 truncate">
              距 MA60{' '}
              <span className={signedColor(ratioData?.deviationFromMa60Pct ?? null)}>
                {ratioData?.deviationFromMa60Pct !== null && ratioData?.deviationFromMa60Pct !== undefined
                  ? formatSigned(ratioData.deviationFromMa60Pct, 2, '%')
                  : '--'}
              </span>{' '}
              · 均值 {ratioData && ratioData.meanRatio > 0 ? ratioData.meanRatio.toFixed(4) : '--'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">比值动量 (20日 / 60日)</span>
              <span className="font-mono-num whitespace-nowrap shrink-0">
                60日{' '}
                {ratioData?.change60dPct !== null && ratioData?.change60dPct !== undefined
                  ? formatSigned(ratioData.change60dPct, 1, '%')
                  : '--'}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold font-mono-num ${signedColor(ratioData?.change20dPct ?? null)}`}
              >
                {ratioData?.change20dPct !== null && ratioData?.change20dPct !== undefined
                  ? formatSigned(ratioData.change20dPct, 2, '%')
                  : '--'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">近20日</span>
            </div>
            <p className="mt-2 text-xs font-mono-num text-slate-500 dark:text-slate-400 truncate">
              区间低/高 {ratioData && ratioData.minRatio > 0 ? ratioData.minRatio.toFixed(4) : '--'} /{' '}
              {ratioData && ratioData.maxRatio > 0 ? ratioData.maxRatio.toFixed(4) : '--'}
            </p>
          </div>
        </div>
      </section>

      {/* Primary Ratio & Moving Average Trend Chart */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              创业板指 (399006) / 中证红利 (000922) 历史比值走势与均线通道
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              包含 MA20 / MA60 趋势均线与区间均值 ±1σ 通道，直观对照上证指数验证牛熊转换节点
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 select-none cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={showSseOverlay}
              onChange={(e) => setShowSseOverlay(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600/40"
            />
            <span>叠加展示上证指数 (右轴)</span>
          </label>
        </div>

        <div className="mt-4">
          {loading && !ratioData ? (
            <div className="h-[380px] rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ) : (
            <EChartBox
              option={ratioChartOption}
              height={380}
              testId="bull-bear-ratio-chart"
              ariaLabel="创业板指与中证红利牛熊比值走势及均线通道图"
            />
          )}
        </div>
      </section>

      {/* Bottom 2-Column Analytical Breakdown: MA60 Deviation Momentum + Regime Decoding Table */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              比值偏离 MA60 动能监测（牛熊趋势强弱）
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              红柱（&gt;0%）代表比值运行于季线之上、成长偏牛；绿柱（&lt;0%）代表红利避险偏熊
            </p>
          </div>
          <div className="mt-4">
            {loading && !ratioData ? (
              <div className="h-[260px] rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ) : (ratioData?.points || []).some((p) => p.deviationMa60Pct !== null) ? (
              <EChartBox
                option={momentumOption}
                height={260}
                testId="ratio-momentum-chart"
                ariaLabel="比值偏离MA60动能柱状图"
              />
            ) : (
              <div className="h-[260px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                需至少 60 个交易日数据计算 MA60 偏离度，请切换至「近半年」或更长周期
              </div>
            )}
          </div>
        </div>

        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                牛熊状态量化解码与观察框架
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                结合均线多空排列、区间分位点与 20 日比值动量，识别 A 股风险偏好周期
              </p>
            </div>

            {ratioData && (
              <div className="mt-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={`font-semibold ${regimeColorClass(ratioData.signal.regime)}`}>
                    当前判定：{ratioData.signal.label}
                  </span>
                  <span className="font-mono-num text-slate-500 dark:text-slate-400">
                    MA20 {ratioData.ma20?.toFixed(4) ?? '--'} · MA60 {ratioData.ma60?.toFixed(4) ?? '--'}
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {ratioData.signal.summary}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {ratioData.signal.allocationHint}
                </p>
              </div>
            )}

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3">周期状态</th>
                    <th className="py-2 px-2 font-mono-num whitespace-nowrap">温度分</th>
                    <th className="py-2 pl-2">量化特征与市场含义</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {REGIME_FRAMEWORK.map((row) => {
                    const isCurrent = ratioData?.signal.regime === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={
                          isCurrent
                            ? 'bg-blue-50/70 dark:bg-blue-950/35'
                            : ''
                        }
                      >
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              isCurrent
                                ? regimeColorClass(row.id)
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isCurrent ? `● ${row.name}` : row.name}
                          </span>
                        </td>
                        <td className="py-2 px-2 font-mono-num text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {row.scoreRange}
                        </td>
                        <td className="py-2 pl-2 text-slate-600 dark:text-slate-400">
                          {row.marketMeaning}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
