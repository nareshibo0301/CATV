'use client';

import { useEffect } from 'react';
import { registerCatvGoldTheme } from '@/lib/echarts-theme';

export function EchartsThemeRegistrar() {
  useEffect(() => {
    registerCatvGoldTheme();
    const observer = new MutationObserver(() => registerCatvGoldTheme());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return null;
}
