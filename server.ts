import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getDailyFlowHistory,
  getEquityBondSpreadAnalytics,
  getEtfDetailHistory,
  getIndicesTrendAnalytics,
  getMarketOverview,
} from './server/marketService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      hithinkConfigured: Boolean((process.env.HITHINK_API_KEY || '').trim()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/market', async (req, res) => {
    try {
      const force = req.query.refresh === '1';
      const data = await getMarketOverview(force);
      res.setHeader('Cache-Control', 'no-store');
      res.json(data);
    } catch (error) {
      res.status(502).json({
        error: '无法获取实时ETF行情数据',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/history', async (req, res) => {
    try {
      const days = Number(req.query.days || 45);
      const data = await getDailyFlowHistory(Number.isFinite(days) ? days : 45);
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.json(data);
    } catch (error) {
      res.status(502).json({
        error: '无法获取历史日度资金流向数据',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/indices', async (req, res) => {
    try {
      const days = Number(req.query.days || 90);
      const data = await getIndicesTrendAnalytics(Number.isFinite(days) ? days : 90);
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.json(data);
    } catch (error) {
      res.status(502).json({
        error: '无法获取重点指数趋势分析数据',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/equity-bond', async (req, res) => {
    try {
      const index = String(req.query.index || '000300').replace(/[^0-9]/g, '');
      const data = await getEquityBondSpreadAnalytics(index === '000905' ? '000905' : '000300');
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.json(data);
    } catch (error) {
      res.status(502).json({
        error: '无法获取股债利差历史估值数据',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/etf-detail', async (req, res) => {
    try {
      const code = String(req.query.code || '').replace(/[^0-9]/g, '');
      if (!code || code.length !== 6) {
        res.status(400).json({ error: '无效的ETF代码参数' });
        return;
      }
      const data = await getEtfDetailHistory(code);
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.json(data);
    } catch (error) {
      res.status(404).json({
        error: '未找到对应ETF历史明细',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer();
