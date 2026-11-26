import type {
  AlertMetric,
  AlertRule,
  MarketOverviewResponse,
  TriggeredAlert,
} from '../types/market';
import { roundTo } from './indicators';

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'rule-support-inflow',
    name: '国家队宽基主力大额净流入预警',
    metric: 'total_net_inflow',
    operator: 'gt',
    threshold: 20,
    unit: '亿元',
    enabled: true,
    cooldownMinutes: 15,
  },
  {
    id: 'rule-s1-surge',
    name: '20只核心ETF盘中放量异动 (S1)',
    metric: 's1_volume_ratio',
    operator: 'gt',
    threshold: 1.8,
    unit: '倍',
    enabled: true,
    cooldownMinutes: 15,
  },
  {
    id: 'rule-star50-drop',
    name: '科创50指数跌幅异动提醒',
    metric: 'index_change_pct',
    targetCode: '000688',
    targetName: '科创50',
    operator: 'lt',
    threshold: -1.5,
    unit: '%',
    enabled: true,
    cooldownMinutes: 10,
  },
  {
    id: 'rule-dividend-inflow',
    name: '中证红利指数主力资金流入提醒',
    metric: 'index_net_inflow',
    targetCode: '000922',
    targetName: '中证红利',
    operator: 'gt',
    threshold: 5,
    unit: '亿元',
    enabled: true,
    cooldownMinutes: 15,
  },
  {
    id: 'rule-style-spread',
    name: '科创50 vs 中证红利风格分化超 2%',
    metric: 'star_dividend_spread',
    operator: 'lt',
    threshold: -2.0,
    unit: '%',
    enabled: true,
    cooldownMinutes: 20,
  },
  {
    id: 'rule-bull-bear-ratio',
    name: '创业板指/中证红利牛熊比值突破 0.45',
    metric: 'star_dividend_ratio',
    operator: 'gt',
    threshold: 0.45,
    unit: '',
    enabled: true,
    cooldownMinutes: 30,
  },
];

export const ALERT_METRIC_LABELS: Record<AlertMetric, { label: string; unit: string; needsTarget: 'none' | 'index' | 'etf' }> = {
  total_net_inflow: { label: '20只核心ETF合计主力净流入', unit: '亿元', needsTarget: 'none' },
  total_turnover: { label: '20只核心ETF合计成交额', unit: '亿元', needsTarget: 'none' },
  s1_volume_ratio: { label: '宽基ETF盘中放量倍数 (S1)', unit: '倍', needsTarget: 'none' },
  index_change_pct: { label: '指定指数涨跌幅', unit: '%', needsTarget: 'index' },
  index_net_inflow: { label: '指定指数主力净流入', unit: '亿元', needsTarget: 'index' },
  etf_net_inflow: { label: '单只ETF主力净流入', unit: '亿元', needsTarget: 'etf' },
  etf_change_pct: { label: '单只ETF涨跌幅', unit: '%', needsTarget: 'etf' },
  star_dividend_spread: { label: '创业板指减中证红利风格差', unit: '%', needsTarget: 'none' },
  star_dividend_ratio: { label: '创业板指(399006) / 中证红利牛熊比值', unit: '', needsTarget: 'none' },
};

export function extractRuleMetricValue(
  rule: AlertRule,
  overview: MarketOverviewResponse
): number | null {
  switch (rule.metric) {
    case 'total_net_inflow':
      return overview.summary.totalMainNetInflowYi;
    case 'total_turnover':
      return overview.summary.totalEtfTurnoverYi;
    case 's1_volume_ratio':
      return overview.summary.s1AnomalyRatio;
    case 'star_dividend_spread':
      return overview.summary.starVsDividendSpreadPct;
    case 'star_dividend_ratio':
      return overview.summary.starDividendRatio;
    case 'index_change_pct': {
      const idx = overview.indices.find((i) => i.code === rule.targetCode);
      return idx ? idx.changePct : null;
    }
    case 'index_net_inflow': {
      const idx = overview.indices.find((i) => i.code === rule.targetCode);
      return idx ? idx.mainNetInflowYi : null;
    }
    case 'etf_net_inflow': {
      const etf = overview.etfs.find((e) => e.code === rule.targetCode);
      return etf ? etf.mainNetInflowYi : null;
    }
    case 'etf_change_pct': {
      const etf = overview.etfs.find((e) => e.code === rule.targetCode);
      return etf ? etf.changePct : null;
    }
    default:
      return null;
  }
}

export function formatRuleCondition(rule: AlertRule): string {
  const meta = ALERT_METRIC_LABELS[rule.metric];
  const subject = rule.targetName
    ? `${rule.targetName}(${rule.targetCode}) ${meta.label.replace(/^指定(指数|单只ETF)/, '').replace(/^单只ETF/, '')}`
    : meta.label;
  const opText = rule.operator === 'gt' ? '≥' : '≤';
  return `${subject} ${opText} ${rule.threshold}${rule.unit}`;
}

/**
 * Pure rule evaluation engine with cooldown deduplication.
 * Returns newly triggered alerts and updated rules with refreshed `lastTriggeredAt`.
 */
export function evaluateAlertRules(
  rules: AlertRule[],
  overview: MarketOverviewResponse,
  nowMs: number,
  options?: { ignoreCooldown?: boolean }
): {
  triggered: TriggeredAlert[];
  updatedRules: AlertRule[];
} {
  const triggered: TriggeredAlert[] = [];
  const updatedRules: AlertRule[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      updatedRules.push(rule);
      continue;
    }

    const actual = extractRuleMetricValue(rule, overview);
    if (actual === null || !Number.isFinite(actual)) {
      updatedRules.push(rule);
      continue;
    }

    const matched =
      rule.operator === 'gt' ? actual >= rule.threshold : actual <= rule.threshold;

    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    const inCooldown =
      !options?.ignoreCooldown &&
      rule.lastTriggeredAt !== undefined &&
      nowMs - rule.lastTriggeredAt < cooldownMs;

    if (matched && !inCooldown) {
      const opWord = rule.operator === 'gt' ? '高于阈值' : '低于阈值';
      const roundedActual = roundTo(actual, rule.metric === 'star_dividend_ratio' ? 4 : 2);
      triggered.push({
        id: `alert-${rule.id}-${nowMs}`,
        ruleId: rule.id,
        ruleName: rule.name,
        message: `${formatRuleCondition(rule)} — 当前实测值 ${roundedActual}${rule.unit}（${opWord}）`,
        actualValue: roundedActual,
        threshold: rule.threshold,
        unit: rule.unit,
        severity:
          rule.metric === 'total_net_inflow' || rule.metric === 's1_volume_ratio'
            ? 'high'
            : 'medium',
        triggeredAt: new Date(nowMs).toISOString(),
        read: false,
      });
      updatedRules.push({ ...rule, lastTriggeredAt: nowMs });
    } else {
      updatedRules.push(rule);
    }
  }

  return { triggered, updatedRules };
}
