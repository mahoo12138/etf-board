import type { IncomingMessage, ServerResponse } from 'http';
import { getEtfDetailHistory } from '../server/marketService';

interface VercelReq extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
}
interface VercelRes extends ServerResponse {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    const rawCode = Array.isArray(req.query?.code) ? req.query?.code[0] : req.query?.code;
    const code = String(rawCode || '').replace(/[^0-9]/g, '');
    if (!code || code.length !== 6) {
      res.status(400).json({ error: '无效的ETF代码参数' });
      return;
    }
    const data = await getEtfDetailHistory(code);
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (error) {
    res.status(404).json({
      error: '未找到对应ETF历史明细',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
