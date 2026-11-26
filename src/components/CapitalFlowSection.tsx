import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { EtfCategory, EtfLiveQuote } from '../types/market';
import { aggregateCapitalFlowTiers, formatSigned } from '../utils/indicators';
import { EChartBox } from './EChartBox';

interface CapitalFlowSectionProps {
  etfs: EtfLiveQuote[];
  isDark: boolean;
}

const SCOPE_OPTIONS: Array<{ id: 'all' | EtfCategory; label: string }> = [
  { id: 'all', label: '全部20只宽基' },
  { id: 'hs300', label: '沪深300' },
  { id: 'star', label: '科创板' },
  { id: 'dividend', label: '红利价值' },
  { id: 'broad_large', label: '大盘核心' },
  { id: 'mid_small', label: '中小盘' },
  { id: 'a500', label: '中证A500' },
];

const SECTOR_GROUPS: Array<{ id: EtfCategory; label: string }> = [
  { id: 'hs300', label: '沪深300' },
  { id: 'broad_large', label: '大盘核心' },
  { id: 'star', label: '科创板' },
  { id: 'dividend', label: '红利价值' },
  { id: 'mid_small', label: '中小盘' },
  { id: 'a500', label: '中证A500' },
];

export function CapitalFlowSection({ etfs, isDark }: CapitalFlowSectionProps) {
  const [scope, setScope] = useState<'all' | EtfCategory>('all');

  const flow = useMemo(() => aggregateCapitalFlowTiers(etfs, scope), [etfs, scope]);

  const flowColor = (v: number) =>
    v > 0
      ? 'text-red-600 dark:text-red-400'
      : v < 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-600 dark:text-slate-400';

  const regimeColor = (id: string) => {
    if (id === 'institutional_support' || id === 'chips_accumulating') {
      return 'text-red-600 dark:text-red-400';
    }
    if (id === 'chips_distributing') {
      return 'text-emerald-600 dark:text-emerald-400';
    }
    return 'text-amber-600 dark:text-amber-400';
  };

  // Left chart: 4-tier Inflow vs Outflow vs Net comparison (主力 / 机构 / 大户 / 散户)
  const inOutChartOption: EChartsOption = useMemo(() => {
    const tiers = [
      { label: '主力\n(机构+大户)', stats: flow.main },
      { label: '机构\n(特大单)', stats: flow.institution },
      { label: '大户\n(大单)', stats: flow.large },
      { label: '散户\n(中小单)', stats: flow.retail },
    ];

    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)';
    const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
    const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
    const tooltipText = isDark ? '#F1F5F9' : '#0F172A';

    return {
      animationDuration: 320,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [];
          if (list.length === 0) return '';
          const idx = (list[0] as { dataIndex?: number }).dataIndex ?? 0;
          const item = tiers[idx];
          if (!item) return '';
          const netClr = item.stats.netYi >= 0 ? '#DC2626' : '#059669';
          const title = item.label.replace('\n', ' ');
          const extra =
            idx === 3
              ? `<div style="color:${axisColor};margin-top:2px">中单净 ${formatSigned(flow.medium.netYi, 2, '亿')} · 小单净 ${formatSigned(flow.small.netYi, 2, '亿')}</div>`
              : '';
          return [
            `<div style="font-weight:600;margin-bottom:4px">${title}</div>`,
            `<div>主动流入：<span style="color:#DC2626;font-weight:600">${item.stats.inflowYi.toFixed(2)} 亿</span></div>`,
            `<div>主动流出：<span style="color:#059669;font-weight:600">${item.stats.outflowYi.toFixed(2)} 亿</span></div>`,
            `<div>净流入：<span style="color:${netClr};font-weight:700">${formatSigned(item.stats.netYi, 2, ' 亿')}</span> (${formatSigned(item.stats.netRatioPct, 2, '%')})</div>`,
            `<div style="color:${axisColor}">成交占比：${item.stats.turnoverSharePct.toFixed(1)}%</div>`,
            extra,
          ].join('');
        },
      },
      legend: {
        top: 0,
        left: 'center',
        textStyle: { color: axisColor, fontSize: 11 },
        data: ['主动流入', '主动流出', '净流入(亿)'],
      },
      grid: { left: 52, right: 20, top: 34, bottom: 40 },
      xAxis: {
        type: 'category',
        data: tiers.map((t) => t.label),
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 11, lineHeight: 15 },
      },
      yAxis: {
        type: 'value',
        name: '亿元',
        nameTextStyle: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      },
      series: [
        {
          name: '主动流入',
          type: 'bar',
          barMaxWidth: 22,
          itemStyle: { color: 'rgba(220, 38, 38, 0.82)', borderRadius: [3, 3, 0, 0] },
          data: tiers.map((t) => t.stats.inflowYi),
        },
        {
          name: '主动流出',
          type: 'bar',
          barMaxWidth: 22,
          itemStyle: { color: 'rgba(5, 150, 105, 0.82)', borderRadius: [3, 3, 0, 0] },
          data: tiers.map((t) => t.stats.outflowYi),
        },
        {
          name: '净流入(亿)',
          type: 'bar',
          barMaxWidth: 22,
          data: tiers.map((t) => ({
            value: t.stats.netYi,
            itemStyle: {
              color: t.stats.netYi >= 0 ? '#2563EB' : '#D97706',
              borderRadius: t.stats.netYi >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
            },
          })),
          label: {
            show: true,
            position: 'top',
            color: axisColor,
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            formatter: (params: unknown) => {
              const v = Number((params as { value?: number }).value ?? 0);
              return v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
            },
          },
        },
      ],
    };
  }, [flow, isDark]);

  // Right chart: Sector (or individual ETF when scoped) breakdown of 机构 vs 大户 vs 散户 net flow
  const structureChartOption: EChartsOption = useMemo(() => {
    const rows =
      scope === 'all'
        ? SECTOR_GROUPS.map((g) => {
            const agg = aggregateCapitalFlowTiers(etfs, g.id);
            return {
              label: g.label,
              institution: agg.institution.netYi,
              large: agg.large.netYi,
              retail: agg.retail.netYi,
            };
          })
        : etfs
            .filter((e) => e.category === scope)
            .sort((a, b) => b.turnoverYi - a.turnoverYi)
            .slice(0, 6)
            .map((e) => ({
              label: e.shortName,
              institution: e.tieredFlow?.institution.netYi ?? 0,
              large: e.tieredFlow?.large.netYi ?? 0,
              retail: e.tieredFlow?.retail.netYi ?? 0,
            }));

    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)';
    const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
    const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
    const tooltipText = isDark ? '#F1F5F9' : '#0F172A';

    return {
      animationDuration: 320,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
      },
      legend: {
        top: 0,
        left: 'center',
        textStyle: { color: axisColor, fontSize: 11 },
        data: ['机构(特大单)', '大户(大单)', '散户(中小单)'],
      },
      grid: { left: 52, right: 18, top: 34, bottom: 32 },
      xAxis: {
        type: 'category',
        data: rows.map((r) => r.label),
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: '净流入(亿)',
        nameTextStyle: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      },
      series: [
        {
          name: '机构(特大单)',
          type: 'bar',
          barMaxWidth: 16,
          itemStyle: { color: '#2563EB', borderRadius: [2, 2, 0, 0] },
          data: rows.map((r) => r.institution),
        },
        {
          name: '大户(大单)',
          type: 'bar',
          barMaxWidth: 16,
          itemStyle: { color: '#7C3AED', borderRadius: [2, 2, 0, 0] },
          data: rows.map((r) => r.large),
        },
        {
          name: '散户(中小单)',
          type: 'bar',
          barMaxWidth: 16,
          itemStyle: { color: '#D97706', borderRadius: [2, 2, 0, 0] },
          data: rows.map((r) => r.retail),
        },
      ],
    };
  }, [etfs, scope, isDark]);

  const tierCards = [
    {
      id: 'main',
      title: '主力资金',
      subtitle: '机构 + 大户',
      stats: flow.main,
      accentBorder: 'border-l-blue-600 dark:border-l-blue-500',
      detail: `占总成交 ${flow.main.turnoverSharePct.toFixed(1)}% · 净占比 ${formatSigned(flow.main.netRatioPct, 2, '%')}`,
    },
    {
      id: 'institution',
      title: '机构资金',
      subtitle: '特大单 ≥100万',
      stats: flow.institution,
      accentBorder: 'border-l-indigo-600 dark:border-l-indigo-400',
      detail: `占总成交 ${flow.institution.turnoverSharePct.toFixed(1)}% · 净占比 ${formatSigned(flow.institution.netRatioPct, 2, '%')}`,
    },
    {
      id: 'large',
      title: '大户资金',
      subtitle: '大单 20~100万',
      stats: flow.large,
      accentBorder: 'border-l-violet-600 dark:border-l-violet-400',
      detail: `占总成交 ${flow.large.turnoverSharePct.toFixed(1)}% · 净占比 ${formatSigned(flow.large.netRatioPct, 2, '%')}`,
    },
    {
      id: 'retail',
      title: '散户资金',
      subtitle: '中单 + 小单 <20万',
      stats: flow.retail,
      accentBorder: 'border-l-amber-500 dark:border-l-amber-400',
      detail: `中单 ${formatSigned(flow.medium.netYi, 2, '亿')} · 小单 ${formatSigned(flow.small.netYi, 2, '亿')}`,
    },
  ];

  return (
    <section
      aria-label="实时分梯队资金动向"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      {/* Card Header + Scope Filter */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              实时资金动向 · 机构 / 主力 / 大户 / 散户
            </h2>
            <span
              data-testid="capital-flow-regime"
              className={`text-xs font-semibold ${regimeColor(flow.regime.id)}`}
            >
              {flow.regime.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            基于实时 L2 分档成交汇总（机构=特大单≥100万、大户=大单20~100万、主力=机构+大户、散户=中单+小单&lt;20万 · 单位：亿元）
          </p>
        </div>

        <div
          role="group"
          aria-label="切换资金动向统计板块"
          className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto max-w-full shrink-0"
        >
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setScope(opt.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                scope === opt.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* 4-Column Tier Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {tierCards.map((card) => {
            const totalIO = card.stats.inflowYi + card.stats.outflowYi;
            const inPct = totalIO > 0 ? Math.min(100, Math.max(0, (card.stats.inflowYi / totalIO) * 100)) : 50;
            return (
              <div
                key={card.id}
                data-testid={`capital-tier-${card.id}`}
                className={`rounded-lg border border-slate-200/90 dark:border-slate-800 border-l-[3px] ${card.accentBorder} bg-slate-50/50 dark:bg-slate-800/35 p-4`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {card.title}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 font-mono-num whitespace-nowrap shrink-0">
                    {card.subtitle}
                  </span>
                </div>

                <div className="mt-2 flex items-baseline gap-1.5">
                  <span
                    data-testid={`capital-net-${card.id}`}
                    className={`text-2xl font-bold font-mono-num ${flowColor(card.stats.netYi)}`}
                  >
                    {formatSigned(card.stats.netYi, 2)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">亿元</span>
                </div>

                {/* Inflow vs Outflow proportion bar */}
                <div className="mt-2.5 h-1.5 w-full rounded-full bg-emerald-500/75 dark:bg-emerald-500/65 overflow-hidden">
                  <div
                    className="h-full bg-red-600/85 dark:bg-red-500/85"
                    style={{ width: `${inPct}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] font-mono-num">
                  <span className="text-red-600 dark:text-red-400">
                    入 {card.stats.inflowYi.toFixed(2)}亿
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    出 {card.stats.outflowYi.toFixed(2)}亿
                  </span>
                </div>

                <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono-num truncate">
                  {card.detail}
                </div>
              </div>
            );
          })}
        </div>

        {/* Paired Charts: In/Out/Net Comparison + Sector/ETF Breakdown */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-6 rounded-lg border border-slate-100 dark:border-slate-800/90 p-4 bg-white dark:bg-slate-900/60">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                四类资金主动流入 / 流出与净额对比
              </h3>
              <span className="text-[11px] font-mono-num text-slate-400 dark:text-slate-500">
                覆盖 {flow.liveCount}/{flow.etfCount} 只ETF
              </span>
            </div>
            <EChartBox
              option={inOutChartOption}
              height={240}
              testId="capital-flow-in-out-chart"
              ariaLabel="机构主力大户散户资金流入流出对比图"
            />
          </div>

          <div className="xl:col-span-6 rounded-lg border border-slate-100 dark:border-slate-800/90 p-4 bg-white dark:bg-slate-900/60">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {scope === 'all'
                  ? '各宽基板块 机构 / 大户 / 散户净流向结构'
                  : `${SCOPE_OPTIONS.find((s) => s.id === scope)?.label ?? ''} 成分ETF 分梯队净流向`}
              </h3>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                蓝=机构 · 紫=大户 · 琥珀=散户
              </span>
            </div>
            <EChartBox
              option={structureChartOption}
              height={240}
              testId="capital-flow-breakdown-chart"
              ariaLabel="各宽基板块机构大户散户净流向结构图"
            />
          </div>
        </div>

        {/* Institutional Signal Footnote */}
        <div className="px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span>
            <strong className="text-slate-900 dark:text-slate-100">盘面资金结构研判：</strong>
            {flow.regime.summary}
          </span>
          <span className="font-mono-num text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
            分档总成交 {flow.totalTurnoverYi.toFixed(1)} 亿
          </span>
        </div>
      </div>
    </section>
  );
}
