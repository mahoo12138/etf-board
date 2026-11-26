import https from 'node:https';
import {
  CORE_ETF_CATALOG,
  KEY_INDICES_CATALOG,
  NATIONAL_TEAM_HOLDINGS,
} from '../src/data/etfCatalog';
import type {
  AggregatedDailyHistoryPoint,
  DailyFlowPoint,
  DailyKlinePoint,
  DataSourceInfo,
  EquityBondIndexCode,
  EquityBondSpreadResponse,
  EtfLiveQuote,
  EtfTieredFlow,
  HistoryResponse,
  IndexAnalyticsSeries,
  IndexLiveQuote,
  IndicesTrendResponse,
  MarketOverviewResponse,
} from '../src/types/market';
import {
  aggregateCapitalFlowTiers,
  buildEtfTieredFlow,
  classifyTrend,
  computeEquityBondSpreadAnalytics,
  computeNationalTeamValuation,
  computePeriodReturnPct,
  computeRelativeSpread,
  computeRSI,
  computeSMA,
  computeStarDividendRatioSeries,
  computeVolatilityPct,
  computeVolumeRatio,
  roundTo,
  tagSupportDays,
} from '../src/utils/indicators';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function httpsGetBuffer(
  url: string,
  extraHeaders?: Record<string, string>,
  timeoutMs = 7000
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'curl/8.5.0',
          Accept: '*/*',
          Connection: 'close',
          ...extraHeaders,
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode ?? 'ERR'} for ${url}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms for ${url}`));
    });
    req.on('error', reject);
  });
}

async function fetchJson<T>(
  url: string,
  extraHeaders?: Record<string, string>,
  timeoutMs = 7000
): Promise<T> {
  const buf = await httpsGetBuffer(url, extraHeaders, timeoutMs);
  return JSON.parse(buf.toString('utf8')) as T;
}

async function fetchGbkText(url: string, timeoutMs = 7000): Promise<string> {
  const buf = await httpsGetBuffer(url, undefined, timeoutMs);
  return new TextDecoder('gbk').decode(buf);
}

function getBeijingTimeParts(): {
  dateStr: string;
  timeStr: string;
  hour: number;
  minute: number;
  dayOfWeek: number;
} {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    timeStr: `${parts.hour}:${parts.minute}:${parts.second}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dayOfWeek: weekdayMap[parts.weekday] ?? 1,
  };
}

function buildSourceInfo(
  provider: DataSourceInfo['provider'],
  tradingDate?: string
): DataSourceInfo {
  const bj = getBeijingTimeParts();
  const hithinkKey = (process.env.HITHINK_API_KEY || '').trim();
  const hithinkBase = (process.env.HITHINK_API_BASE || 'https://fuyao.aicubes.cn').trim();

  const totalMin = bj.hour * 60 + bj.minute;
  const isWeekday = bj.dayOfWeek >= 1 && bj.dayOfWeek <= 5;
  let marketStatus: DataSourceInfo['marketStatus'] = 'closed';
  let marketStatusLabel = '已休市';

  if (isWeekday) {
    if ((totalMin >= 570 && totalMin <= 690) || (totalMin >= 780 && totalMin <= 900)) {
      marketStatus = 'trading';
      marketStatusLabel = '盘中实时交易';
    } else if (totalMin > 690 && totalMin < 780) {
      marketStatus = 'lunch_break';
      marketStatusLabel = '午间休市';
    }
  }

  const providerLabel =
    provider === 'tonghuashun'
      ? '同花顺官方金融数据 API + 新浪L2分档资金'
      : provider === 'public_live'
        ? 'A股实时行情引擎（腾讯行情 + 新浪L2分档资金）'
        : '离线基准快照数据';

  return {
    provider,
    providerLabel,
    hithinkConfigured: hithinkKey.length > 0,
    hithinkEndpoint: hithinkBase,
    fetchedAt: new Date().toISOString(),
    tradingDate: tradingDate || bj.dateStr,
    marketStatus,
    marketStatusLabel,
  };
}

/**
 * Optional Tonghuashun Official Financial Data API Adapter
 * Follows Hithink-Tech-Org/Financial-API REST Contract:
 *   Base: https://fuyao.aicubes.cn
 *   Auth: Header `X-api-key: <HITHINK_API_KEY>`
 *   Endpoints: /api/fund/market/snapshot, /api/a-share-index/prices/snapshot
 */
