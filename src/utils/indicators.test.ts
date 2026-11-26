import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCapitalFlowTiers,
  buildEtfTieredFlow,
  classifyBullBearRegime,
  classifyCapitalFlowRegime,
  classifyEquityBondZone,
  classifyTrend,
  computeEquityBondSpreadAnalytics,
  computeNationalTeamValuation,
  computeRelativeSpread,
  computeRSI,
  computeS1AnomalyRatio,
  computeSMA,
  computeStarDividendRatioSeries,
  evaluateSupportSignal,
} from './indicators';
import { evaluateAlertRules } from './alerts';
import type {
  AlertRule,
  DailyKlinePoint,
  EtfLiveQuote,
  MarketOverviewResponse,
  NationalTeamHoldingRecord,
} from '../types/market';

test('computeSMA returns trailing average and null when insufficient data', () => {
  assert.equal(computeSMA([1, 2, 3], 5), null);
  assert.equal(computeSMA([10, 20, 30, 40, 50], 5), 30);
  assert.equal(computeSMA([1, 2, 3, 4, 5, 6], 3), 5);
});

test('computeRSI stays within 0-100 and identifies strong uptrend vs downtrend', () => {
  const uptrend = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
  const downtrend = Array.from({ length: 20 }, (_, i) => 150 - i * 2);
  assert.equal(computeRSI(uptrend, 14), 100);
  assert.equal(computeRSI(downtrend, 14), 0);
  assert.equal(computeRSI([1, 2, 3], 14), null);
});

test('classifyTrend accurately separates bullish, bearish, and sideways regimes', () => {
  assert.equal(classifyTrend(110, 108, 102, 95).status, 'bullish');
  assert.equal(classifyTrend(90, 92, 98, 105).status, 'bearish');
  assert.equal(classifyTrend(100, 99, 101, 98).status, 'sideways');
});

test('computeRelativeSpread aligns dates and computes STAR50 minus Dividend spread', () => {
  const makePt = (date: string, close: number): DailyKlinePoint => ({
    date,
    open: close,
    close,
    high: close,
    low: close,
    volume: 100,
    turnoverYi: 10,
    changePct: 0,
  });
  const star = [makePt('2026-11-01', 1000), makePt('2026-11-02', 1050)];
  const div = [makePt('2026-11-01', 5000), makePt('2026-11-02', 5100)];
  const res = computeRelativeSpread(star, div);
  assert.deepEqual(res.dates, ['2026-11-01', '2026-11-02']);
  assert.deepEqual(res.normA, [0, 5]);
  assert.deepEqual(res.normB, [0, 2]);
  assert.deepEqual(res.spread, [0, 3]);
});

test('computeNationalTeamValuation computes mark-to-market value and daily PnL', () => {
  const holdings: NationalTeamHoldingRecord[] = [
    {
      entityId: 'huijin_inv',
      etfCode: '510300',
      etfName: '沪深300ETF华泰柏瑞',
      sharesYi: 100,
      shareRatioPct: 35,
      reportPeriod: '2026中报',
      changeNote: '核心持仓',
    },
    {
      entityId: 'guoxin',
      etfCode: '510880',
      etfName: '红利ETF',
      sharesYi: 50,
      shareRatioPct: 12,
      reportPeriod: '2026中报',
      changeNote: '增持',
    },
  ];
  const quotes: EtfLiveQuote[] = [
    {
      code: '510300',
      thscode: '510300.SH',
      name: '沪深300ETF华泰柏瑞',
      shortName: '沪深300ETF',
      category: 'hs300',
      categoryLabel: '沪深300',
      benchmark: '沪深300',
      price: 4.1,
      prevClose: 4.0,
      changePct: 2.5,
      turnoverYi: 45,
      volumeWanShou: 1000,
      aumYi: 2200,
      mainNetInflowYi: 8.5,
      mainNetInflowRatioPct: 18.8,
      volumeRatio: 1.5,
      turnoverSharePct: 30,
      nationalTeamFocus: true,
      nationalTeamSharesYi: 100,
      nationalTeamValueYi: 410,
      nationalTeamDailyPnlYi: 10,
      primaryHolder: 'huijin_inv',
      tieredFlow: buildEtfTieredFlow({
        r0InYuan: 6e8,
        r0OutYuan: 2e8,
        r1InYuan: 4e8,
        r1OutYuan: 2e8,
        r2InYuan: 1e8,
        r2OutYuan: 1.5e8,
        r3InYuan: 0.5e8,
        r3OutYuan: 1e8,
      }),
      updatedAt: '2026-11-26 10:00:00',
    },
    {
      code: '510880',
      thscode: '510880.SH',
      name: '红利ETF',
      shortName: '红利ETF',
      category: 'dividend',
      categoryLabel: '红利价值',
      benchmark: '上证红利',
      price: 3.0,
      prevClose: 3.1,
      changePct: -3.23,
      turnoverYi: 8,
      volumeWanShou: 250,
      aumYi: 180,
      mainNetInflowYi: -1.2,
      mainNetInflowRatioPct: -15,
      volumeRatio: 1.1,
      turnoverSharePct: 5,
      nationalTeamFocus: true,
      nationalTeamSharesYi: 50,
      nationalTeamValueYi: 150,
      nationalTeamDailyPnlYi: -5,
      primaryHolder: 'guoxin',
      tieredFlow: buildEtfTieredFlow({
        r0InYuan: 1e8,
        r0OutYuan: 2e8,
        r1InYuan: 0.8e8,
        r1OutYuan: 1e8,
        r2InYuan: 0.5e8,
        r2OutYuan: 0.3e8,
        r3InYuan: 0.4e8,
        r3OutYuan: 0.2e8,
      }),
      updatedAt: '2026-11-26 10:00:00',
    },
  ];
  const result = computeNationalTeamValuation(holdings, quotes);
  assert.equal(result.totalValueYi, 560);
  assert.equal(result.totalDailyPnlYi, 5);
  assert.equal(result.byEntity.huijin_inv.valueYi, 410);
  assert.equal(result.byEntity.guoxin.dailyPnlYi, -5);
});

