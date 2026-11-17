'use client';

import * as echarts from 'echarts';

export const CATV_ECHARTS_THEME = 'catv-gold';

function readToken(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

/** Registers the gold ECharts theme from the CSS design tokens. Safe to call again after a theme change. */
export function registerCatvGoldTheme(): void {
  const styles = getComputedStyle(document.documentElement);
  const foreground = readToken(styles, '--foreground');
  const muted = readToken(styles, '--muted-foreground');
  const border = readToken(styles, '--border');
  const axis = {
    axisLine: { lineStyle: { color: border } },
    axisLabel: { color: muted },
    splitLine: { lineStyle: { color: border } },
  };

  echarts.registerTheme(CATV_ECHARTS_THEME, {
    color: [
      readToken(styles, '--primary'),
      readToken(styles, '--primary-deep'),
      readToken(styles, '--primary-light'),
      foreground,
      muted,
    ],
    backgroundColor: 'transparent',
    textStyle: { color: foreground },
    title: { textStyle: { color: foreground } },
    legend: { textStyle: { color: muted } },
    categoryAxis: axis,
    valueAxis: axis,
  });
}
