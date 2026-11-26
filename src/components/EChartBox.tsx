import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface EChartBoxProps {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

export function EChartBox({
  option,
  height = 320,
  className = '',
  testId,
  ariaLabel,
}: EChartBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    instanceRef.current = chart;

    const observer = new ResizeObserver(() => {
      if (instanceRef.current && !instanceRef.current.isDisposed()) {
        instanceRef.current.resize();
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.dispose();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart || chart.isDisposed()) return;
    chart.setOption(option, { notMerge: true, lazyUpdate: false });
  }, [option]);

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      role="img"
      aria-label={ariaLabel}
      className={`w-full ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    />
  );
}
