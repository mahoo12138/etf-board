import type {
  AggregatedDailyHistoryPoint,
  BullBearRegimeSignal,
  CapitalFlowRegime,
  CapitalFlowSummary,
  CapitalFlowTierStats,
  DailyKlinePoint,
  EquityBondPoint,
  EquityBondWindowPercentile,
  EquityBondZoneSignal,
  EtfCategory,
  EtfLiveQuote,
  EtfTieredFlow,
  NationalTeamEntityId,
  NationalTeamHoldingRecord,
  StarDividendRatioAnalytics,
  StarDividendRatioPoint,
} from '../types/market';

/**
 * Simple Moving Average for the trailing `period` close prices.
 */
export function computeSMA(closes: number[], period: number): number | null {
  if (period <= 0 || closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return roundTo(sum / period, 3);
}

/**
 * Wilder-style RSI(period) calculation on closing prices.
 */
export function computeRSI(closes: number[], period = 14): number | null {
  if (period <= 0 || closes.length <= period) return null;
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return roundTo(100 - 100 / (1 + rs), 2);
}

/**
 * Annualized 20-day realized volatility (%) from daily close series.
 */
export function computeVolatilityPct(closes: number[], period = 20): number | null {
  if (closes.length <= period) return null;
  const returns: number[] = [];
  const start = closes.length - period;
  for (let i = start; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) {
      returns.push((closes[i] - prev) / prev);
    }
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) /
    (returns.length - 1);
  return roundTo(Math.sqrt(variance) * Math.sqrt(242) * 100, 2);
}

/**
 * Classify moving average trend alignment.
 */
export function classifyTrend(
  price: number,
  ma5: number | null,
  ma20: number | null,
  ma60: number | null
): { status: 'bullish' | 'bearish' | 'sideways'; label: string } {
  if (ma5 === null || ma20 === null) {
    return { status: 'sideways', label: '数据积累中' };
  }
  if (ma60 !== null) {
    if (price >= ma5 && ma5 > ma20 && ma20 > ma60) {
      return { status: 'bullish', label: '多头趋势排列' };
    }
    if (price <= ma5 && ma5 < ma20 && ma20 < ma60) {
      return { status: 'bearish', label: '空头趋势承压' };
    }
  }
  const distPct = ma20 > 0 ? Math.abs(price - ma20) / ma20 : 0;
  if (distPct < 0.012) {
    return { status: 'sideways', label: '均线震荡收敛' };
  }
  if (price > ma20 && ma5 > ma20) {
    return { status: 'bullish', label: '短期偏强上行' };
  }
  if (price < ma20 && ma5 < ma20) {
    return { status: 'bearish', label: '短期偏弱回调' };
  }
  return { status: 'sideways', label: '均线震荡收敛' };
}

/**
 * Compute trailing N-day cumulative return (%)
 */
export function computePeriodReturnPct(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  const base = closes[closes.length - 1 - days];
  const latest = closes[closes.length - 1];
  if (base <= 0) return null;
  return roundTo(((latest - base) / base) * 100, 2);
}

/**
 * Compute 20-day turnover/volume ratio (latest turnover vs trailing 20-day mean).
 */
export function computeVolumeRatio(klines: DailyKlinePoint[], lookback = 20): number | null {
  if (klines.length < 2) return null;
  const latest = klines[klines.length - 1].turnoverYi;
  const history = klines.slice(Math.max(0, klines.length - 1 - lookback), klines.length - 1);
  if (history.length === 0) return null;
  const avg = history.reduce((acc, k) => acc + k.turnoverYi, 0) / history.length;
  if (avg <= 0) return null;
  return roundTo(latest / avg, 2);
}

/**
 * Compute normalized return series (starting at 0%) and relative spread (Series A - Series B).
 */