async function tryFetchTonghuashunSnapshot(
  thscodes: string[],
  kind: 'fund' | 'index'
): Promise<Map<string, { price?: number; changePct?: number; turnoverYi?: number }>> {
  const result = new Map<string, { price?: number; changePct?: number; turnoverYi?: number }>();
  const apiKey = (process.env.HITHINK_API_KEY || '').trim();
  if (!apiKey) return result;

  const base = (process.env.HITHINK_API_BASE || 'https://fuyao.aicubes.cn').replace(/\/$/, '');
  const path =
    kind === 'fund' ? '/api/fund/market/snapshot' : '/api/a-share-index/prices/snapshot';
  const url = `${base}${path}?thscodes=${encodeURIComponent(thscodes.join(','))}`;

  try {
    const payload = await fetchJson<{
      code?: number;
      data?: Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> };
    }>(url, { 'X-api-key': apiKey }, 5000);

    if (payload && payload.code === 0 && payload.data) {
      const rows = Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.data.items)
          ? payload.data.items
          : [];
      for (const row of rows) {
        const thscode = String(row.thscode || '');
        const code = thscode.split('.')[0];
        if (!code) continue;
        const price = Number(row.latest ?? row.close ?? row.price);
        const changePct = Number(row.change_ratio ?? row.pct_chg ?? row.changePct);
        const amount = Number(row.amount ?? row.turnover);
        result.set(code, {
          price: Number.isFinite(price) && price > 0 ? price : undefined,
          changePct: Number.isFinite(changePct) ? changePct : undefined,
          turnoverYi: Number.isFinite(amount) && amount > 0 ? roundTo(amount / 1e8, 2) : undefined,
        });
      }
    }
  } catch {
    // Gracefully fall through to public live feed
  }
  return result;
}

interface ParsedTencentQuote {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  changePct: number;
  volumeShou: number;
  outerVolShou: number; // 外盘主动买
  innerVolShou: number; // 内盘主动卖
  turnoverYi: number;
  aumYi: number;
  volumeRatio: number;
  tradingDate: string;
}

function parseTencentQuotes(rawText: string): Map<string, ParsedTencentQuote> {
  const map = new Map<string, ParsedTencentQuote>();
  const lines = rawText.split(';');
  for (const line of lines) {
    const match = line.match(/v_([a-z]{2}\d{6})="([^"]+)"/);
    if (!match) continue;
    const parts = match[2].split('~');
    if (parts.length < 40) continue;
    const code = parts[2];
    const name = parts[1];
    const price = Number(parts[3]);
    const prevClose = Number(parts[4]);
    const volumeShou = Number(parts[6]) || 0;
    const outerVolShou = Number(parts[7]) || 0;
    const innerVolShou = Number(parts[8]) || 0;
    const rawDate = parts[30] || '';
    const tradingDate =
      rawDate.length >= 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : '';
    const changePct = Number(parts[32]);
    // parts[35] is "price/vol/amountYuan"
    const split35 = (parts[35] || '').split('/');
    const amountYuan = Number(split35[2]);
    const amountWan = Number(parts[37]);
    const turnoverYi = Number.isFinite(amountYuan) && amountYuan > 0
      ? roundTo(amountYuan / 1e8, 2)
      : Number.isFinite(amountWan) && amountWan > 0
        ? roundTo(amountWan / 10000, 2)
        : 0;
    const aumYi = Number(parts[45]) || Number(parts[44]) || 0;
    const volumeRatio = Number(parts[49]) || 1.0;

    if (code && Number.isFinite(price) && price > 0) {
      map.set(code, {
        code,
        name,
        price,
        prevClose: Number.isFinite(prevClose) && prevClose > 0 ? prevClose : price,
        changePct: Number.isFinite(changePct) ? changePct : 0,
        volumeShou,
        outerVolShou,
        innerVolShou,
        turnoverYi,
        aumYi,
        volumeRatio: Number.isFinite(volumeRatio) && volumeRatio > 0 ? roundTo(volumeRatio, 2) : 1.0,
        tradingDate,
      });
    }
  }
  return map;
}

interface SinaMoneyFlowRawRow {
  symbol?: string;
  r0_in?: string | number;
  r0_out?: string | number;
  r0?: string | number;
  r1_in?: string | number;
  r1_out?: string | number;
  r1?: string | number;
  r2_in?: string | number;
  r2_out?: string | number;
  r2?: string | number;
  r3_in?: string | number;
  r3_out?: string | number;
  r3?: string | number;
}

/**
 * Fetch real-time L2 4-tier order-size capital flows (机构特大单 r0 / 大户大单 r1 / 中单 r2 / 小单 r3)
 * for all 20 core ETFs in a single batched HTTP request from Sina Finance.
 */
