import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Search,
} from 'lucide-react';
import type {
  EtfCategory,
  EtfLiveQuote,
  MarketOverviewResponse,
} from '../types/market';
import { formatSigned } from '../utils/indicators';
import { EChartBox } from './EChartBox';
import { CapitalFlowSection } from './CapitalFlowSection';

interface OverviewSectionProps {
  overview: MarketOverviewResponse;
  isDark: boolean;
  onSelectEtf: (etf: EtfLiveQuote) => void;
  onJumpToIndex: (indexCode: string) => void;
  onJumpToRatio: () => void;
  onExportCsv: () => void;
}

type SortKey =
  | 'turnoverYi'
  | 'mainNetInflowYi'
  | 'changePct'
  | 'volumeRatio'
  | 'nationalTeamValueYi'
  | 'aumYi';

const CATEGORY_TABS: Array<{ id: 'all' | EtfCategory; label: string }> = [
  { id: 'all', label: '全部宽基' },
  { id: 'hs300', label: '沪深300' },
  { id: 'star', label: '科创板' },
  { id: 'dividend', label: '红利价值' },
  { id: 'broad_large', label: '大盘核心' },
  { id: 'mid_small', label: '中小盘' },
  { id: 'a500', label: '中证A500' },
];

export function OverviewSection({
  overview,
  isDark,
  onSelectEtf,
  onJumpToIndex,
  onJumpToRatio,
  onExportCsv,
}: OverviewSectionProps) {
  const [category, setCategory] = useState<'all' | EtfCategory>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('turnoverYi');
  const [sortDesc, setSortDesc] = useState(true);

  const { summary, etfs, indices } = overview;

  const filteredEtfs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return etfs
      .filter((item) => {
        if (category !== 'all' && item.category !== category) return false;
        if (!q) return true;
        return (
          item.code.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.benchmark.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const diff = a[sortKey] - b[sortKey];
        return sortDesc ? -diff : diff;
      });
  }, [etfs, category, search, sortKey, sortDesc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const categoryFlowOption: EChartsOption = useMemo(() => {
    const groups: Array<{ id: EtfCategory; label: string }> = [
      { id: 'hs300', label: '沪深300' },
      { id: 'broad_large', label: '大盘核心' },
      { id: 'star', label: '科创板' },
      { id: 'dividend', label: '红利价值' },
      { id: 'mid_small', label: '中小盘' },
      { id: 'a500', label: '中证A500' },
    ];
    const rows = groups.map((g) => {
      const matched = etfs.filter((e) => e.category === g.id);
      const netFlow = Number(
        matched.reduce((acc, e) => acc + e.mainNetInflowYi, 0).toFixed(2)
      );
      const turnover = Number(
        matched.reduce((acc, e) => acc + e.turnoverYi, 0).toFixed(2)
      );
      return { label: g.label, netFlow, turnover };
    });

    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)';
    const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
    const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
    const tooltipText = isDark ? '#F1F5F9' : '#0F172A';

    return {
      animationDuration: 300,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
      },
      grid: { left: 50, right: 18, top: 28, bottom: 26 },
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
          name: '主力净流入(亿)',
          type: 'bar',
          barMaxWidth: 32,
          data: rows.map((r) => ({
            value: r.netFlow,
            itemStyle: {
              color: r.netFlow >= 0 ? '#DC2626' : '#059669',
              borderRadius: r.netFlow >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
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
  }, [etfs, isDark]);

  const topTurnoverOption: EChartsOption = useMemo(() => {
    const top = [...etfs].sort((a, b) => b.turnoverYi - a.turnoverYi).slice(0, 8).reverse();
    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)';
    const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
    const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
    const tooltipText = isDark ? '#F1F5F9' : '#0F172A';

    return {
      animationDuration: 300,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
      },
      grid: { left: 96, right: 44, top: 14, bottom: 24 },
      xAxis: {
        type: 'value',
        name: '亿',
        nameTextStyle: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
      },
      yAxis: {
        type: 'category',
        data: top.map((e) => e.shortName),
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: isDark ? '#E2E8F0' : '#1E293B', fontSize: 11 },
      },
      series: [
        {
          name: '今日成交额(亿)',
          type: 'bar',
          barMaxWidth: 16,
          data: top.map((e) => ({
            value: e.turnoverYi,
            itemStyle: {
              color:
                e.volumeRatio >= 1.8
                  ? '#D97706'
                  : isDark
                    ? 'rgba(59, 130, 246, 0.8)'
                    : 'rgba(29, 78, 216, 0.78)',
              borderRadius: [0, 3, 3, 0],
            },
          })),
          label: {
            show: true,
            position: 'right',
            color: axisColor,
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            formatter: '{c}亿',
          },
        },
      ],
    };
  }, [etfs, isDark]);

  const highlightIndices = useMemo(
    () =>
      indices.filter((i) =>
        ['000680', '000922', '000688', '000300', '000001', '399006'].includes(i.code)
      ),
    [indices]
  );

  const flowColor = (v: number) =>
    v > 0
      ? 'text-red-600 dark:text-red-400'
      : v < 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-600 dark:text-slate-400';

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 inline ml-1" aria-hidden="true" />;
    }
    return sortDesc ? (
      <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 inline ml-1" aria-hidden="true" />
    ) : (
      <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 inline ml-1" aria-hidden="true" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Top 4-Column Institutional KPI Strip */}
      <section aria-label="核心资金与国家队概览指标">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">20只重点ETF今日成交额</span>
              <span className="font-mono-num whitespace-nowrap shrink-0">
                量比 {summary.s1AnomalyRatio.toFixed(2)}x
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-50">
                {summary.totalEtfTurnoverYi.toFixed(2)}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">亿元</span>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate">
              {summary.s1AnomalyRatio >= 1.8
                ? '放量异常 S1：高于近期同时段均值 1.8 倍以上'
                : '沪深300 / 科创50 / 红利等 20 只宽基合计'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">20只ETF主力净流入</span>
              <span className="font-mono-num whitespace-nowrap shrink-0">
                300系 {formatSigned(summary.hs300NetInflowYi, 2, '亿')}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold font-mono-num ${flowColor(summary.totalMainNetInflowYi)}`}
              >
                {formatSigned(summary.totalMainNetInflowYi, 2)}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">亿元</span>
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 truncate">
              {summary.supportSignalText}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">国家队持仓估算市值</span>
              <span className="font-mono-num whitespace-nowrap shrink-0">汇金·国新·社保</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-50">
                {summary.nationalTeamTotalValueYi.toLocaleString('zh-CN', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">亿元</span>
            </div>
            <p className={`mt-2 text-xs font-mono-num truncate ${flowColor(summary.nationalTeamDailyPnlYi)}`}>
              今日持仓浮动盈亏 {formatSigned(summary.nationalTeamDailyPnlYi, 2, ' 亿元')}
            </p>
          </div>

          <button
            type="button"
            onClick={onJumpToRatio}
            className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 rounded-xl p-5 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">创业板指 / 中证红利 牛熊比值</span>
              <span className="font-mono-num whitespace-nowrap shrink-0 text-blue-600 dark:text-blue-400">
                {summary.starVsDividendSpreadPct >= 0 ? '成长占优' : '红利占优'} →
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-50">
                {summary.starDividendRatio > 0 ? summary.starDividendRatio.toFixed(4) : '--'}
              </span>
              <span
                className={`text-xs font-mono-num font-medium ${flowColor(summary.starVsDividendSpreadPct)}`}
              >
                差 {formatSigned(summary.starVsDividendSpreadPct, 2, '%')}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono-num truncate">
              科创ETF {formatSigned(summary.starEtfNetInflowYi, 2, '亿')} · 红利ETF{' '}
              {formatSigned(summary.dividendEtfNetInflowYi, 2, '亿')}
            </p>
          </button>
        </div>
      </section>

      {/* Key Indices Quick Strip (Clickable into Index Trend Lab) */}
      <section aria-label="重点指数实时行情">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <span>重点跟踪指数实时脉搏</span>
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                · 点击沪深300查看股债利差，点击创业板指/中证红利查看牛熊比值
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
            {highlightIndices.map((idx) => (
              <button
                key={idx.code}
                type="button"
                onClick={() => onJumpToIndex(idx.code)}
                className="p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
              >
                <div className="flex items-center justify-between gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {idx.name}
                  </span>
                  <span className="font-mono-num shrink-0">{idx.code}</span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-base font-bold font-mono-num text-slate-900 dark:text-slate-50">
                    {idx.price.toFixed(2)}
                  </span>
                  <span className={`text-xs font-semibold font-mono-num ${flowColor(idx.changePct)}`}>
                    {formatSigned(idx.changePct, 2, '%')}
                  </span>
                </div>
                <div className="mt-1 text-[11px] font-mono-num text-slate-500 dark:text-slate-400 truncate">
                  {idx.mainNetInflowYi !== 0 ? (
                    <>
                      主力{' '}
                      <span className={flowColor(idx.mainNetInflowYi)}>
                        {formatSigned(idx.mainNetInflowYi, 1, '亿')}
                      </span>
                    </>
                  ) : (
                    <>成交 {idx.turnoverYi.toFixed(0)}亿</>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Real-Time Multi-Tier Capital Flow: Institution / Main Force / Large / Retail */}
      <CapitalFlowSection etfs={etfs} isDark={isDark} />

      {/* Instant Snapshot Distribution: Category Net Flows & Top Turnover ETFs */}
      <section
        aria-label="今日宽基分类资金流向与成交分布"
        className="grid grid-cols-1 xl:grid-cols-12 gap-5"
      >
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              今日宽基分类主力净流入分布
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              按沪深300、科创板、红利价值等 6 大宽基板块实时汇总（亿元 · 红入绿出）
            </p>
          </div>
          <div className="mt-4">
            <EChartBox
              option={categoryFlowOption}
              height={250}
              testId="category-flow-chart"
              ariaLabel="今日宽基分类主力净流入柱状图"
            />
          </div>
        </div>

        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              重点宽基ETF成交额 Top 8 排行
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              实时成交额对比（亿元）· 琥珀柱标示量比 ≥ 1.8x 放量异动标的
            </p>
          </div>
          <div className="mt-4">
            <EChartBox
              option={topTurnoverOption}
              height={250}
              testId="top-turnover-chart"
              ariaLabel="重点宽基ETF实时成交额前8排行图"
            />
          </div>
        </div>
      </section>

      {/* 20 Core ETF Live Table */}
      <section
        aria-label="20只重点ETF实时资金表现表"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              20只国家队与重点宽基ETF实时资金明细
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              点击任意行查看 60 日 K 线与 30 日主力净流入历史 · 红涨绿跌（A股标准口径）
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="筛选代码、名称或跟踪指数..."
                aria-label="筛选ETF代码或名称"
                className="w-56 pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
              />
            </div>

            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              导出 CSV
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="px-5 py-2.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1 overflow-x-auto">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                category === tab.id
                  ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/40 dark:bg-slate-900/60">
                <th className="py-3 pl-5 pr-3 whitespace-nowrap">代码 / 名称</th>
                <th className="py-3 px-3 whitespace-nowrap">类别 · 跟踪指数</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">最新价</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('changePct')}
                    className="hover:text-slate-900 dark:hover:text-slate-100 font-medium whitespace-nowrap"
                  >
                    涨跌幅{renderSortIcon('changePct')}
                  </button>
                </th>
                <th className="py-3 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('turnoverYi')}
                    className="hover:text-slate-900 dark:hover:text-slate-100 font-medium whitespace-nowrap"
                  >
                    成交额(亿){renderSortIcon('turnoverYi')}
                  </button>
                </th>
                <th className="py-3 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('mainNetInflowYi')}
                    className="hover:text-slate-900 dark:hover:text-slate-100 font-medium whitespace-nowrap"
                  >
                    主力净流入(亿){renderSortIcon('mainNetInflowYi')}
                  </button>
                </th>
                <th className="py-3 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('volumeRatio')}
                    className="hover:text-slate-900 dark:hover:text-slate-100 font-medium whitespace-nowrap"
                  >
                    量比{renderSortIcon('volumeRatio')}
                  </button>
                </th>
                <th className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('nationalTeamValueYi')}
                    className="hover:text-slate-900 dark:hover:text-slate-100 font-medium whitespace-nowrap"
                  >
                    国家队持仓估(亿){renderSortIcon('nationalTeamValueYi')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {filteredEtfs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    未找到匹配的 ETF，请调整筛选条件。
                  </td>
                </tr>
              ) : (
                filteredEtfs.map((etf) => (
                  <tr
                    key={etf.code}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-2.5 pl-5 pr-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectEtf(etf)}
                        className="text-left group focus-visible:outline-none focus-visible:underline"
                      >
                        <div className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {etf.name}
                        </div>
                        <div className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                          {etf.thscode}
                          {etf.nationalTeamFocus ? ' · 汇金核心' : ''}
                        </div>
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {etf.categoryLabel} · {etf.benchmark}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {etf.price.toFixed(3)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono-num font-medium whitespace-nowrap ${flowColor(etf.changePct)}`}
                    >
                      {formatSigned(etf.changePct, 2, '%')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {etf.turnoverYi.toFixed(2)}
                      <span className="ml-1.5 text-[11px] text-slate-400">
                        {etf.turnoverSharePct.toFixed(1)}%
                      </span>
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono-num font-semibold whitespace-nowrap ${flowColor(etf.mainNetInflowYi)}`}
                    >
                      {formatSigned(etf.mainNetInflowYi, 2)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono-num whitespace-nowrap ${
                        etf.volumeRatio >= 1.8
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {etf.volumeRatio.toFixed(2)}x
                    </td>
                    <td className="py-2.5 pl-3 pr-5 text-right font-mono-num text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {etf.nationalTeamValueYi.toFixed(1)}
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
