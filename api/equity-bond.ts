import type { IncomingMessage, ServerResponse } from 'http';
import { getEquityBondSpreadAnalytics } from '../server/marketService';

interface VercelReq extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
}
interface VercelRes extends ServerResponse {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    const rawIdx = Array.isArray(req.query?.index) ? req.query?.index[0] : req.query?.index;
    const cleanIdx = String(rawIdx || '000300').replace(/[^0-9]/g, '');
    const data = await getEquityBondSpreadAnalytics(cleanIdx === '000905' ? '000905' : '000300');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({
      error: '无法获取股债利差历史估值数据',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