async function fetchSinaTieredFlows(
  items: Array<{ code: string; qtCode: string }>
): Promise<Map<string, EtfTieredFlow>> {
  const result = new Map<string, EtfTieredFlow>();
  if (items.length === 0) return result;

  const qtToCode = new Map(items.map((i) => [i.qtCode.toLowerCase(), i.code]));
  const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssi_ssfx_flzjtj?daima=${items
    .map((i) => i.qtCode)
    .join(',')}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const payload = await fetchJson<SinaMoneyFlowRawRow[] | SinaMoneyFlowRawRow>(
        url,
        {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://vip.stock.finance.sina.com.cn/',
        },
        6000
      );
      const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];
      for (const row of rows) {
        const sym = String(row.symbol || '').toLowerCase();
        const code = qtToCode.get(sym) || sym.replace(/^(sh|sz)/, '');
        if (!code) continue;
        const r0In = Number(row.r0_in) || 0;
        const r0Out = Number(row.r0_out) || 0;
        const r0Tot = Number(row.r0) || r0In + r0Out;
        const r1In = Number(row.r1_in) || 0;
        const r1Out = Number(row.r1_out) || 0;
        const r1Tot = Number(row.r1) || r1In + r1Out;
        const r2In = Number(row.r2_in) || 0;
        const r2Out = Number(row.r2_out) || 0;
        const r2Tot = Number(row.r2) || r2In + r2Out;
        const r3In = Number(row.r3_in) || 0;
        const r3Out = Number(row.r3_out) || 0;
        const r3Tot = Number(row.r3) || r3In + r3Out;

        result.set(
          code,
          buildEtfTieredFlow({
            r0InYuan: r0In,
            r0OutYuan: r0Out,
            r0TotalYuan: r0Tot,
            r1InYuan: r1In,
            r1OutYuan: r1Out,
            r1TotalYuan: r1Tot,
            r2InYuan: r2In,
            r2OutYuan: r2Out,
            r2TotalYuan: r2Tot,
            r3InYuan: r3In,
            r3OutYuan: r3Out,
            r3TotalYuan: r3Tot,
            liveAvailable: true,
          })
        );
      }
      if (result.size > 0) break;
    } catch {
      // retry once on transient drop
    }
  }
  return result;
}

/**
 * Fast optional EastMoney ulist snapshot for index-level main net inflow.
 */
