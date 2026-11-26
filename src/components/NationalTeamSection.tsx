import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { NATIONAL_TEAM_ENTITIES, NATIONAL_TEAM_HOLDINGS } from '../data/etfCatalog';
import type { EtfLiveQuote, NationalTeamEntityId } from '../types/market';
import { computeNationalTeamValuation, formatSigned } from '../utils/indicators';
import { EChartBox } from './EChartBox';

interface NationalTeamSectionProps {
  etfs: EtfLiveQuote[];
  isDark: boolean;
  onSelectEtf: (etf: EtfLiveQuote) => void;
}

export function NationalTeamSection({
  etfs,
  isDark,
  onSelectEtf,
}: NationalTeamSectionProps) {
  const [selectedEntity, setSelectedEntity] = useState<'all' | NationalTeamEntityId>('all');

  const quoteMap = useMemo(() => new Map(etfs.map((e) => [e.code, e])), [etfs]);
  const valuation = useMemo(
    () => computeNationalTeamValuation(NATIONAL_TEAM_HOLDINGS, etfs),
    [etfs]
  );

  const entityRows = useMemo(() => {
    return NATIONAL_TEAM_ENTITIES.map((ent) => {
      const stats = valuation.byEntity[ent.id];
      return {
        ...ent,
        ...stats,
      };
    }).sort((a, b) => b.valueYi - a.valueYi);
  }, [valuation]);

  const filteredHoldings = useMemo(() => {
    return NATIONAL_TEAM_HOLDINGS.filter(
      (h) => selectedEntity === 'all' || h.entityId === selectedEntity
    )
      .map((h) => {
        const q = quoteMap.get(h.etfCode);
        const price = q?.price ?? 0;
        const prevClose = q?.prevClose ?? price;
        const liveValueYi = h.sharesYi * price;
        const dailyPnlYi = h.sharesYi * (price - prevClose);
        const entity = NATIONAL_TEAM_ENTITIES.find((e) => e.id === h.entityId);
        return {
          ...h,
          entityShortName: entity?.shortName ?? h.entityId,
          price,
          changePct: q?.changePct ?? 0,
          liveValueYi,
          dailyPnlYi,
          etfTodayFlowYi: q?.mainNetInflowYi ?? 0,
          quote: q,
        };
      })
      .sort((a, b) => b.liveValueYi - a.liveValueYi);
  }, [selectedEntity, quoteMap]);

  const barOption: EChartsOption = useMemo(() => {
    const axisColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)';
    const sorted = [...entityRows].reverse();

    return {
      animationDuration: 350,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const first = arr[0] as { name?: string; value?: number };
          return `${first.name}<br/>实时持仓估值：<b>${Number(first.value || 0).toFixed(1)} 亿元</b>`;
        },
      },
      grid: { left: 108, right: 42, top: 16, bottom: 24 },
      xAxis: {
        type: 'value',
        name: '亿元',
        nameTextStyle: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      },
      yAxis: {
        type: 'category',
        data: sorted.map((e) => e.shortName),
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: isDark ? '#E2E8F0' : '#1E293B', fontSize: 12 },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 22,
          data: sorted.map((e, i) => ({
            value: e.valueYi,
            itemStyle: {
              color:
                i === sorted.length - 1
                  ? '#1D4ED8'
                  : i === sorted.length - 2
                    ? '#2563EB'
                    : isDark
                      ? '#475569'
                      : '#64748B',
              borderRadius: [0, 4, 4, 0],
            },
          })),
          label: {
            show: true,
            position: 'right',
            color: axisColor,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            formatter: '{c} 亿',
          },
        },
      ],
    };
  }, [entityRows, isDark]);

  const colorClass = (v: number) =>
    v > 0
      ? 'text-red-600 dark:text-red-400'
      : v < 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-600 dark:text-slate-400';

  return (
    <div className="space-y-6">
      {/* Top Valuation Summary & Entity Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              国家队核心主体 ETF 实时估算总持仓
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono-num text-slate-900 dark:text-slate-50">
                {valuation.totalValueYi.toLocaleString('zh-CN', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">亿元</span>
            </div>
            <div className={`mt-1.5 text-sm font-mono-num font-semibold ${colorClass(valuation.totalDailyPnlYi)}`}>
              今日实时浮盈亏 {formatSigned(valuation.totalDailyPnlYi, 2, ' 亿元')}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              估算口径：基于基金中报/年报前十大持有人公开披露的国家队持有份额，乘以当前场内 ETF 实时成交价动态重估（不含盘中未披露新增申购）。
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            {entityRows.map((ent) => (
              <div key={ent.id} className="flex items-center justify-between text-xs gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {ent.shortName}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 ml-1.5">
                    占比 {ent.weightPct.toFixed(1)}%
                  </span>
                </div>
                <div className="font-mono-num shrink-0 flex items-center gap-3">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {ent.valueYi.toFixed(1)} 亿
                  </span>
                  <span className={`w-16 text-right ${colorClass(ent.dailyPnlYi)}`}>
                    {formatSigned(ent.dailyPnlYi, 1)}亿
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              国家队各主体 ETF 持仓市值结构
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              中央汇金投资 + 汇金资产构成绝对核心压舱石，国新与社保侧重科技与红利底仓
            </p>
          </div>
          <div className="mt-4">
            <EChartBox
              option={barOption}
              height={265}
              testId="national-team-chart"
              ariaLabel="国家队各主体ETF持仓市值柱状图"
            />
          </div>
        </div>
      </div>

      {/* Holdings Position Table */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              国家队重仓 ETF 持仓矩阵与实时盯市估值
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              按实时持仓市值降序排列 · 点击标的查看历史 K 线与资金流向
            </p>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedEntity('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedEntity === 'all'
                  ? 'bg-slate-900 text-white dark:bg-blue-600'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              全部主体
            </button>
            {NATIONAL_TEAM_ENTITIES.map((ent) => (
              <button
                key={ent.id}
                type="button"
                onClick={() => setSelectedEntity(ent.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedEntity === ent.id
                    ? 'bg-slate-900 text-white dark:bg-blue-600'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {ent.shortName}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/40 dark:bg-slate-900/60">
                <th className="py-3 pl-5 pr-3 whitespace-nowrap">持有主体</th>
                <th className="py-3 px-3 whitespace-nowrap">重仓 ETF</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">披露份额(亿份)</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">占总份额比</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">实时市价</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">实时市值(亿)</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">今日浮盈亏(亿)</th>
                <th className="py-3 pl-3 pr-5 text-right whitespace-nowrap">标的今日主力流(亿)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {filteredHoldings.map((row) => (
                <tr
                  key={`${row.entityId}-${row.etfCode}`}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="py-2.5 pl-5 pr-3 whitespace-nowrap">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {row.entityShortName}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{row.changeNote}</div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {row.quote ? (
                      <button
                        type="button"
                        onClick={() => onSelectEtf(row.quote!)}
                        className="text-left group focus-visible:underline"
                      >
                        <div className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {row.etfName}
                        </div>
                        <div className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                          {row.etfCode}
                        </div>
                      </button>
                    ) : (
                      <span>{row.etfName}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-num text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {row.sharesYi.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-num text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {row.shareRatioPct.toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-num whitespace-nowrap">
                    <span className="text-slate-900 dark:text-slate-100">{row.price.toFixed(3)}</span>
                    <span className={`ml-1.5 text-xs ${colorClass(row.changePct)}`}>
                      {formatSigned(row.changePct, 2, '%')}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-50 whitespace-nowrap">
                    {row.liveValueYi.toFixed(1)}
                  </td>
                  <td className={`py-2.5 px-3 text-right font-mono-num font-medium whitespace-nowrap ${colorClass(row.dailyPnlYi)}`}>
                    {formatSigned(row.dailyPnlYi, 2)}
                  </td>
                  <td className={`py-2.5 pl-3 pr-5 text-right font-mono-num whitespace-nowrap ${colorClass(row.etfTodayFlowYi)}`}>
                    {formatSigned(row.etfTodayFlowYi, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