test('evaluateSupportSignal and computeS1AnomalyRatio flag institutional support correctly', () => {
  assert.equal(computeS1AnomalyRatio(360, 180), 2);
  assert.equal(evaluateSupportSignal(42, 300, 200, -0.5).isSupportDay, true);
  assert.equal(evaluateSupportSignal(5, 190, 200, 0.8).isSupportDay, false);
});

test('evaluateAlertRules triggers matching rules and respects cooldown', () => {
  const overview: MarketOverviewResponse = {
    source: {
      provider: 'public_live',
      providerLabel: '公开实时行情',
      hithinkConfigured: false,
      hithinkEndpoint: 'https://fuyao.aicubes.cn',
      fetchedAt: '2026-11-26T02:00:00Z',
      tradingDate: '2026-11-26',
      marketStatus: 'trading',
      marketStatusLabel: '盘中交易',
    },
    etfs: [],
    indices: [
      {
        code: '000688',
        thscode: '000688.SH',
        name: '科创50',
        group: 'star',
        description: '',
        price: 1170,
        prevClose: 1190,
        changePct: -1.68,
        turnoverYi: 120,
        mainNetInflowYi: -5.2,
        mainNetInflowRatioPct: -4.3,
        updatedAt: '10:00:00',
      },
    ],
    summary: {
      totalEtfTurnoverYi: 180,
      totalMainNetInflowYi: 24.5,
      hs300NetInflowYi: 18.2,
      starEtfNetInflowYi: -2.1,
      dividendEtfNetInflowYi: 3.4,
      nationalTeamTotalValueYi: 9800,
      nationalTeamDailyPnlYi: 45,
      s1AnomalyRatio: 1.95,
      supportSignalActive: true,
      supportSignalLevel: 'moderate',
      supportSignalText: '宽基主力净流入偏强',
      starVsDividendSpreadPct: -2.4,
      starDividendRatio: 0.258,
    },
    capitalFlow: aggregateCapitalFlowTiers([], 'all'),
  };

  const rules: AlertRule[] = [
    {
      id: 'r1',
      name: '主力流入超20亿',
      metric: 'total_net_inflow',
      operator: 'gt',
      threshold: 20,
      unit: '亿元',
      enabled: true,
      cooldownMinutes: 15,
    },
    {
      id: 'r2',
      name: '科创50跌超1.5%',
      metric: 'index_change_pct',
      targetCode: '000688',
      targetName: '科创50',
      operator: 'lt',
      threshold: -1.5,
      unit: '%',
      enabled: true,
      cooldownMinutes: 10,
    },
  ];

  const t0 = 1_700_000_000_000;
  const firstRun = evaluateAlertRules(rules, overview, t0);
  assert.equal(firstRun.triggered.length, 2);

  // Within cooldown (5 min later): should not fire again
  const secondRun = evaluateAlertRules(firstRun.updatedRules, overview, t0 + 5 * 60 * 1000);
  assert.equal(secondRun.triggered.length, 0);

  // After cooldown (20 min later): should fire again
  const thirdRun = evaluateAlertRules(firstRun.updatedRules, overview, t0 + 20 * 60 * 1000);
  assert.equal(thirdRun.triggered.length, 2);

  // Bull/bear ratio alert triggers with 4-decimal precision
  const ratioRule: AlertRule[] = [
    {
      id: 'r-ratio',
      name: '牛熊比值突破0.25',
      metric: 'star_dividend_ratio',
      operator: 'gt',
      threshold: 0.25,
      unit: '',
      enabled: true,
      cooldownMinutes: 15,
    },
  ];
  const ratioRun = evaluateAlertRules(ratioRule, overview, t0);
  assert.equal(ratioRun.triggered.length, 1);
  assert.equal(ratioRun.triggered[0].actualValue, 0.258);
});