export function computeRelativeSpread(
  seriesA: DailyKlinePoint[],
  seriesB: DailyKlinePoint[]
): {
  dates: string[];
  normA: number[];
  normB: number[];
  spread: number[];
} {
  const mapB = new Map(seriesB.map((p) => [p.date, p.close]));
  const aligned: Array<{ date: string; a: number; b: number }> = [];

  for (const ptA of seriesA) {
    const bVal = mapB.get(ptA.date);
    if (bVal !== undefined && ptA.close > 0 && bVal > 0) {
      aligned.push({ date: ptA.date, a: ptA.close, b: bVal });
    }
  }

  if (aligned.length === 0) {
    return { dates: [], normA: [], normB: [], spread: [] };
  }

  const baseA = aligned[0].a;
  const baseB = aligned[0].b;
  const dates: string[] = [];
  const normA: number[] = [];
  const normB: number[] = [];
  const spread: number[] = [];

  for (const row of aligned) {
    const rA = roundTo(((row.a - baseA) / baseA) * 100, 2);
    const rB = roundTo(((row.b - baseB) / baseB) * 100, 2);
    dates.push(row.date);
    normA.push(rA);
    normB.push(rB);
    spread.push(roundTo(rA - rB, 2));
  }

  return { dates, normA, normB, spread };
}

/**
 * Classify A-share bull vs bear market regime from STAR / CSI Dividend ratio telemetry.
 * Higher ratio & upward MA alignment => Risk-On Bullish (成长进攻/牛市格局).
 * Lower ratio & downward MA alignment => Risk-Off Defensive (红利防御/熊市格局).
 */
export function classifyBullBearRegime(params: {
  latestRatio: number;
  ma20: number | null;
  ma60: number | null;
  change20dPct: number | null;
  percentilePct: number;
}): BullBearRegimeSignal {
  const { latestRatio, ma20, ma60, change20dPct, percentilePct } = params;

  // Build a deterministic 0-100 risk-appetite score combining percentile, MA positioning, and 20d momentum
  let score = 50;
  // 1) Percentile contribution (-22 to +22)
  score += ((percentilePct - 50) / 50) * 22;

  // 2) MA20 & MA60 alignment contribution (-20 to +20)
  if (ma20 !== null && ma20 > 0) {
    const dev20 = ((latestRatio - ma20) / ma20) * 100;
    score += Math.max(-10, Math.min(10, dev20 * 1.6));
  }
  if (ma60 !== null && ma60 > 0) {
    const dev60 = ((latestRatio - ma60) / ma60) * 100;
    score += Math.max(-12, Math.min(12, dev60 * 1.1));
  }

  // 3) 20-day momentum contribution (-10 to +10)
  if (change20dPct !== null) {
    score += Math.max(-10, Math.min(10, change20dPct * 0.9));
  }

  const clampedScore = Math.round(Math.max(0, Math.min(100, score)));

  const aboveMa20 = ma20 !== null && latestRatio > ma20 * 1.005;
  const aboveMa60 = ma60 !== null && latestRatio > ma60 * 1.005;
  const belowMa20 = ma20 !== null && latestRatio < ma20 * 0.995;
  const belowMa60 = ma60 !== null && latestRatio < ma60 * 0.995;
  const maBullStack = ma20 !== null && ma60 !== null && latestRatio > ma20 && ma20 > ma60;
  const maBearStack = ma20 !== null && ma60 !== null && latestRatio < ma20 && ma20 < ma60;

  if (clampedScore >= 72 || (maBullStack && percentilePct >= 65)) {
    return {
      regime: 'bull_strong',
      label: '成长牛市格局',
      score: clampedScore,
      summary: '比值稳居 MA20 与 MA60 上方且处于区间高位，市场风险偏好显著扩张，创业板成长主线持续跑赢高股息防御资产。',
      allocationHint: '风险偏好扩张期：侧重创业板成长与高弹性宽基，关注量能配合与高位拥挤度。',
    };
  }

  if (clampedScore >= 58 || (aboveMa20 && aboveMa60 && (change20dPct ?? 0) > 1.5)) {
    return {
      regime: 'bull_emerging',
      label: '牛熊拐点偏多',
      score: clampedScore,
      summary: '比值重新站上中期均线并呈温和抬升，增量资金逐步从红利防御向创业板成长切换，具备结构性转牛特征。',
      allocationHint: '风格切换早期：可采用「宽基核心 + 创业板弹性」哑铃偏进攻配置，跟踪比值能否放量突破。',
    };
  }

  if (clampedScore <= 28 || (maBearStack && percentilePct <= 30)) {
    return {
      regime: 'bear_deep',
      label: '深度避险熊市',
      score: clampedScore,
      summary: '比值呈空头排列并落入区间低分位，资金高度抱团红利低波与国资高股息资产，成长风险偏好处于冰点。',
      allocationHint: '防御优先兼顾逆向观察：底仓以红利低波/沪深300稳健为主，同时密切留意比值极低分位后的左侧企稳信号。',
    };
  }

  if (clampedScore <= 42 || (belowMa20 && belowMa60)) {
    return {
      regime: 'bear_defensive',
      label: '防御偏熊格局',
      score: clampedScore,
      summary: '比值受压于中期均线下方，市场以存量博弈与避险防御为主，红利价值板块相对抗跌占优。',
      allocationHint: '防御均衡期：控制高波动成长仓位，重视高股息与国家队托底权重ETF的防御价值。',
    };
  }

  return {
    regime: 'transition',
    label: '牛熊震荡轮动',
    score: clampedScore,
    summary: '比值围绕 MA20 与 MA60 附近反复拉锯，创业板成长与高股息红利轮动交替，市场尚未形成单边风险偏好趋势。',
    allocationHint: '震荡轮动期：适合均衡哑铃策略（红利底仓 + 创业板波段），等待比值有效突破均线带确认方向。',
  };
}

