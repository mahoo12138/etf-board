export type EtfCategory =
  | 'hs300'
  | 'star'
  | 'dividend'
  | 'broad_large'
  | 'mid_small'
  | 'a500';

export interface EtfMeta {
  code: string;
  thscode: string; // e.g., 510300.SH for Tonghuashun API
  secid: string; // e.g., 1.510300 for EastMoney
  qtCode: string; // e.g., sh510300 for Tencent Finance
  name: string;
  shortName: string;
  category: EtfCategory;
  categoryLabel: string;
  benchmark: string;
  nationalTeamFocus: boolean;
  /** Disclosed National Team held shares (in 100M shares / 亿份) from latest public ETF reports */
  nationalTeamSharesYi: number;
  /** Primary National Team holder entity */
  primaryHolder: NationalTeamEntityId | null;
}

export type NationalTeamEntityId =
  | 'huijin_inv'
  | 'huijin_asset'
  | 'csf'
  | 'guoxin'
  | 'ssf';

export interface NationalTeamEntity {
  id: NationalTeamEntityId;
  name: string;
  shortName: string;
  role: string;
  reportPeriod: string;
}

export interface NationalTeamHoldingRecord {
  entityId: NationalTeamEntityId;
  etfCode: string;
  etfName: string;
  sharesYi: number; // 亿份
  shareRatioPct: number; // 占该ETF总份额比例 %
  reportPeriod: string;
  changeNote: string;
}

export interface EtfLiveQuote {
  code: string;
  thscode: string;
  name: string;
  shortName: string;
  category: EtfCategory;
  categoryLabel: string;
  benchmark: string;
  price: number;
  prevClose: number;
  changePct: number; // %
  turnoverYi: number; // 当日成交额 (亿元)
  volumeWanShou: number; // 成交量 (万手)
  aumYi: number; // 基金估算总市值/规模 (亿元)
  mainNetInflowYi: number; // 主力净流入 (亿元)
  mainNetInflowRatioPct: number; // 主力净流入占比 (%)
  volumeRatio: number; // 量比
  turnoverSharePct: number; // 占20只合计成交额比例 (%)
  nationalTeamFocus: boolean;
  nationalTeamSharesYi: number;
  nationalTeamValueYi: number; // 实时估算国家队持仓市值 (亿元)
  nationalTeamDailyPnlYi: number; // 实时估算国家队今日盈亏 (亿元)
  primaryHolder: NationalTeamEntityId | null;
  tieredFlow: EtfTieredFlow; // 实时分档资金动向（机构/主力/大户/中单/散户）
  updatedAt: string;
}

export interface CapitalFlowTierStats {
  inflowYi: number; // 主动买入/流入 (亿元)
  outflowYi: number; // 主动卖出/流出 (亿元)
  netYi: number; // 净流入 = inflowYi - outflowYi (亿元)
  turnoverYi: number; // 该梯队成交额 (亿元)
  netRatioPct: number; // 净流入占总成交额比例 (%)
  turnoverSharePct: number; // 成交额占比 (%)
}

export interface EtfTieredFlow {
  institution: CapitalFlowTierStats; // 机构（特大单 ≥100万）
  large: CapitalFlowTierStats; // 大户（大单 20~100万）
  main: CapitalFlowTierStats; // 主力（机构 + 大户）
  medium: CapitalFlowTierStats; // 中单（5~20万）
  small: CapitalFlowTierStats; // 小单（<5万）
  retail: CapitalFlowTierStats; // 散户（中单 + 小单 <20万）
  totalTurnoverYi: number;
  liveAvailable: boolean;
}

export interface CapitalFlowRegime {
  id: 'institutional_support' | 'chips_accumulating' | 'chips_distributing' | 'retail_led' | 'balanced';
  label: string;
  summary: string;
}

export interface CapitalFlowSummary extends EtfTieredFlow {
  etfCount: number;
  liveCount: number;
  regime: CapitalFlowRegime;
}

export interface IndexMeta {
  code: string;
  thscode: string;
  secid: string;
  qtCode: string;
  name: string;
  group: 'core' | 'star' | 'dividend';
  description: string;
}

export interface IndexLiveQuote {
  code: string;
  thscode: string;
  name: string;
  group: 'core' | 'star' | 'dividend';
  description: string;
  price: number;
  prevClose: number;
  changePct: number;
  turnoverYi: number;
  mainNetInflowYi: number;
  mainNetInflowRatioPct: number;
  updatedAt: string;
}

export interface DailyKlinePoint {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnoverYi: number;
  changePct: number;
}

export interface DailyFlowPoint {
  date: string;
  mainNetInflowYi: number; // 主力净流入 (亿元)
  superLargeInflowYi: number; // 超大单净流入 (亿元)
  largeInflowYi: number; // 大单净流入 (亿元)
  close: number;
  changePct: number;
}

export interface AggregatedDailyHistoryPoint {
  date: string;
  totalTurnoverYi: number;
  totalNetInflowYi: number;
  superLargeNetInflowYi: number;
  sseClose: number;
  sseChangePct: number;
  star50Close: number;
  dividendClose: number;
  isSupportDay: boolean;
  supportReason: string | null;
}

export interface IndexAnalyticsSeries {
  code: string;
  name: string;
  group: 'core' | 'star' | 'dividend';
  latestPrice: number;
  changePct: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  rsi14: number | null;
  volumeRatio20: number | null;
  volatility20Pct: number | null;
  trendStatus: 'bullish' | 'bearish' | 'sideways';
  trendLabel: string;
  return20dPct: number | null;
  return60dPct: number | null;
  klines: DailyKlinePoint[];
}