test('computeStarDividendRatioSeries and classifyBullBearRegime identify bull vs bear regimes accurately', () => {
  const makeSeries = (values: number[]): DailyKlinePoint[] =>
    values.map((v, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: v,
      close: v,
      high: v,
      low: v,
      volume: 1000,
      turnoverYi: 50,
      changePct: 0,
    }));

  // 70-day rising STAR vs flat Dividend => strong bull regime
  const bullStar = makeSeries(Array.from({ length: 70 }, (_, i) => 900 + i * 8));
  const flatDiv = makeSeries(Array.from({ length: 70 }, () => 5000));
  const flatSse = makeSeries(Array.from({ length: 70 }, (_, i) => 3100 + i * 5));

  const bullResult = computeStarDividendRatioSeries(bullStar, flatDiv, flatSse, {
    numeratorCode: '399006',
    numeratorName: '创业板指',
    denominatorCode: '000922',
    denominatorName: '中证红利',
  });

  assert.equal(bullResult.points.length, 70);
  assert.equal(bullResult.latestRatio, Number(((900 + 69 * 8) / 5000).toFixed(4)));
  assert.equal(bullResult.percentilePct, 100);
  assert.ok(bullResult.ma20 !== null && bullResult.ma60 !== null);
  assert.ok(bullResult.latestRatio > bullResult.ma20! && bullResult.ma20! > bullResult.ma60!);
  assert.equal(bullResult.signal.regime, 'bull_strong');
  assert.ok(bullResult.signal.score >= 72);

  // 70-day falling STAR vs rising Dividend => deep defensive bear regime
  const bearStar = makeSeries(Array.from({ length: 70 }, (_, i) => 1300 - i * 7));
  const risingDiv = makeSeries(Array.from({ length: 70 }, (_, i) => 4800 + i * 10));

  const bearResult = computeStarDividendRatioSeries(bearStar, risingDiv, flatSse, {
    numeratorCode: '399006',
    numeratorName: '创业板指',
    denominatorCode: '000922',
    denominatorName: '中证红利',
  });

  assert.equal(bearResult.signal.regime, 'bear_deep');
  assert.ok(bearResult.signal.score <= 28);
  assert.ok((bearResult.deviationFromMa60Pct ?? 0) < 0);

  // Direct regime classifier sanity check for neutral transition
  const neutral = classifyBullBearRegime({
    latestRatio: 0.21,
    ma20: 0.21,
    ma60: 0.21,
    change20dPct: 0.1,
    percentilePct: 50,
  });
  assert.equal(neutral.regime, 'transition');
});

test('computeEquityBondSpreadAnalytics and classifyEquityBondZone compute ERP, ratio, nearest-prior bond alignment, and multi-window percentiles', () => {
  // Exact date match + weekend/holiday prior bond match (within 10 days) + stale bond skipped (>10 days)
  const indexRows = [
    { date: '2020-01-02', close: 4100, pe: 12.5 }, // E/P = 8.00%, bond = 3.10% -> spread = 4.90%, ratio = 2.58
    { date: '2022-01-04', close: 4900, pe: 14.0 }, // E/P = 7.14%, bond = 2.80% -> spread = 4.34%, ratio = 2.55
    { date: '2024-01-03', close: 3400, pe: 11.0 }, // E/P = 9.09%, bond = 2.55% -> spread = 6.54%, ratio = 3.56
    { date: '2026-01-05', close: 3900, pe: 12.0 }, // E/P = 8.33%, bond = 1.65% -> spread = 6.68%, ratio = 5.05
    { date: '2026-11-25', close: 4050, pe: 12.5 }, // E/P = 8.00%, uses prior bond 2026-11-23 (1.60%) -> spread = 6.40%, ratio = 5.00
  ];
  const bondRows = [
    { date: '2020-01-02', yield10y: 3.1 },
    { date: '2022-01-04', yield10y: 2.8 },
    { date: '2024-01-03', yield10y: 2.55 },
    { date: '2026-01-05', yield10y: 1.65 },
    { date: '2026-11-23', yield10y: 1.6 },
  ];

  const res = computeEquityBondSpreadAnalytics(indexRows, bondRows);
  assert.equal(res.points.length, 5);
  assert.equal(res.latestDate, '2026-11-25');
  assert.equal(res.latestEarningsYieldPct, 8);
  assert.equal(res.latestBondYield10yPct, 1.6);
  assert.equal(res.latestSpreadPct, 6.4);
  assert.equal(res.latestRatio, 5);
  assert.equal(res.spreadChange1dBp, -28); // 6.40 - 6.68 = -0.28% = -28bp
  assert.equal(res.historyStartDate, '2020-01-02');

  // Verify 4 windows exist: all, 5y, 3y, 1y
  assert.deepEqual(
    res.percentiles.map((p) => p.id),
    ['all', '5y', '3y', '1y']
  );
  const allWin = res.percentiles.find((p) => p.id === 'all')!;
  const oneYearWin = res.percentiles.find((p) => p.id === '1y')!;
  assert.equal(allWin.sampleDays, 5);
  // 6.40 is >= [4.90, 4.34, 6.40] => 3/5 = 60%
  assert.equal(allWin.spreadPercentilePct, 60);
  // 1y window includes 2026-01-05 (6.68) and 2026-11-25 (6.40) => 1/2 = 50%
  assert.equal(oneYearWin.sampleDays, 2);
  assert.equal(oneYearWin.spreadPercentilePct, 50);

  // Direct zone classification boundaries
  assert.equal(classifyEquityBondZone(85).zone, 'very_attractive');
  assert.equal(classifyEquityBondZone(65).zone, 'attractive');
  assert.equal(classifyEquityBondZone(50).zone, 'neutral');
  assert.equal(classifyEquityBondZone(25).zone, 'cautious');
  assert.equal(classifyEquityBondZone(10).zone, 'expensive');
});

