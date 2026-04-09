<template>
  <div class="chart-wrap">
    <div class="radar-scan-overlay" :style="scanOverlayStyle" aria-hidden="true">
      <div ref="hexContainerRef" class="radar-scan-hex">
        <canvas ref="particleCanvasRef" class="radar-particles"></canvas>
      </div>
    </div>
    <div ref="chartRef" class="chart-canvas"></div>
    <div v-if="loading" class="chart-mask">EVALUATING THREAT POSTURE...</div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { useEcharts } from '../../composables/useEcharts'
import { createCyberTooltip, createHudCornerGraphics, createNoDataGraphic } from './cyberChartTheme'

const props = defineProps({
  stats: {
    type: Object,
    default: () => ({}),
  },
  fullscreen: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

// --- 雷达图布局与等级逻辑 ---
const getRadarLayout = (fullscreen) => {
  if (fullscreen) return { center: ['50%', '55%'], radius: '74%' }
  return { center: ['50%', '54%'], radius: '68%' }
}

const rateLevel = (value, max) => {
  if (!max) return { grade: 'C', color: '#7ba7bc' }
  const ratio = value / max
  if (ratio >= 0.76) return { grade: 'A', color: '#ff0055' } // 保持红色
  if (ratio >= 0.5) return { grade: 'B', color: '#ff6a00' }
  return { grade: 'C', color: '#00ff9d' }
}

const getThreatValues = () => {
  const radarTactics = props.stats?.radar_tactics || {}
  const indicators = Array.isArray(radarTactics.indicators) ? radarTactics.indicators : []

  if (indicators.length) {
    const totalValues = (radarTactics.total_values || []).map((value) => Number(value) || 0)
    const verifiedValues = (radarTactics.verified_values || []).map((value) => Number(value) || 0)
    const normalizedTotal = indicators.map((_, idx) => totalValues[idx] || 0)
    const normalizedVerified = indicators.map((_, idx) => verifiedValues[idx] || 0)
    const verifiedDisplayValues = normalizedVerified.map((value, idx) => {
      const limit = Math.max(0, Math.round((normalizedTotal[idx] || 0) * 0.86))
      return Math.min(value, limit)
    })
    return {
      indicators: indicators.map((item) => String(item.name || 'Unknown')),
      indicatorMax: indicators.map((item, idx) => Math.max(Number(item.max) || 0, normalizedTotal[idx], normalizedVerified[idx], 1)),
      totalValues: normalizedTotal,
      verifiedValues: normalizedVerified,
      verifiedDisplayValues,
    }
  }

  const threat = props.stats?.threat_distribution || []
  const high = Number(threat.find((item) => item.level === 'high')?.value || 0)
  const medium = Number(threat.find((item) => item.level === 'medium')?.value || 0)
  const low = Number(threat.find((item) => item.level === 'low')?.value || 0)
  const fallbackIndicators = ['Initial Access', 'Execution', 'Defense Evasion', 'Collection', 'Command and Control']
  const fallbackTotal = [high, medium, low, Math.round((high + medium) * 0.55), Math.round((high + low) * 0.48)]
  const fallbackVerified = fallbackTotal.map((value) => Math.max(0, Math.round(value * 0.62)))
  const fallbackVerifiedDisplay = fallbackVerified.map((value, idx) => Math.min(value, Math.max(0, Math.round(fallbackTotal[idx] * 0.86))))
  return {
    indicators: fallbackIndicators,
    indicatorMax: fallbackTotal.map((value, idx) => Math.max(value, fallbackVerified[idx], 1)),
    totalValues: fallbackTotal,
    verifiedValues: fallbackVerified,
    verifiedDisplayValues: fallbackVerifiedDisplay,
  }
}

const scanOverlayStyle = computed(() => {
  const { center, radius } = getRadarLayout(props.fullscreen)
  const radiusPercent = Number.parseFloat(String(radius).replace('%', '')) || 68
  const { indicators } = getThreatValues()
  const n = indicators.length || 5
  const points = Array.from({ length: n }).map((_, i) => {
    const angleDeg = 90 - (360 / n) * i
    const angleRad = (angleDeg * Math.PI) / 180
    const x = 50 + 50 * Math.cos(angleRad)
    const y = 50 - 50 * Math.sin(angleRad)
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`
  })

  return {
    '--scan-center-x': center[0],
    '--scan-center-y': center[1],
    '--scan-radius': radiusPercent, 
    '--scan-clip': `polygon(${points.join(', ')})`,
    '--scan-breathe-min': props.fullscreen ? '0.38' : '0.36',
    '--scan-breathe-max': props.fullscreen ? '0.56' : '0.52',
  }
})

const buildOption = () => {
  const fullscreen = props.fullscreen
  const { indicators, indicatorMax, totalValues, verifiedValues, verifiedDisplayValues } = getThreatValues()
  const maxVal = Math.max(...indicatorMax, 1)
  const { center: radarCenter, radius: radarRadius } = getRadarLayout(fullscreen)
  
  const indicatorConfig = indicators.map((item, idx) => {
    const value = Number(totalValues[idx]) || 0
    const level = rateLevel(value, maxVal)
    return {
      name: `{en|${item}}\n{grade|${level.grade}}\n{cross|+}`,
      max: Number(indicatorMax[idx]) || maxVal,
    }
  })

  return {
    backgroundColor: 'transparent',
    tooltip: createCyberTooltip({
      size: 'lg',
      trigger: 'item',
      formatter: (params) => {
        if (!Array.isArray(params.value)) return ''
        const rows = indicators
          .map((item, idx) => {
            const value = params.seriesName === 'Verified Threats'
              ? Number(verifiedValues[idx]) || 0
              : Number(totalValues[idx]) || 0
            const tone = rateLevel(value, maxVal)
            const displayName = params.seriesName === 'Verified Threats' ? `${item} · Verified` : item
            return `<div class="cyber-tip-row"><span><i class="state-dot" style="background:${tone.color}"></i>${displayName}</span><strong>${value}</strong></div>`
          })
          .join('')
        return [
          '<div class="cyber-tip-body">',
          `<div class="cyber-tip-head">${params.seriesName || 'THREAT PROFILE'}</div>`,
          rows,
          '</div>',
        ].join('')
      },
    }),
    radar: {
      center: radarCenter,
      radius: radarRadius,
      splitNumber: fullscreen ? 4 : 5,
      axisName: {
        color: '#eef5ff',
        fontFamily: 'Roboto Mono',
        fontSize: fullscreen ? 9 : 10,
        fontWeight: 600,
        rich: {
          en: { color: '#c7f1ff', fontSize: fullscreen ? 9 : 10, lineHeight: fullscreen ? 13 : 14, fontWeight: 700 },
          grade: { color: '#00ff9d', fontSize: fullscreen ? 8 : 9, lineHeight: fullscreen ? 12 : 13, fontWeight: 700 },
          cross: { color: 'rgba(0,229,255,0.9)', fontSize: fullscreen ? 9 : 10, lineHeight: fullscreen ? 11 : 12, fontWeight: 700 },
        },
      },
      splitArea: {
        areaStyle: {
          color: fullscreen ? ['rgba(0,229,255,0.02)', 'rgba(0,229,255,0.07)'] : ['rgba(0,229,255,0.015)', 'rgba(0,229,255,0.05)'],
        },
      },
      axisLine: { lineStyle: { color: 'rgba(0,229,255,0.42)', shadowBlur: 8, shadowColor: 'rgba(0,229,255,0.35)' } },
      splitLine: { lineStyle: { color: 'rgba(0,255,157,0.35)', type: 'dashed' } },
      indicator: indicatorConfig,
    },
    series: [
      {
        id: 'baselineEnvelope',
        name: 'Baseline Envelope',
        type: 'radar',
        silent: true,
        z: 1,
        symbol: 'none',
        lineStyle: { color: 'rgba(103,154,176,0.65)', width: 1, type: 'dashed' },
        areaStyle: { opacity: 0 },
        data: [{ value: totalValues.map((value) => Math.max(1, Math.round(value * 0.75))) }],
      },
      {
        id: 'threatProfileLayer',
        type: 'radar',
        name: 'Total Threats',
        z: 3,
        symbol: 'diamond',
        symbolSize: fullscreen ? 6 : 5,
        showSymbol: true,
        lineStyle: { color: '#ff0055', width: 1.8, shadowBlur: 10, shadowColor: 'rgba(255,0,85,0.5)' },
        areaStyle: { color: 'rgba(255,0,85,0.26)', shadowBlur: 16, shadowColor: 'rgba(255,0,85,0.42)' },
        itemStyle: { color: '#ff0055', borderColor: '#ffd6e4', borderWidth: 1 },
        data: [{ value: totalValues, name: 'Total Threats' }],
      },
      {
        id: 'verifiedThreatLayer',
        type: 'radar',
        name: 'Verified Threats',
        z: 4,
        symbol: 'circle',
        symbolSize: fullscreen ? 4 : 3,
        showSymbol: true,
        lineStyle: { color: '#00e5ff', width: 1.35, type: 'dashed', shadowBlur: 8, shadowColor: 'rgba(0,229,255,0.48)' },
        areaStyle: { color: 'rgba(0,229,255,0.04)' },
        itemStyle: { color: '#00e5ff', borderColor: '#dff8ff', borderWidth: 1 },
        data: [{ value: verifiedDisplayValues, name: 'Verified Threats' }],
      },
    ],
    graphic: [
      ...createHudCornerGraphics({ fullscreen, z: 10 }),
      ...(totalValues.reduce((sum, value) => sum + (Number(value) || 0), 0) ? [] : [createNoDataGraphic('NO THREAT DATA', fullscreen)]),
    ],
  }
}

const emit = defineEmits(['chart-click'])
const { chartRef } = useEcharts(buildOption, () => [props.stats, props.fullscreen], {
  deep: false,
  throttleMs: 90,
  debounceMs: 180,
  onClick: (params) => emit('chart-click', params)
})

// --- Canvas 粒子系统（亮绿色细节） ---
const hexContainerRef = ref(null)
const particleCanvasRef = ref(null)
let animationFrameId = null
const particles = []

class Particle {
  constructor(w, h) {
    this.reset(w, h)
  }
  reset(w, h) {
    this.x = Math.random() * w
    this.y = Math.random() * h
    this.size = Math.random() * 1.2 + 0.4
    this.vx = (Math.random() - 0.5) * 0.25
    this.vy = (Math.random() - 0.5) * 0.25
    this.life = Math.random() * Math.PI * 2
  }
  update(w, h) {
    this.x += this.vx
    this.y += this.vy
    this.life += 0.025
    if (this.x < 0 || this.x > w || this.y < 0 || this.y > h) this.reset(w, h)
  }
  draw(ctx) {
    const alpha = ((Math.sin(this.life) + 1) / 2) * 0.5 + 0.1
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#00ff9d' // 粒子设为亮绿色
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

const renderParticles = () => {
  const canvas = particleCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)
  particles.forEach(p => {
    p.update(width, height)
    p.draw(ctx)
  })
  animationFrameId = requestAnimationFrame(renderParticles)
}

useResizeObserver(hexContainerRef, (entries) => {
  const entry = entries[0]
  const canvas = particleCanvasRef.value
  if (!canvas || !entry) return
  const { width, height } = entry.contentRect
  canvas.width = width
  canvas.height = height
  particles.length = 0
  const count = props.fullscreen ? 55 : 30
  for (let i = 0; i < count; i++) particles.push(new Particle(width, height))
})

onMounted(() => { animationFrameId = requestAnimationFrame(renderParticles) })
onBeforeUnmount(() => { if (animationFrameId) cancelAnimationFrame(animationFrameId) })
</script>

<style scoped>
.chart-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  container-type: size; 
}

.chart-canvas {
  width: 100%;
  height: 100%;
  min-height: 205px;
  position: relative;
  z-index: 1;
}

.radar-scan-overlay {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.radar-scan-hex {
  position: absolute;
  left: var(--scan-center-x, 50%);
  top: var(--scan-center-y, 54%);
  width: calc(var(--scan-radius, 68) * 1cqmin);
  height: calc(var(--scan-radius, 68) * 1cqmin);
  transform: translate(-50%, -50%);
  clip-path: var(--scan-clip);
  /* 背景微弱的绿色呼吸光晕 */
  background: radial-gradient(circle, rgba(0, 255, 157, 0.05) 0%, rgba(0, 255, 157, 0) 75%);
  animation: radar-hex-breathe 5.2s ease-in-out infinite;
}

.radar-particles {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
  z-index: 1;
}

/* 锐利的亮绿色雷达扫描线 */
.radar-scan-hex::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  z-index: 2;
  /* Conic-gradient 调整为亮绿色调 */
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(0, 255, 157, 0.03) 180deg,
    rgba(0, 255, 157, 0.3) 345deg,
    rgba(220, 255, 240, 0.9) 360deg
  );
  mix-blend-mode: screen;
  animation: radar-sweep-rotate 3.8s linear infinite; /* 稍微加快一点速度更有动感 */
  transform-origin: center;
}

@keyframes radar-sweep-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes radar-hex-breathe {
  0%, 100% {
    opacity: var(--scan-breathe-min, 0.36);
    transform: translate(-50%, -50%) scale(0.985);
  }
  50% {
    opacity: var(--scan-breathe-max, 0.52);
    transform: translate(-50%, -50%) scale(1.01);
  }
}

@media (max-height: 860px) {
  .chart-canvas { min-height: 175px; }
}

.chart-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 20, 0.4);
  color: #7ba7bc;
  font-family: var(--font-ui);
  font-size: 0.64rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  animation: pulse-mask 1.5s infinite ease-in-out;
}

@keyframes pulse-mask {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
</style>