/**
 * Compute aligned daily STAR / CSI Dividend ratio series, moving averages,
 * percentile rank, Z-score, and bull/bear market regime classification.
 */
export function computeStarDividendRatioSeries(
  starKlines: DailyKlinePoint[],
  dividendKlines: DailyKlinePoint[],
  sseKlines: DailyKlinePoint[],
  meta: {
    numeratorCode: string;
    numeratorName: string;
    denominatorCode: string;
    denominatorName: string;
  }
): StarDividendRatioAnalytics {
  const divMap = new Map(dividendKlines.map((p) => [p.date, p.close]));
  const sseMap = new Map(sseKlines.map((p) => [p.date, p.close]));

  const aligned: Array<{
    date: string;
    starClose: number;
    dividendClose: number;
    sseClose: number | null;
    ratio: number;
  }> = [];

  for (const pt of starKlines) {
    const divClose = divMap.get(pt.date);
    if (divClose !== undefined && divClose > 0 && pt.close > 0) {
      aligned.push({
        date: pt.date,
        starClose: pt.close,
        dividendClose: divClose,
        sseClose: sseMap.get(pt.date) ?? null,
        ratio: roundTo(pt.close / divClose, 4),
      });
    }
  }

  if (aligned.length === 0) {
    return {
      ...meta,
      latestRatio: 0,
      dailyChangePct: 0,
      latestStarClose: 0,
      latestDividendClose: 0,
      ma20: null,
      ma60: null,
      ma120: null,
      deviationFromMa60Pct: null,
      percentilePct: 50,
      zScore: 0,
      minRatio: 0,
      maxRatio: 0,
      meanRatio: 0,
      stdRatio: 0,
      change20dPct: null,
      change60dPct: null,
      signal: classifyBullBearRegime({
        latestRatio: 0,
        ma20: null,
        ma60: null,
        change20dPct: null,
        percentilePct: 50,
      }),
      points: [],
    };
  }

  const ratios = aligned.map((a) => a.ratio);

  const rollingMean = (idx: number, period: number): number | null => {
    if (idx + 1 < period) return null;
    let sum = 0;
    for (let j = idx - period + 1; j <= idx; j++) sum += ratios[j];
    return roundTo(sum / period, 4);
  };

  const points: StarDividendRatioPoint[] = aligned.map((row, idx) => {
    const ma20 = rollingMean(idx, 20);
    const ma60 = rollingMean(idx, 60);
    const ma120 = rollingMean(idx, 120);
    const deviationMa60Pct =
      ma60 !== null && ma60 > 0 ? roundTo(((row.ratio - ma60) / ma60) * 100, 2) : null;
    return {
      ...row,
      ma20,
      ma60,
      ma120,
      deviationMa60Pct,
    };
  });

  const latest = points[points.length - 1];
  const prev = points.length >= 2 ? points[points.length - 2] : null;
  const dailyChangePct =
    prev && prev.ratio > 0 ? roundTo(((latest.ratio - prev.ratio) / prev.ratio) * 100, 2) : 0;

  const meanRatio = roundTo(ratios.reduce((acc, v) => acc + v, 0) / ratios.length, 4);
  const variance =
    ratios.length > 1
      ? ratios.reduce((acc, v) => acc + Math.pow(v - meanRatio, 2), 0) / ratios.length
      : 0;
  const stdRatio = roundTo(Math.sqrt(variance), 4);
  const zScore = stdRatio > 0 ? roundTo((latest.ratio - meanRatio) / stdRatio, 2) : 0;

  const minRatio = roundTo(Math.min(...ratios), 4);
  const maxRatio = roundTo(Math.max(...ratios), 4);

  const lessOrEqCount = ratios.filter((r) => r <= latest.ratio).length;
  const percentilePct = roundTo((lessOrEqCount / ratios.length) * 100, 1);

  const change20dPct = computePeriodReturnPct(ratios, 20);
  const change60dPct = computePeriodReturnPct(ratios, 60);

  const signal = classifyBullBearRegime({
    latestRatio: latest.ratio,
    ma20: latest.ma20,
    ma60: latest.ma60,
    change20dPct,
    percentilePct,
  });

  return {
    ...meta,
    latestRatio: latest.ratio,
    dailyChangePct,
    latestStarClose: latest.starClose,
    latestDividendClose: latest.dividendClose,
    ma20: latest.ma20,
    ma60: latest.ma60,
    ma120: latest.ma120,
    deviationFromMa60Pct: latest.deviationMa60Pct,
    percentilePct,
    zScore,
    minRatio,
    maxRatio,
    meanRatio,
    stdRatio,
    change20dPct,
    change60dPct,
    signal,
    points,
  };
}

