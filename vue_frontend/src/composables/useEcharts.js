import * as echarts from 'echarts'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export function useEcharts(
  buildOption,
  watchSource,
  { deep = true, throttleMs = 80, debounceMs = 160 } = {}
) {
  const chartRef = ref(null)
  let chart = null
  let resizeObserver = null
  let resizeThrottleTimer = null
  let resizeDebounceTimer = null
  let lastResizeTime = 0

  const renderChart = () => {
    if (!chart) return
    chart.setOption(buildOption(), true)
  }

  const resizeChart = () => {
    if (chart) {
      chart.resize()
    }
  }

  const clearResizeTimers = () => {
    if (resizeThrottleTimer) {
      clearTimeout(resizeThrottleTimer)
      resizeThrottleTimer = null
    }
    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer)
      resizeDebounceTimer = null
    }
  }

  const scheduleResize = () => {
    const now = Date.now()
    const elapsed = now - lastResizeTime

    if (elapsed >= throttleMs) {
      lastResizeTime = now
      resizeChart()
    } else if (!resizeThrottleTimer) {
      resizeThrottleTimer = setTimeout(() => {
        resizeThrottleTimer = null
        lastResizeTime = Date.now()
        resizeChart()
      }, throttleMs - elapsed)
    }

    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer)
    }
    resizeDebounceTimer = setTimeout(() => {
      resizeDebounceTimer = null
      lastResizeTime = Date.now()
      resizeChart()
    }, debounceMs)
  }

  onMounted(() => {
    if (!chartRef.value) return

    chart = echarts.init(chartRef.value)
    renderChart()

    resizeObserver = new ResizeObserver(() => {
      scheduleResize()
    })
    resizeObserver.observe(chartRef.value)
    scheduleResize()
  })

  if (watchSource) {
    watch(watchSource, renderChart, { deep })
  }

  onBeforeUnmount(() => {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    clearResizeTimers()
    if (chart) {
      chart.dispose()
      chart = null
    }
  })

  return {
    chartRef,
    renderChart,
    resizeChart,
  }
}