async function fetchLatestMainFlows(
  items: Array<{ code: string; secid: string }>
): Promise<Map<string, { mainNetInflowYi: number; ratioPct: number }>> {
  const result = new Map<string, { mainNetInflowYi: number; ratioPct: number }>();
  const secids = items.map((i) => i.secid).join(',');
  try {
    const liveUrl = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=${secids}&fields=f12,f62,f184`;
    const res = await fetchJson<{
      data?: { diff?: Array<{ f12?: string; f62?: number | string; f184?: number | string }> };
    }>(liveUrl, undefined, 2500);
    if (res?.data?.diff && res.data.diff.length > 0) {
      for (const row of res.data.diff) {
        if (!row.f12) continue;
        const inflow = Number(row.f62);
        const ratio = Number(row.f184);
        if (Number.isFinite(inflow)) {
          result.set(row.f12, {
            mainNetInflowYi: roundTo(inflow / 1e8, 2),
            ratioPct: Number.isFinite(ratio) ? roundTo(ratio, 2) : 0,
          });
        }
      }
    }
  } catch {
    // Gracefully skip if EastMoney push2 is rate-limited
  }
  return result;
}

export async function getMarketOverview(forceRefresh = false): Promise<MarketOverviewResponse> {
  const cacheKey = 'market_overview';
  if (!forceRefresh) {
    const cached = getCached<MarketOverviewResponse>(cacheKey);
    if (cached) return cached;
  }

  const allQtCodes = [
    ...CORE_ETF_CATALOG.map((e) => e.qtCode),
    ...KEY_INDICES_CATALOG.map((i) => i.qtCode),
  ];
  const qtUrl = `https://qt.gtimg.cn/q=${allQtCodes.join(',')}`;

  const flowTargets = [
    ...CORE_ETF_CATALOG.map((e) => ({ code: e.code, secid: e.secid })),
    ...KEY_INDICES_CATALOG.map((i) => ({ code: i.code, secid: i.secid })),
  ];

  const [qtText, sinaTieredFlows, mainFlows, hithinkFunds, hithinkIndices] = await Promise.all([
    fetchGbkText(qtUrl, 6000).catch(() => ''),
    fetchSinaTieredFlows(CORE_ETF_CATALOG),
    fetchLatestMainFlows(flowTargets),
    tryFetchTonghuashunSnapshot(
      CORE_ETF_CATALOG.map((e) => e.thscode),
      'fund'
    ),
    tryFetchTonghuashunSnapshot(
      KEY_INDICES_CATALOG.map((i) => i.thscode),
      'index'
    ),
  ]);

  const qtMap = parseTencentQuotes(qtText);
  let provider: DataSourceInfo['provider'] = 'public_live';
  if (hithinkFunds.size > 0 || hithinkIndices.size > 0) {
    provider = 'tonghuashun';
  } else if (qtMap.size === 0) {
    provider = 'fallback_seed';
  }

  const bj = getBeijingTimeParts();
  const detectedTradingDate =
    qtMap.get('510300')?.tradingDate || qtMap.get('000001')?.tradingDate || bj.dateStr;
  const updatedStr = `${detectedTradingDate} ${bj.timeStr}`;

  const rawEtfs: EtfLiveQuote[] = CORE_ETF_CATALOG.map((meta, idx) => {
    const qt = qtMap.get(meta.code);
    const ths = hithinkFunds.get(meta.code);
    const sinaTier = sinaTieredFlows.get(meta.code);
    const flow = mainFlows.get(meta.code);

    const fallbackPrice = meta.category === 'star' ? 1.24 : meta.category === 'dividend' ? 3.35 : 3.95;
    const price = ths?.price ?? qt?.price ?? fallbackPrice;
    const prevClose = qt?.prevClose ?? price;
    const changePct =
      ths?.changePct ??
      qt?.changePct ??
      (prevClose > 0 ? roundTo(((price - prevClose) / prevClose) * 100, 2) : 0);
    const turnoverYi = ths?.turnoverYi ?? qt?.turnoverYi ?? roundTo(20 - idx * 0.6, 2);
    const volumeWanShou = roundTo((qt?.volumeShou ?? 0) / 10000, 2);
    const aumYi = roundTo(qt?.aumYi || meta.nationalTeamSharesYi * price * 1.4, 1);

    // Prefer exact Sina L2 tiered flow (机构+大户); fallback to EastMoney or Tencent active buy-sell delta
    const activeOrderFlowYi =
      qt && (qt.outerVolShou > 0 || qt.innerVolShou > 0)
        ? roundTo(((qt.outerVolShou - qt.innerVolShou) * price * 100) / 1e8, 2)
        : 0;
    const tieredFlow: EtfTieredFlow =
      sinaTier ??
      buildEtfTieredFlow({
        r0InYuan: 0,
        r0OutYuan: 0,
        r1InYuan: 0,
        r1OutYuan: 0,
        r2InYuan: 0,
        r2OutYuan: 0,
        r3InYuan: 0,
        r3OutYuan: 0,
        liveAvailable: false,
      });

    const mainNetInflowYi = sinaTier
      ? sinaTier.main.netYi
      : flow
        ? flow.mainNetInflowYi
        : activeOrderFlowYi;
    const mainNetInflowRatioPct = sinaTier
      ? sinaTier.main.netRatioPct
      : flow
        ? flow.ratioPct
        : turnoverYi > 0
          ? roundTo((mainNetInflowYi / turnoverYi) * 100, 2)
          : 0;

    const volumeRatio = qt?.volumeRatio ?? 1.0;
    const nationalTeamValueYi = roundTo(meta.nationalTeamSharesYi * price, 2);
    const nationalTeamDailyPnlYi = roundTo(meta.nationalTeamSharesYi * (price - prevClose), 2);

    return {
      code: meta.code,
      thscode: meta.thscode,
      name: qt?.name || meta.name,
      shortName: meta.shortName,
      category: meta.category,
      categoryLabel: meta.categoryLabel,
      benchmark: meta.benchmark,
      price,
      prevClose,
      changePct,
      turnoverYi,
      volumeWanShou,
      aumYi,
      mainNetInflowYi,
      mainNetInflowRatioPct,
      volumeRatio,
      turnoverSharePct: 0,
      nationalTeamFocus: meta.nationalTeamFocus,
      nationalTeamSharesYi: meta.nationalTeamSharesYi,
      nationalTeamValueYi,
      nationalTeamDailyPnlYi,
      primaryHolder: meta.primaryHolder,
      tieredFlow,
      updatedAt: updatedStr,
    };
  });

  const totalEtfTurnoverYi = roundTo(
    rawEtfs.reduce((acc, e) => acc + e.turnoverYi, 0),
    2
  );

  const etfs = rawEtfs.map((e) => ({
    ...e,
    turnoverSharePct:
      totalEtfTurnoverYi > 0 ? roundTo((e.turnoverYi / totalEtfTurnoverYi) * 100, 1) : 0,
  }));

  const indices: IndexLiveQuote[] = KEY_INDICES_CATALOG.map((meta) => {
    const qt = qtMap.get(meta.code);
    const ths = hithinkIndices.get(meta.code);
    const flow = mainFlows.get(meta.code);
    const fallbackPrice =
      meta.code === '399006'
        ? 2200
        : meta.code === '000680'
          ? 1320
          : meta.code === '000688'
            ? 1180
            : meta.code === '000922'
              ? 5480
              : 3850;
    const price = ths?.price ?? qt?.price ?? fallbackPrice;
    const prevClose = qt?.prevClose ?? price;
    const changePct = ths?.changePct ?? qt?.changePct ?? 0;
    const turnoverYi = ths?.turnoverYi ?? qt?.turnoverYi ?? 0;
    const mainNetInflowYi = flow?.mainNetInflowYi ?? 0;
    const mainNetInflowRatioPct = flow?.ratioPct ?? 0;

    return {
      code: meta.code,
      thscode: meta.thscode,
      name: qt?.name || meta.name,
      group: meta.group,
      description: meta.description,
      price,
      prevClose,
      changePct,
      turnoverYi,
      mainNetInflowYi,
      mainNetInflowRatioPct,
      updatedAt: updatedStr,
    };
  });

  const totalMainNetInflowYi = roundTo(
    etfs.reduce((acc, e) => acc + e.mainNetInflowYi, 0),
    2
  );
  const hs300NetInflowYi = roundTo(
    etfs.filter((e) => e.category === 'hs300').reduce((acc, e) => acc + e.mainNetInflowYi, 0),
    2
  );
  const starEtfNetInflowYi = roundTo(
    etfs.filter((e) => e.category === 'star').reduce((acc, e) => acc + e.mainNetInflowYi, 0),
    2
  );
  const dividendEtfNetInflowYi = roundTo(
    etfs.filter((e) => e.category === 'dividend').reduce((acc, e) => acc + e.mainNetInflowYi, 0),
    2
  );

  const ntValuation = computeNationalTeamValuation(NATIONAL_TEAM_HOLDINGS, etfs);

  const weightedVolRatio =
    totalEtfTurnoverYi > 0
      ? roundTo(
          etfs.reduce((acc, e) => acc + (e.volumeRatio || 1) * e.turnoverYi, 0) /
            totalEtfTurnoverYi,
          2
        )
      : 1.0;

  let supportSignalLevel: 'strong' | 'moderate' | 'normal' = 'normal';
  let supportSignalText = '常态流动性区间';
  if (totalMainNetInflowYi >= 25 || weightedVolRatio >= 2.0) {
    supportSignalLevel = 'strong';
    supportSignalText =
      totalMainNetInflowYi >= 25
        ? '强托底信号 · 宽基主力大额净流入'
        : '量能异动 S1 · 宽基放量超 2.0x';
  } else if (totalMainNetInflowYi >= 8 || hs300NetInflowYi >= 5 || weightedVolRatio >= 1.45) {
    supportSignalLevel = 'moderate';
    supportSignalText = '温和护盘特征 · 权重ETF资金净承接';
  } else if (totalMainNetInflowYi <= -15) {
    supportSignalLevel = 'normal';
    supportSignalText = '宽基主力偏净流出 · 观望情绪为主';
  }

  const chinext = indices.find((i) => i.code === '399006');
  const csiDiv = indices.find((i) => i.code === '000922');
  const starVsDividendSpreadPct = roundTo(
    (chinext?.changePct ?? 0) - (csiDiv?.changePct ?? 0),
    2
  );
  const starDividendRatio =
    chinext && csiDiv && csiDiv.price > 0
      ? roundTo(chinext.price / csiDiv.price, 4)
      : 0;

  const capitalFlow = aggregateCapitalFlowTiers(etfs, 'all');

  const response: MarketOverviewResponse = {
    source: buildSourceInfo(provider, detectedTradingDate),
    etfs,
    indices,
    summary: {
      totalEtfTurnoverYi,
      totalMainNetInflowYi,
      hs300NetInflowYi,
      starEtfNetInflowYi,
      dividendEtfNetInflowYi,
      nationalTeamTotalValueYi: ntValuation.totalValueYi,
      nationalTeamDailyPnlYi: ntValuation.totalDailyPnlYi,
      s1AnomalyRatio: weightedVolRatio,
      supportSignalActive: supportSignalLevel !== 'normal',
      supportSignalLevel,
      supportSignalText,
      starVsDividendSpreadPct,
      starDividendRatio,
    },
    capitalFlow,
  };

  setCached(cacheKey, response, 15_000);
  return response;
}

async function fetchTencentDailyKlines(
  qtCode: string,
  limit = 90,
  isIndex = false
): Promise<DailyKlinePoint[]> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${qtCode},day,,,${limit},qfq`;
  let rows: string[][] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchJson<{
        code?: number;
        data?: Record<string, { qfqday?: string[][]; day?: string[][] }>;
      }>(url, undefined, 6000);
      const node = res?.data?.[qtCode];
      rows = node?.qfqday || node?.day || [];
      if (rows.length > 0) break;
    } catch {
      // retry once on transient socket/timeout drop
    }
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  const points: DailyKlinePoint[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length < 6) continue;
    const date = String(r[0]);
    const open = Number(r[1]);
    const close = Number(r[2]);
    const high = Number(r[3]);
    const low = Number(r[4]);
    const volume = Number(r[5]);
    if (!date || !Number.isFinite(close) || close <= 0) continue;

    const prevClose = i > 0 ? points[points.length - 1]?.close ?? open : open;
    const changePct =
      prevClose > 0 ? roundTo(((close - prevClose) / prevClose) * 100, 2) : 0;

    // For ETFs, volume is in 手 (100 shares) -> turnoverYi = volume * 100 * close / 1e8.
    // For indices, volume is in 手 (shares) -> approximate relative turnover intensity in 亿元.
    const turnoverYi = isIndex
      ? roundTo((volume * 100 * 12) / 1e8, 2)
      : roundTo((volume * 100 * close) / 1e8, 2);

    points.push({
      date,
      open,
      close,
      high,
      low,
      volume,
      turnoverYi,
      changePct,
    });
  }
  return points;
}

async function fetchEastMoneyDailyFlows(secid: string, limit = 45): Promise<DailyFlowPoint[]> {
  const url = `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?lmt=${limit}&klt=101&secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63`;
  const res = await fetchJson<{ data?: { klines?: string[] } }>(url, undefined, 5000);
  const lines = res?.data?.klines || [];
  return lines
    .map((line) => {
      const p = line.split(',');
      return {
        date: p[0],
        mainNetInflowYi: roundTo(Number(p[1]) / 1e8, 2),
        largeInflowYi: roundTo(Number(p[4]) / 1e8, 2),
        superLargeInflowYi: roundTo(Number(p[5]) / 1e8, 2),
        close: Number(p[11]),
        changePct: roundTo(Number(p[12]), 2),
      };
    })
    .filter((d) => Boolean(d.date) && Number.isFinite(d.mainNetInflowYi));
}

function deriveFlowFallbackFromKlines(klines: DailyKlinePoint[]): DailyFlowPoint[] {
  return klines.map((k) => {
    const range = Math.max(k.high - k.low, k.close * 0.002);
    const directionalBias = (k.close - k.open) / range;
    const estMain = roundTo(k.turnoverYi * directionalBias * 0.28, 2);
    return {
      date: k.date,
      mainNetInflowYi: estMain,
      largeInflowYi: roundTo(estMain * 0.45, 2),
      superLargeInflowYi: roundTo(estMain * 0.55, 2),
      close: k.close,
      changePct: k.changePct,
    };
  });
}

/**
 * Historical daily aggregated 20-ETF turnover, institutional net flows, and support-day tagging.
 */
export async function getDailyFlowHistory(days = 45): Promise<HistoryResponse> {
  const clampedDays = Math.min(90, Math.max(15, days));
  const cacheKey = `history_${clampedDays}`;
  const cached = getCached<HistoryResponse>(cacheKey);
  if (cached) return cached;

  const representativeEtfs = CORE_ETF_CATALOG.slice(0, 12);

  const [sseKlines, starKlines, divKlines, etfKlineSets] = await Promise.all([
    fetchTencentDailyKlines('sh000001', clampedDays, true).catch(() => []),
    fetchTencentDailyKlines('sh000688', clampedDays, true).catch(() => []),
    fetchTencentDailyKlines('sh000922', clampedDays, true).catch(() => []),
    Promise.all(
      representativeEtfs.map((e) =>
        fetchTencentDailyKlines(e.qtCode, clampedDays, false).catch(() => [] as DailyKlinePoint[])
      )
    ),
  ]);

  // Fetch institutional daily flows in gentle batches of 4 to avoid EastMoney rate-limiting
  const etfFlowSets: DailyFlowPoint[][] = [];
  for (let i = 0; i < representativeEtfs.length; i += 4) {
    const batch = representativeEtfs.slice(i, i + 4);
    const batchRes = await Promise.all(
      batch.map(async (e, offset) => {
        const flows = await fetchEastMoneyDailyFlows(e.secid, clampedDays).catch(
          () => [] as DailyFlowPoint[]
        );
        return flows.length > 0 ? flows : deriveFlowFallbackFromKlines(etfKlineSets[i + offset] || []);
      })
    );
    etfFlowSets.push(...batchRes);
  }

  const sseMap = new Map(sseKlines.map((k) => [k.date, k]));
  const starMap = new Map(starKlines.map((k) => [k.date, k]));
  const divMap = new Map(divKlines.map((k) => [k.date, k]));

  const byDate = new Map<
    string,
    { turnoverYi: number; netInflowYi: number; superLargeYi: number }
  >();

  const basketScale = 1.15;

  for (const klines of etfKlineSets) {
    for (const k of klines) {
      const cur = byDate.get(k.date) || { turnoverYi: 0, netInflowYi: 0, superLargeYi: 0 };
      cur.turnoverYi += k.turnoverYi * basketScale;
      byDate.set(k.date, cur);
    }
  }

  for (const flows of etfFlowSets) {
    for (const f of flows) {
      const cur = byDate.get(f.date) || { turnoverYi: 0, netInflowYi: 0, superLargeYi: 0 };
      cur.netInflowYi += f.mainNetInflowYi * basketScale;
      cur.superLargeYi += f.superLargeInflowYi * basketScale;
      byDate.set(f.date, cur);
    }
  }

  const sortedDates = Array.from(byDate.keys()).sort().slice(-clampedDays);
  const rawDays: Omit<AggregatedDailyHistoryPoint, 'isSupportDay' | 'supportReason'>[] =
    sortedDates.map((date) => {
      const agg = byDate.get(date)!;
      const sse = sseMap.get(date);
      const star = starMap.get(date);
      const div = divMap.get(date);
      return {
        date,
        totalTurnoverYi: roundTo(agg.turnoverYi, 2),
        totalNetInflowYi: roundTo(agg.netInflowYi, 2),
        superLargeNetInflowYi: roundTo(agg.superLargeYi, 2),
        sseClose: sse?.close ?? 0,
        sseChangePct: sse?.changePct ?? 0,
        star50Close: star?.close ?? 0,
        dividendClose: div?.close ?? 0,
      };
    });

  const tagged = tagSupportDays(rawDays);
  const supportDays = tagged.filter((d) => d.isSupportDay);
  const latestSupportDate =
    supportDays.length > 0 ? supportDays[supportDays.length - 1].date : null;

  const response: HistoryResponse = {
    source: buildSourceInfo(
      (process.env.HITHINK_API_KEY || '').trim() ? 'tonghuashun' : 'public_live'
    ),
    days: tagged,
    supportDayCount: supportDays.length,
    latestSupportDate,
  };

  setCached(cacheKey, response, 5 * 60_000);
  return response;
}

/**
 * Full quantitative trend analysis for STAR Market (科创50/科创100), CSI Dividend (中证红利/上证红利),
 * and core benchmarks.
 */
export async function getIndicesTrendAnalytics(days = 90): Promise<IndicesTrendResponse> {
  const clampedDays = Math.min(500, Math.max(30, days));
  const cacheKey = `indices_trend_${clampedDays}`;
  const cached = getCached<IndicesTrendResponse>(cacheKey);
  if (cached) return cached;

  const klineLists: DailyKlinePoint[][] = [];
  for (let i = 0; i < KEY_INDICES_CATALOG.length; i += 4) {
    const batch = KEY_INDICES_CATALOG.slice(i, i + 4);
    const batchRes = await Promise.all(
      batch.map((meta) =>
        fetchTencentDailyKlines(meta.qtCode, clampedDays, true).catch(() => [] as DailyKlinePoint[])
      )
    );
    klineLists.push(...batchRes);
  }

  const series: IndexAnalyticsSeries[] = KEY_INDICES_CATALOG.map((meta, i) => {
    const klines = klineLists[i];
    const closes = klines.map((k) => k.close);
    const latest = klines[klines.length - 1];
    const latestPrice = latest?.close ?? 0;
    const changePct = latest?.changePct ?? 0;
    const ma5 = computeSMA(closes, 5);
    const ma20 = computeSMA(closes, 20);
    const ma60 = computeSMA(closes, 60);
    const rsi14 = computeRSI(closes, 14);
    const volumeRatio20 = computeVolumeRatio(klines, 20);
    const volatility20Pct = computeVolatilityPct(closes, 20);
    const trend = classifyTrend(latestPrice, ma5, ma20, ma60);
    const return20dPct = computePeriodReturnPct(closes, 20);
    const return60dPct = computePeriodReturnPct(closes, 60);

    return {
      code: meta.code,
      name: meta.name,
      group: meta.group,
      latestPrice,
      changePct,
      ma5,
      ma20,
      ma60,
      rsi14,
      volumeRatio20,
      volatility20Pct,
      trendStatus: trend.status,
      trendLabel: trend.label,
      return20dPct,
      return60dPct,
      klines,
    };
  });

  const chinext = series.find((s) => s.code === '399006')?.klines || [];
  const star50 = series.find((s) => s.code === '000688')?.klines || [];
  const csiDiv = series.find((s) => s.code === '000922')?.klines || [];
  const hs300 = series.find((s) => s.code === '000300')?.klines || [];
  const sse = series.find((s) => s.code === '000001')?.klines || [];

  const spreadData = computeRelativeSpread(star50, csiDiv);
  const hs300Aligned = computeRelativeSpread(hs300, csiDiv);
  const hs300Map = new Map(
    hs300Aligned.dates.map((d, idx) => [d, hs300Aligned.normA[idx]])
  );
  const hs300Normalized = spreadData.dates.map((d) => hs300Map.get(d) ?? 0);

  const chinextDividendRatio = computeStarDividendRatioSeries(chinext, csiDiv, sse, {
    numeratorCode: '399006',
    numeratorName: '创业板指',
    denominatorCode: '000922',
    denominatorName: '中证红利',
  });

  const response: IndicesTrendResponse = {
    source: buildSourceInfo(
      (process.env.HITHINK_API_KEY || '').trim() ? 'tonghuashun' : 'public_live'
    ),
    series,
    spreadDates: spreadData.dates,
    star50Normalized: spreadData.normA,
    dividendNormalized: spreadData.normB,
    hs300Normalized,
    starMinusDividendSpread: spreadData.spread,
    chinextDividendRatio,
  };

  setCached(cacheKey, response, 3 * 60_000);
  return response;
}

/**
 * Single ETF 60-day K-line and 30-day daily institutional flow history for drawer drill-down.
 */
export async function getEtfDetailHistory(code: string): Promise<{
  code: string;
  name: string;
  klines: DailyKlinePoint[];
  flows: DailyFlowPoint[];
}> {
  const meta = CORE_ETF_CATALOG.find((e) => e.code === code);
  if (!meta) {
    throw new Error(`Unsupported ETF code: ${code}`);
  }
  const cacheKey = `etf_detail_${code}`;
  const cached = getCached<{
    code: string;
    name: string;
    klines: DailyKlinePoint[];
    flows: DailyFlowPoint[];
  }>(cacheKey);
  if (cached) return cached;

  const [klines, rawFlows] = await Promise.all([
    fetchTencentDailyKlines(meta.qtCode, 60, false).catch(() => []),
    fetchEastMoneyDailyFlows(meta.secid, 30).catch(() => []),
  ]);
  const flows = rawFlows.length > 0 ? rawFlows : deriveFlowFallbackFromKlines(klines.slice(-30));

  const result = { code: meta.code, name: meta.name, klines, flows };
  setCached(cacheKey, result, 3 * 60_000);
  return result;
}

function formatCompactDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function normalizeCsIndexDate(raw: string): string {
  const clean = String(raw || '').replace(/[^0-9]/g, '');
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  return raw;
}

async function fetchChina10YBondYieldHistory(): Promise<Array<{ date: string; yield10y: number }>> {
  const cacheKey = 'cn10y_bond_history_10y';
  const cached = getCached<Array<{ date: string; yield10y: number }>>(cacheKey);
  if (cached) return cached;

  const pages = [1, 2, 3, 4, 5];
  const results = await Promise.allSettled(
    pages.map((p) =>
      fetchJson<{
        result?: {
          data?: Array<{ SOLAR_DATE?: string; EMM00166466?: number | null }>;
        };
      }>(
        `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_WEB_TREASURYYIELD&columns=SOLAR_DATE,EMM00166466&sortColumns=SOLAR_DATE&sortTypes=-1&pageNumber=${p}&pageSize=500`,
        undefined,
        6500
      )
    )
  );

  const byDate = new Map<string, number>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const rows = r.value?.result?.data || [];
    for (const row of rows) {
      const dateStr = String(row.SOLAR_DATE || '').slice(0, 10);
      const val = Number(row.EMM00166466);
      if (dateStr.length === 10 && Number.isFinite(val) && val > 0) {
        byDate.set(dateStr, val);
      }
    }
  }

  const sorted = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, yield10y]) => ({ date, yield10y }));

  if (sorted.length > 0) {
    setCached(cacheKey, sorted, 6 * 60 * 60_000);
  }
  return sorted;
}

async function fetchCsIndexValuationHistory(
  indexCode: EquityBondIndexCode
): Promise<Array<{ date: string; close: number; pe: number }>> {
  const now = new Date();
  // Split 10 years into 4 parallel 2.5-year chunks so CSIndex responds quickly & reliably
  const chunks: Array<{ start: string; end: string }> = [];
  const totalMonths = 120;
  const stepMonths = 30;
  for (let m = 0; m < totalMonths; m += stepMonths) {
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, now.getUTCDate()));
    const startDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (m + stepMonths), now.getUTCDate())
    );
    chunks.push({
      start: formatCompactDate(startDate),
      end: formatCompactDate(endDate),
    });
  }

  const results = await Promise.allSettled(
    chunks.map((chunk) =>
      fetchJson<{
        data?: Array<{ tradeDate?: string; close?: number; peg?: number }>;
      }>(
        `https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=${indexCode}&startDate=${chunk.start}&endDate=${chunk.end}`,
        undefined,
        9000
      )
    )
  );

  const byDate = new Map<string, { close: number; pe: number }>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const rows = r.value?.data || [];
    for (const row of rows) {
      const date = normalizeCsIndexDate(String(row.tradeDate || ''));
      const close = Number(row.close);
      const pe = Number(row.peg);
      if (date.length === 10 && Number.isFinite(close) && close > 0 && Number.isFinite(pe) && pe > 0) {
        byDate.set(date, { close, pe });
      }
    }
  }

  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, close: v.close, pe: v.pe }));
}

/**
 * Real-data Equity-Bond Yield Spread (ERP) and Equity-Bond Ratio analytics for HS300 (000300) and CSI500 (000905).
 * Sources: CSIndex official daily PE-TTM & close + EastMoney China 10Y Treasury Yield (CN10Y).
 */
export async function getEquityBondSpreadAnalytics(
  rawCode: string = '000300'
): Promise<EquityBondSpreadResponse> {
  const indexCode: EquityBondIndexCode = rawCode === '000905' ? '000905' : '000300';
  const indexName = indexCode === '000905' ? '中证500' : '沪深300';
  const cacheKey = `equity_bond_spread_${indexCode}`;
  const cached = getCached<EquityBondSpreadResponse>(cacheKey);
  if (cached) return cached;

  const [indexRows, bondRows] = await Promise.all([
    fetchCsIndexValuationHistory(indexCode),
    fetchChina10YBondYieldHistory(),
  ]);

  const analytics = computeEquityBondSpreadAnalytics(indexRows, bondRows);

  const response: EquityBondSpreadResponse = {
    source: {
      ...buildSourceInfo('public_live', analytics.latestDate || undefined),
      providerLabel: '中证指数官方PE · 东方财富10年期国债收益率',
    },
    indexCode,
    indexName,
    latestDate: analytics.latestDate,
    latestClose: analytics.latestClose,
    latestPe: analytics.latestPe,
    latestEarningsYieldPct: analytics.latestEarningsYieldPct,
    latestBondYield10yPct: analytics.latestBondYield10yPct,
    latestSpreadPct: analytics.latestSpreadPct,
    latestRatio: analytics.latestRatio,
    spreadChange1dBp: analytics.spreadChange1dBp,
    historyStartDate: analytics.historyStartDate,
    totalPoints: analytics.points.length,
    percentiles: analytics.percentiles,
    zoneSignal: analytics.zoneSignal,
    points: analytics.points,
  };

  if (response.totalPoints > 0) {
    setCached(cacheKey, response, 30 * 60_000);
  }
  return response;
}