/**
 * Classify equity-vs-bond relative attractiveness from historical ERP spread percentile.
 */
export function classifyEquityBondZone(percentilePct: number): EquityBondZoneSignal {
  if (percentilePct >= 80) {
    return {
      zone: 'very_attractive',
      label: '权益极高性价比区',
      summary:
        '股债利差处于历史 80% 以上高分位，股票盈利收益率相对十年期国债补偿极高，历史上常对应中长期底部配置窗口。',
    };
  }
  if (percentilePct >= 60) {
    return {
      zone: 'attractive',
      label: '权益性价比偏高区',
      summary:
        '股债利差高于历史中位数，权益资产相对国债仍具明显收益补偿优势，中长期赔率偏有利。',
    };
  }
  if (percentilePct >= 40) {
    return {
      zone: 'neutral',
      label: '股债中性均衡区',
      summary:
        '股债利差位于历史中枢附近，股债相对性价比趋于均衡，更依赖盈利周期与市场风险偏好催化。',
    };
  }
  if (percentilePct >= 20) {
    return {
      zone: 'cautious',
      label: '权益性价比偏低区',
      summary:
        '股债利差回落至历史偏低分位，权益相对国债的收益补偿收窄，需警惕估值透支并关注盈利兑现。',
    };
  }
  return {
    zone: 'expensive',
    label: '债券相对占优警戒区',
    summary:
      '股债利差落入历史 20% 以下极低分位，权益风险溢价补偿处于历史低位，债券资产相对防御价值上升。',
  };
}

/**
 * Compute daily Equity-Bond Yield Spread (100/PE - CN10Y) and Equity-Bond Ratio ((100/PE) / CN10Y),
 * aligning each trading day with the exact or nearest prior China 10Y Treasury Yield (up to 7 calendar days),
 * and calculating multi-horizon historical percentiles (1Y / 3Y / 5Y / All).
 */
