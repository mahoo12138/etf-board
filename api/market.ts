import type { IncomingMessage, ServerResponse } from 'http';
import { getMarketOverview } from '../server/marketService';

interface VercelReq extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
}
interface VercelRes extends ServerResponse {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    const force = req.query?.refresh === '1';
    const data = await getMarketOverview(force);
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({
      error: '无法获取实时ETF行情数据',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
