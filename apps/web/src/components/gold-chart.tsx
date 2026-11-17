'use client';

import * as echarts from 'echarts';
import { useEffect, useRef } from 'react';
import { CATV_ECHARTS_THEME, registerCatvGoldTheme } from '@/lib/echarts-theme';

export function GoldChart({ option, className = 'h-72 w-full' }: { option: echarts.EChartsOption; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify(option);
  useEffect(() => {
    if (!ref.current) return;
    registerCatvGoldTheme();
    const chart = echarts.init(ref.current, CATV_ECHARTS_THEME);
    chart.setOption(JSON.parse(signature) as echarts.EChartsOption);
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [signature]);
  return <div ref={ref} className={className} />;
}