export interface DataSourceInfo {
  provider: 'tonghuashun' | 'public_live' | 'fallback_seed';
  providerLabel: string;
  hithinkConfigured: boolean;
  hithinkEndpoint: string;
  fetchedAt: string;
  tradingDate: string;
  marketStatus: 'trading' | 'closed' | 'lunch_break';
  marketStatusLabel: string;
}

export type BullBearRegimeId =
  | 'bull_strong'
  | 'bull_emerging'
  | 'transition'
  | 'bear_defensive'
  | 'bear_deep';

export interface BullBearRegimeSignal {
  regime: BullBearRegimeId;
  label: string;
  score: number; // 0 (极度熊市防御) ~ 100 (极度牛市成长)
  summary: string;
  allocationHint: string;
}

export interface StarDividendRatioPoint {
  date: string;
  starClose: number;
  dividendClose: number;
  sseClose: number | null;
  ratio: number; // starClose / dividendClose
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  deviationMa60Pct: number | null;
}

export interface StarDividendRatioAnalytics {
  numeratorCode: string;
  numeratorName: string;
  denominatorCode: string;
  denominatorName: string;
  latestRatio: number;
  dailyChangePct: number;
  latestStarClose: number;
  latestDividendClose: number;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  deviationFromMa60Pct: number | null;
  percentilePct: number;
  zScore: number;
  minRatio: number;
  maxRatio: number;
  meanRatio: number;
  stdRatio: number;
  change20dPct: number | null;
  change60dPct: number | null;
  signal: BullBearRegimeSignal;
  points: StarDividendRatioPoint[];
}

export interface MarketOverviewResponse {
  source: DataSourceInfo;
  etfs: EtfLiveQuote[];
  indices: IndexLiveQuote[];
  summary: {
    totalEtfTurnoverYi: number;
    totalMainNetInflowYi: number;
    hs300NetInflowYi: number;
    starEtfNetInflowYi: number;
    dividendEtfNetInflowYi: number;
    nationalTeamTotalValueYi: number;
    nationalTeamDailyPnlYi: number;
    s1AnomalyRatio: number; // 放量倍数
    supportSignalActive: boolean;
    supportSignalLevel: 'strong' | 'moderate' | 'normal';
    supportSignalText: string;
    starVsDividendSpreadPct: number; // 创业板指涨跌幅 - 中证红利涨跌幅
    starDividendRatio: number; // 创业板指(399006) / 中证红利(000922) 牛熊比值
  };
  capitalFlow: CapitalFlowSummary;
}

export interface HistoryResponse {
  source: DataSourceInfo;
  days: AggregatedDailyHistoryPoint[];
  supportDayCount: number;
  latestSupportDate: string | null;
}

export interface IndicesTrendResponse {
  source: DataSourceInfo;
  series: IndexAnalyticsSeries[];
  spreadDates: string[];
  star50Normalized: number[];
  dividendNormalized: number[];
  hs300Normalized: number[];
  starMinusDividendSpread: number[];
  chinextDividendRatio: StarDividendRatioAnalytics;
}

export type EquityBondIndexCode = '000300' | '000905';

export type EquityBondZoneId =
  | 'very_attractive'
  | 'attractive'
  | 'neutral'
  | 'cautious'
  | 'expensive';

export interface EquityBondZoneSignal {
  zone: EquityBondZoneId;
  label: string;
  summary: string;
}

export interface EquityBondPoint {
  date: string;
  close: number;
  pe: number;
  earningsYieldPct: number; // 100 / pe (%)
  bondYield10yPct: number; // CN10Y (%)
  spreadPct: number; // earningsYieldPct - bondYield10yPct (百分点)
  ratio: number; // earningsYieldPct / bondYield10yPct (倍)
}

export interface EquityBondWindowPercentile {
  id: '1y' | '3y' | '5y' | 'all';
  label: string;
  sampleDays: number;
  startDate: string;
  spreadPercentilePct: number;
  ratioPercentilePct: number;
  meanSpreadPct: number;
  minSpreadPct: number;
  maxSpreadPct: number;
}

export interface EquityBondSpreadResponse {
  source: DataSourceInfo;
  indexCode: EquityBondIndexCode;
  indexName: string;
  latestDate: string;
  latestClose: number;
  latestPe: number;
  latestEarningsYieldPct: number;
  latestBondYield10yPct: number;
  latestSpreadPct: number;
  latestRatio: number;
  spreadChange1dBp: number; // 日变动 (bp, 1% = 100bp)
  historyStartDate: string;
  totalPoints: number;
  percentiles: EquityBondWindowPercentile[];
  zoneSignal: EquityBondZoneSignal;
  points: EquityBondPoint[];
}

export type AlertMetric =
  | 'total_net_inflow'
  | 'total_turnover'
  | 's1_volume_ratio'
  | 'index_change_pct'
  | 'index_net_inflow'
  | 'etf_net_inflow'
  | 'etf_change_pct'
  | 'star_dividend_spread'
  | 'star_dividend_ratio';

export type AlertOperator = 'gt' | 'lt';

export interface AlertRule {
  id: string;
  name: string;
  metric: AlertMetric;
  targetCode?: string; // e.g. '000688', '000922', '510300'
  targetName?: string;
  operator: AlertOperator;
  threshold: number;
  unit: string;
  enabled: boolean;
  cooldownMinutes: number;
  lastTriggeredAt?: number;
}

export interface TriggeredAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  message: string;
  actualValue: number;
  threshold: number;
  unit: string;
  severity: 'high' | 'medium';
  triggeredAt: string;
  read: boolean;
}