export function computeEquityBondSpreadAnalytics(
  indexRows: Array<{ date: string; close: number; pe: number }>,
  bondRows: Array<{ date: string; yield10y: number }>
): {
  points: EquityBondPoint[];
  percentiles: EquityBondWindowPercentile[];
  zoneSignal: EquityBondZoneSignal;
  latestDate: string;
  latestClose: number;
  latestPe: number;
  latestEarningsYieldPct: number;
  latestBondYield10yPct: number;
  latestSpreadPct: number;
  latestRatio: number;
  spreadChange1dBp: number;
  historyStartDate: string;
} {
  const sortedIndex = [...indexRows]
    .filter((r) => Boolean(r.date) && r.close > 0 && r.pe > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const sortedBonds = [...bondRows]
    .filter((b) => Boolean(b.date) && b.yield10y > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const points: EquityBondPoint[] = [];
  let bondIdx = 0;

  for (const row of sortedIndex) {
    while (bondIdx + 1 < sortedBonds.length && sortedBonds[bondIdx + 1].date <= row.date) {
      bondIdx += 1;
    }
    const bond = sortedBonds[bondIdx];
    if (!bond || bond.date > row.date) continue;

    // Ensure matched bond observation is within 10 calendar days of equity trading date
    const dayDiff =
      (Date.parse(row.date) - Date.parse(bond.date)) / (1000 * 60 * 60 * 24);
    if (!Number.isFinite(dayDiff) || dayDiff > 10) continue;

    const earningsYieldPct = roundTo(100 / row.pe, 2);
    const bondYield10yPct = roundTo(bond.yield10y, 3);
    const spreadPct = roundTo(earningsYieldPct - bondYield10yPct, 2);
    const ratio = roundTo(earningsYieldPct / bondYield10yPct, 2);

    points.push({
      date: row.date,
      close: roundTo(row.close, 2),
      pe: roundTo(row.pe, 2),
      earningsYieldPct,
      bondYield10yPct,
      spreadPct,
      ratio,
    });
  }

  if (points.length === 0) {
    return {
      points: [],
      percentiles: [],
      zoneSignal: classifyEquityBondZone(50),
      latestDate: '',
      latestClose: 0,
      latestPe: 0,
      latestEarningsYieldPct: 0,
      latestBondYield10yPct: 0,
      latestSpreadPct: 0,
      latestRatio: 0,
      spreadChange1dBp: 0,
      historyStartDate: '',
    };
  }

  const latest = points[points.length - 1];
  const prev = points.length >= 2 ? points[points.length - 2] : null;
  const spreadChange1dBp = prev ? Math.round((latest.spreadPct - prev.spreadPct) * 100) : 0;

  const buildWindowPercentile = (
    id: '1y' | '3y' | '5y' | 'all',
    label: string,
    yearsBack: number | null
  ): EquityBondWindowPercentile => {
    let subset = points;
    if (yearsBack !== null) {
      const latestMs = Date.parse(latest.date);
      const cutoffMs = latestMs - yearsBack * 365.25 * 24 * 60 * 60 * 1000;
      const filtered = points.filter((p) => Date.parse(p.date) >= cutoffMs);
      if (filtered.length > 0) subset = filtered;
    }
    const spreads = subset.map((p) => p.spreadPct);
    const ratios = subset.map((p) => p.ratio);
    const spreadRank = spreads.filter((v) => v <= latest.spreadPct).length;
    const ratioRank = ratios.filter((v) => v <= latest.ratio).length;
    const meanSpread = spreads.reduce((acc, v) => acc + v, 0) / spreads.length;

    return {
      id,
      label,
      sampleDays: subset.length,
      startDate: subset[0].date,
      spreadPercentilePct: roundTo((spreadRank / subset.length) * 100, 2),
      ratioPercentilePct: roundTo((ratioRank / subset.length) * 100, 2),
      meanSpreadPct: roundTo(meanSpread, 2),
      minSpreadPct: roundTo(Math.min(...spreads), 2),
      maxSpreadPct: roundTo(Math.max(...spreads), 2),
    };
  };

  const percentiles: EquityBondWindowPercentile[] = [
    buildWindowPercentile('all', '全部样本', null),
    buildWindowPercentile('5y', '近 5 年', 5),
    buildWindowPercentile('3y', '近 3 年', 3),
    buildWindowPercentile('1y', '近 1 年', 1),
  ];

  // Primary zone classification uses 5-year (or all-sample) spread percentile
  const refWindow = percentiles.find((w) => w.id === '5y') || percentiles[0];
  const zoneSignal = classifyEquityBondZone(refWindow.spreadPercentilePct);

  return {
    points,
    percentiles,
    zoneSignal,
    latestDate: latest.date,
    latestClose: latest.close,
    latestPe: latest.pe,
    latestEarningsYieldPct: latest.earningsYieldPct,
    latestBondYield10yPct: latest.bondYield10yPct,
    latestSpreadPct: latest.spreadPct,
    latestRatio: latest.ratio,
    spreadChange1dBp,
    historyStartDate: points[0].date,
  };
}

/**
 * Evaluate National Team real-time mark-to-market valuation grouped by entity.
 */
export function computeNationalTeamValuation(
  holdings: NationalTeamHoldingRecord[],
  etfQuotes: EtfLiveQuote[]
): {
  totalValueYi: number;
  totalDailyPnlYi: number;
  byEntity: Record<
    NationalTeamEntityId,
    { valueYi: number; dailyPnlYi: number; holdingCount: number; weightPct: number }
  >;
} {
  const quoteMap = new Map(etfQuotes.map((q) => [q.code, q]));
  const byEntity: Record<
    NationalTeamEntityId,
    { valueYi: number; dailyPnlYi: number; holdingCount: number; weightPct: number }
  > = {
    huijin_inv: { valueYi: 0, dailyPnlYi: 0, holdingCount: 0, weightPct: 0 },
    huijin_asset: { valueYi: 0, dailyPnlYi: 0, holdingCount: 0, weightPct: 0 },
    guoxin: { valueYi: 0, dailyPnlYi: 0, holdingCount: 0, weightPct: 0 },
    ssf: { valueYi: 0, dailyPnlYi: 0, holdingCount: 0, weightPct: 0 },
    csf: { valueYi: 0, dailyPnlYi: 0, holdingCount: 0, weightPct: 0 },
  };

  let totalValueYi = 0;
  let totalDailyPnlYi = 0;

  for (const rec of holdings) {
    const q = quoteMap.get(rec.etfCode);
    if (!q || q.price <= 0) continue;
    const valYi = rec.sharesYi * q.price;
    const pnlYi = rec.sharesYi * (q.price - q.prevClose);
    totalValueYi += valYi;
    totalDailyPnlYi += pnlYi;
    byEntity[rec.entityId].valueYi += valYi;
    byEntity[rec.entityId].dailyPnlYi += pnlYi;
    byEntity[rec.entityId].holdingCount += 1;
  }

  for (const id of Object.keys(byEntity) as NationalTeamEntityId[]) {
    byEntity[id].valueYi = roundTo(byEntity[id].valueYi, 2);
    byEntity[id].dailyPnlYi = roundTo(byEntity[id].dailyPnlYi, 2);
    byEntity[id].weightPct =
      totalValueYi > 0 ? roundTo((byEntity[id].valueYi / totalValueYi) * 100, 1) : 0;
  }

  return {
    totalValueYi: roundTo(totalValueYi, 2),
    totalDailyPnlYi: roundTo(totalDailyPnlYi, 2),
    byEntity,
  };
}

/**
 * Evaluate S1 intraday anomaly ratio (cumulative turnover vs historical baseline).
 */
export function computeS1AnomalyRatio(
  currentCumulativeYi: number,
  baselineCumulativeYi: number
): number {
  if (baselineCumulativeYi <= 0) return 1;
  return roundTo(currentCumulativeYi / baselineCumulativeYi, 2);
}

/**
 * Tag historical support days ("托底日") where 20-ETF net inflow crosses threshold
 * OR heavy institutional volume enters during index drawdowns.
 */
export function evaluateSupportSignal(
  netInflowYi: number,
  turnoverYi: number,
  avgTurnoverYi: number,
  sseChangePct: number
): { isSupportDay: boolean; reason: string | null } {
  if (netInflowYi >= 35) {
    return { isSupportDay: true, reason: '宽基主力大幅净流入 (≥35亿)' };
  }
  if (
    netInflowYi >= 15 &&
    avgTurnoverYi > 0 &&
    turnoverYi >= avgTurnoverYi * 1.45 &&
    sseChangePct <= 0.3
  ) {
    return { isSupportDay: true, reason: '逆势放量托底承接' };
  }
  if (avgTurnoverYi > 0 && turnoverYi >= avgTurnoverYi * 1.85 && netInflowYi > 0) {
    return { isSupportDay: true, reason: '宽基成交量异常放大 (≥1.85x)' };
  }
  return { isSupportDay: false, reason: null };
}

export function tagSupportDays(
  rawDays: Omit<AggregatedDailyHistoryPoint, 'isSupportDay' | 'supportReason'>[]
): AggregatedDailyHistoryPoint[] {
  const avgTurnover =
    rawDays.length > 0
      ? rawDays.reduce((acc, d) => acc + d.totalTurnoverYi, 0) / rawDays.length
      : 0;

  return rawDays.map((day) => {
    const check = evaluateSupportSignal(
      day.totalNetInflowYi,
      day.totalTurnoverYi,
      avgTurnover,
      day.sseChangePct
    );
    return {
      ...day,
      isSupportDay: check.isSupportDay,
      supportReason: check.reason,
    };
  });
}

export function roundTo(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function formatSigned(value: number, decimals = 2, suffix = ''): string {
  const fixed = Math.abs(value).toFixed(decimals);
  if (value > 0) return `+${fixed}${suffix}`;
  if (value < 0) return `-${fixed}${suffix}`;
  return `0.${'0'.repeat(decimals)}${suffix}`;
}

export function formatYi(value: number, signed = false): string {
  if (signed) return formatSigned(value, 2, ' 亿');
  return `${value.toFixed(2)} 亿`;
}

function makeTierStats(
  inflowYi: number,
  outflowYi: number,
  turnoverYi: number,
  totalTurnoverYi: number
): CapitalFlowTierStats {
  const safeIn = roundTo(Math.max(0, inflowYi), 2);
  const safeOut = roundTo(Math.max(0, outflowYi), 2);
  const net = roundTo(safeIn - safeOut, 2);
  const safeTurn = roundTo(Math.max(turnoverYi, safeIn + safeOut), 2);
  return {
    inflowYi: safeIn,
    outflowYi: safeOut,
    netYi: net,
    turnoverYi: safeTurn,
    netRatioPct: totalTurnoverYi > 0 ? roundTo((net / totalTurnoverYi) * 100, 2) : 0,
    turnoverSharePct: totalTurnoverYi > 0 ? roundTo((safeTurn / totalTurnoverYi) * 100, 1) : 0,
  };
}

/**
 * Build a standardized 4-tier (+ medium/small) capital flow record from raw RMB Yuan
 * order-size buckets (r0 = 特大单/机构, r1 = 大单/大户, r2 = 中单, r3 = 小单).
 */
export function buildEtfTieredFlow(raw: {
  r0InYuan: number;
  r0OutYuan: number;
  r0TotalYuan?: number;
  r1InYuan: number;
  r1OutYuan: number;
  r1TotalYuan?: number;
  r2InYuan: number;
  r2OutYuan: number;
  r2TotalYuan?: number;
  r3InYuan: number;
  r3OutYuan: number;
  r3TotalYuan?: number;
  liveAvailable?: boolean;
}): EtfTieredFlow {
  const toYi = (v: number) => (Number.isFinite(v) ? v / 1e8 : 0);

  const r0In = toYi(raw.r0InYuan);
  const r0Out = toYi(raw.r0OutYuan);
  const r0Turn = toYi(raw.r0TotalYuan ?? raw.r0InYuan + raw.r0OutYuan);

  const r1In = toYi(raw.r1InYuan);
  const r1Out = toYi(raw.r1OutYuan);
  const r1Turn = toYi(raw.r1TotalYuan ?? raw.r1InYuan + raw.r1OutYuan);

  const r2In = toYi(raw.r2InYuan);
  const r2Out = toYi(raw.r2OutYuan);
  const r2Turn = toYi(raw.r2TotalYuan ?? raw.r2InYuan + raw.r2OutYuan);

  const r3In = toYi(raw.r3InYuan);
  const r3Out = toYi(raw.r3OutYuan);
  const r3Turn = toYi(raw.r3TotalYuan ?? raw.r3InYuan + raw.r3OutYuan);

  const totalTurnoverYi = roundTo(
    Math.max(r0Turn + r1Turn + r2Turn + r3Turn, r0In + r0Out + r1In + r1Out + r2In + r2Out + r3In + r3Out),
    2
  );

  const institution = makeTierStats(r0In, r0Out, r0Turn, totalTurnoverYi);
  const large = makeTierStats(r1In, r1Out, r1Turn, totalTurnoverYi);
  const main = makeTierStats(r0In + r1In, r0Out + r1Out, r0Turn + r1Turn, totalTurnoverYi);
  const medium = makeTierStats(r2In, r2Out, r2Turn, totalTurnoverYi);
  const small = makeTierStats(r3In, r3Out, r3Turn, totalTurnoverYi);
  const retail = makeTierStats(r2In + r3In, r2Out + r3Out, r2Turn + r3Turn, totalTurnoverYi);

  return {
    institution,
    large,
    main,
    medium,
    small,
    retail,
    totalTurnoverYi,
    liveAvailable: raw.liveAvailable ?? true,
  };
}

/**
 * Diagnose the intraday institutional vs retail capital flow regime.
 */
export function classifyCapitalFlowRegime(flow: {
  institutionNetYi: number;
  largeNetYi: number;
  mainNetYi: number;
  retailNetYi: number;
}): CapitalFlowRegime {
  const { institutionNetYi, largeNetYi, mainNetYi, retailNetYi } = flow;

  if (institutionNetYi > 1 && largeNetYi > 0.3 && mainNetYi >= 2) {
    return {
      id: 'institutional_support',
      label: '机构大户合力净流入',
      summary: '机构（特大单）与大户（大单）同步主动净买入，主力承接意愿强劲，宽基筹码趋向集中。',
    };
  }
  if (institutionNetYi > 0.5 && retailNetYi < -0.1) {
    return {
      id: 'chips_accumulating',
      label: '机构吸筹 · 散户离场',
      summary: '机构特大单逆势净流入，中小单散户偏向净卖出，呈现典型机构低吸与筹码收集特征。',
    };
  }
  if (institutionNetYi < -1 && mainNetYi <= -2 && retailNetYi > 0.1) {
    return {
      id: 'chips_distributing',
      label: '主力净流出 · 散户承接',
      summary: '机构与主力大额净流出而散户中小单逆势净买入，需警惕高位筹码派发或情绪承接风险。',
    };
  }
  if (mainNetYi < -1 && retailNetYi <= 0.1) {
    return {
      id: 'chips_distributing',
      label: '机构主导逢高减仓',
      summary: '机构与大户资金整体偏向净流出，短线资金观望情绪升温，建议结合放量与托底信号观察。',
    };
  }
  if (retailNetYi > 0.5 && Math.abs(institutionNetYi) <= 1) {
    return {
      id: 'retail_led',
      label: '散户资金偏活跃',
      summary: '机构资金整体平衡观望，盘面增量买卖以中小单散户资金博弈为主。',
    };
  }
  return {
    id: 'balanced',
    label: '各梯队资金均衡博弈',
    summary: '机构、大户与散户买卖力量大体均衡，暂未出现极端单边吸筹或集中派发特征。',
  };
}

/**
 * Aggregate multi-tier capital flows across a list of ETFs (optionally filtered by category).
 */
export function aggregateCapitalFlowTiers(
  etfs: EtfLiveQuote[],
  category: 'all' | EtfCategory = 'all'
): CapitalFlowSummary {
  const target = category === 'all' ? etfs : etfs.filter((e) => e.category === category);

  let r0In = 0;
  let r0Out = 0;
  let r0Turn = 0;
  let r1In = 0;
  let r1Out = 0;
  let r1Turn = 0;
  let r2In = 0;
  let r2Out = 0;
  let r2Turn = 0;
  let r3In = 0;
  let r3Out = 0;
  let r3Turn = 0;
  let liveCount = 0;

  for (const e of target) {
    const f = e.tieredFlow;
    if (!f) continue;
    if (f.liveAvailable) liveCount += 1;
    r0In += f.institution.inflowYi;
    r0Out += f.institution.outflowYi;
    r0Turn += f.institution.turnoverYi;
    r1In += f.large.inflowYi;
    r1Out += f.large.outflowYi;
    r1Turn += f.large.turnoverYi;
    r2In += f.medium.inflowYi;
    r2Out += f.medium.outflowYi;
    r2Turn += f.medium.turnoverYi;
    r3In += f.small.inflowYi;
    r3Out += f.small.outflowYi;
    r3Turn += f.small.turnoverYi;
  }

  const totalTurnoverYi = roundTo(
    Math.max(r0Turn + r1Turn + r2Turn + r3Turn, r0In + r0Out + r1In + r1Out + r2In + r2Out + r3In + r3Out),
    2
  );

  const institution = makeTierStats(r0In, r0Out, r0Turn, totalTurnoverYi);
  const large = makeTierStats(r1In, r1Out, r1Turn, totalTurnoverYi);
  const main = makeTierStats(r0In + r1In, r0Out + r1Out, r0Turn + r1Turn, totalTurnoverYi);
  const medium = makeTierStats(r2In, r2Out, r2Turn, totalTurnoverYi);
  const small = makeTierStats(r3In, r3Out, r3Turn, totalTurnoverYi);
  const retail = makeTierStats(r2In + r3In, r2Out + r3Out, r2Turn + r3Turn, totalTurnoverYi);

  const regime = classifyCapitalFlowRegime({
    institutionNetYi: institution.netYi,
    largeNetYi: large.netYi,
    mainNetYi: main.netYi,
    retailNetYi: retail.netYi,
  });

  return {
    institution,
    large,
    main,
    medium,
    small,
    retail,
    totalTurnoverYi,
    liveAvailable: liveCount > 0,
    etfCount: target.length,
    liveCount,
    regime,
  };
}
