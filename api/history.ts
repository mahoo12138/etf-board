import type { IncomingMessage, ServerResponse } from 'http';
import { getDailyFlowHistory } from '../server/marketService';

interface VercelReq extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
}
interface VercelRes extends ServerResponse {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    const rawDays = Array.isArray(req.query?.days) ? req.query?.days[0] : req.query?.days;
    const days = Number(rawDays || 45);
    const data = await getDailyFlowHistory(Number.isFinite(days) ? days : 45);
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({
      error: '无法获取历史日度资金流向数据',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