test('buildEtfTieredFlow, aggregateCapitalFlowTiers, and classifyCapitalFlowRegime accurately compute 4-tier flows', () => {
  const f1 = buildEtfTieredFlow({
    r0InYuan: 10e8, // 10亿
    r0OutYuan: 6e8, // 6亿 => 机构净 +4亿
    r1InYuan: 5e8,
    r1OutYuan: 3e8, // 大户净 +2亿 => 主力净 +6亿
    r2InYuan: 2e8,
    r2OutYuan: 2.5e8, // 中单净 -0.5亿
    r3InYuan: 1e8,
    r3OutYuan: 1.5e8, // 小单净 -0.5亿 => 散户净 -1.0亿
  });
  assert.equal(f1.institution.netYi, 4);
  assert.equal(f1.large.netYi, 2);
  assert.equal(f1.main.netYi, 6);
  assert.equal(f1.medium.netYi, -0.5);
  assert.equal(f1.small.netYi, -0.5);
  assert.equal(f1.retail.netYi, -1);
  assert.equal(f1.totalTurnoverYi, 31);

  const mockEtfs: EtfLiveQuote[] = [
    {
      code: '510300',
      thscode: '510300.SH',
      name: '沪深300ETF',
      shortName: '沪深300ETF',
      category: 'hs300',
      categoryLabel: '沪深300',
      benchmark: '沪深300',
      price: 4,
      prevClose: 4,
      changePct: 0,
      turnoverYi: 31,
      volumeWanShou: 100,
      aumYi: 2000,
      mainNetInflowYi: 6,
      mainNetInflowRatioPct: 19.35,
      volumeRatio: 1.2,
      turnoverSharePct: 100,
      nationalTeamFocus: true,
      nationalTeamSharesYi: 100,
      nationalTeamValueYi: 400,
      nationalTeamDailyPnlYi: 0,
      primaryHolder: 'huijin_inv',
      tieredFlow: f1,
      updatedAt: '2026-11-26 11:00:00',
    },
  ];

  const allAgg = aggregateCapitalFlowTiers(mockEtfs, 'all');
  assert.equal(allAgg.main.netYi, 6);
  assert.equal(allAgg.institution.netYi, 4);
  assert.equal(allAgg.large.netYi, 2);
  assert.equal(allAgg.retail.netYi, -1);
  assert.equal(allAgg.regime.id, 'institutional_support');

  const emptyStar = aggregateCapitalFlowTiers(mockEtfs, 'star');
  assert.equal(emptyStar.etfCount, 0);
  assert.equal(emptyStar.main.netYi, 0);

  assert.equal(
    classifyCapitalFlowRegime({
      institutionNetYi: -3.5,
      largeNetYi: -1.2,
      mainNetYi: -4.7,
      retailNetYi: 1.8,
    }).id,
    'chips_distributing'
  );
  assert.equal(
    classifyCapitalFlowRegime({
      institutionNetYi: 1.2,
      largeNetYi: -0.2,
      mainNetYi: 1.0,
      retailNetYi: -0.6,
    }).id,
    'chips_accumulating'
  );
});
