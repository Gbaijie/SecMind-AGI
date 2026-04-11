<template>
  <div ref="mountRef" class="topology-scene">
    <div class="topology-toolbar">
      <div class="toolbar-search">
        <input
          v-model.trim="searchKeyword"
          class="toolbar-input"
          type="text"
          placeholder="搜索节点 ID / 名称 / 类型"
          @keyup.enter="handleSearch"
        />
        <button class="toolbar-button toolbar-button--primary" type="button" @click="handleSearch">SEARCH</button>
      </div>

      <div class="toolbar-actions">
        <button class="toolbar-button" type="button" :class="{ active: autoRotateEnabled }" @click="toggleAutoRotate">
          {{ autoRotateEnabled ? 'ROTATE ON' : 'ROTATE OFF' }}
        </button>
        <button class="toolbar-button" type="button" @click="handleReset">RESET VIEW</button>
      </div>
    </div>

    <div class="topology-filter-bar">
      <span class="filter-label">RISK FILTER:</span>
      <button
        v-for="f in riskFilters"
        :key="f.key"
        class="filter-chip"
        :class="{ 'filter-chip--active': activeRiskFilter === f.key, [`filter-chip--${f.key}`]: true }"
        type="button"
        @click="setRiskFilter(f.key)"
      >
        <span class="filter-chip-dot" :style="{ background: f.color }"></span>
        {{ f.label }}
      </button>
    </div>

    <div
      v-show="tooltip.show"
      class="topology-tooltip"
      :class="{ 'topology-tooltip--locked': tooltip.locked, [`topology-tooltip--risk-${tooltip.riskLevel}`]: Boolean(tooltip.riskLevel) }"
      :style="tooltipStyle"
    >
      <div class="tooltip-head">
        <div class="tooltip-title">{{ tooltip.title }}</div>
        <div v-if="tooltip.locked" class="tooltip-badge">LOCKED</div>
      </div>
      <div v-if="tooltip.type" class="tooltip-type">Type: {{ tooltip.type }}</div>
      <div v-if="tooltip.riskLevel" class="tooltip-risk" :class="`tooltip-risk--${tooltip.riskLevel}`">
        <span class="tooltip-risk-dot"></span>
        RISK: {{ tooltip.riskLevel.toUpperCase() }}
      </div>
      <div v-if="tooltip.riskLevel" class="tooltip-energy">
        <span class="tooltip-energy-fill" :style="{ width: `${tooltipEnergy}%` }"></span>
      </div>
      <div class="tooltip-metric">Value: {{ tooltip.valueText }}</div>
      <div class="tooltip-metric">Degree: {{ tooltip.degreeText }}</div>
      <div class="tooltip-meta">{{ tooltip.mode.toUpperCase() }}</div>
    </div>

    <div class="topology-status">
      <span class="status-chip">{{ statusText }}</span>
      <span v-if="currentFocusLabel" class="status-focus">FOCUS {{ currentFocusLabel }}</span>
      <span class="status-summary">{{ summaryText }}</span>
    </div>

    <div class="topology-legend topology-legend--left">
      <div class="legend-block legend-block--compact">
        <div class="legend-title">LINK SEVERITY</div>
        <div v-for="item in linkLegendItems" :key="item.key" class="legend-item legend-item--line">
          <span class="legend-line" :style="{ backgroundColor: item.color, opacity: item.opacity }"></span>
          <span class="legend-label">{{ item.label }}</span>
        </div>
        <div class="legend-range">Weight {{ legendStats.minWeight }} - {{ legendStats.maxWeight }}</div>
        <div class="legend-note legend-note--meta">
          Nodes {{ legendStats.renderedNodes }}/{{ legendStats.totalNodes }}
          <span class="legend-divider">|</span>
          Links {{ legendStats.renderedLinks }}/{{ legendStats.totalLinks }}
        </div>
      </div>
    </div>

    <div class="topology-legend topology-legend--right">
      <div class="legend-block">
        <div class="legend-title">NODE TYPES</div>
        <div v-for="item in nodeLegendItems" :key="item.key" class="legend-item">
          <span class="legend-dot" :style="{ backgroundColor: item.color, boxShadow: `0 0 9px ${item.color}` }"></span>
          <span class="legend-label">{{ item.label }}</span>
          <span class="legend-note">{{ item.note }}</span>
        </div>
        <div class="legend-separator"></div>
        <div class="legend-title legend-title--sub">RISK LEVEL</div>
        <div v-for="item in riskLegendItems" :key="item.key" class="legend-item">
          <span class="legend-dot legend-dot--risk" :style="{ backgroundColor: item.color, boxShadow: `0 0 7px ${item.color}` }"></span>
          <span class="legend-label">{{ item.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch } from 'vue'
import {
  LINK_LEGEND_ITEMS,
  NODE_LEGEND_ITEMS,
  buildTopologyModel,
  getTopologySummaryText,
} from './topology/TopologyDataAdapter.js'
import { TopologyInteraction } from './topology/TopologyInteraction.js'
import { RISK_COLORS } from '../constants/colorPalette'

const props = defineProps({
  topology: {
    type: Object,
    default: () => ({ nodes: [], links: [] }),
  },
})

const mountRef = ref(null)
const searchKeyword = ref('')
const autoRotateEnabled = ref(true)
const statusText = ref('READY')
const focusedNodeId = ref('')
const pinnedNodeId = ref('')
const nodeLegendItems = NODE_LEGEND_ITEMS
const linkLegendItems = LINK_LEGEND_ITEMS

const tooltip = shallowRef({
  show: false,
  x: 0,
  y: 0,
  title: '',
  type: '',
  valueText: '',
  degreeText: '',
  riskLevel: '',
  mode: 'hover',
  locked: false,
  nodeId: '',
})

const topologyModel = ref(buildTopologyModel(props.topology))
const tooltipStyle = computed(() => ({ left: `${tooltip.value.x}px`, top: `${tooltip.value.y}px` }))
const legendStats = computed(() => topologyModel.value?.stats || { minWeight: 0, maxWeight: 0, renderedNodes: 0, totalNodes: 0, renderedLinks: 0, totalLinks: 0 })

const riskFilters = [
  { key: 'all',      label: 'ALL',      color: '#7fa8b6' },
  { key: 'critical', label: 'CRITICAL', color: RISK_COLORS.critical },
  { key: 'high',     label: 'HIGH',     color: RISK_COLORS.high },
  { key: 'medium',   label: 'MEDIUM',   color: RISK_COLORS.medium },
  { key: 'low',      label: 'LOW',      color: RISK_COLORS.low },
]
const activeRiskFilter = ref('all')

const riskLegendItems = [
  { key: 'critical', label: 'CRITICAL', color: RISK_COLORS.critical },
  { key: 'high',     label: 'HIGH',     color: RISK_COLORS.high },
  { key: 'medium',   label: 'MEDIUM',   color: RISK_COLORS.medium },
  { key: 'low',      label: 'LOW / INFO', color: RISK_COLORS.low },
]
const summaryText = computed(() => getTopologySummaryText(topologyModel.value))
const tooltipEnergy = computed(() => {
  const level = String(tooltip.value.riskLevel || 'low').toLowerCase()
  if (level === 'critical') return 100
  if (level === 'high') return 82
  if (level === 'medium') return 62
  return 38
})
const currentFocusLabel = computed(() => {
  const value = pinnedNodeId.value || focusedNodeId.value || ''
  if (!value) return ''
  return value.length > 34 ? `${value.slice(0, 31)}...` : value
})

let topologyEngine = null

const syncTopologyModel = () => {
  topologyModel.value = buildTopologyModel(props.topology)
  if (topologyEngine) {
    topologyEngine.setTopologyModel(topologyModel.value)
  }
}

const handleNodeStateChange = (payload) => {
  if (!payload || payload.show === false) {
    Object.assign(tooltip.value, {
      show: false,
      x: 0, y: 0,
      title: '', type: '', valueText: '', degreeText: '',
      riskLevel: '', mode: 'hover', locked: false,
      nodeId: '', pinnedNodeId: '', focusedNodeId: '', hoveredNodeId: '',
    })
    triggerRef(tooltip)
    focusedNodeId.value = ''
    pinnedNodeId.value = ''
    return
  }

  Object.assign(tooltip.value, {
    show: true,
    x: payload.x ?? 0,
    y: payload.y ?? 0,
    title:      payload.title      || '',
    type:       payload.type       || '',
    valueText:  payload.valueText  || '0',
    degreeText: payload.degreeText || '0',
    riskLevel:  payload.riskLevel  || '',
    mode:       payload.mode       || 'hover',
    locked:     Boolean(payload.locked),
    nodeId:         payload.nodeId         || '',
    pinnedNodeId:   payload.pinnedNodeId   || '',
    focusedNodeId:  payload.focusedNodeId  || '',
    hoveredNodeId:  payload.hoveredNodeId  || '',
  })
  triggerRef(tooltip)
  focusedNodeId.value = payload.focusedNodeId || ''
  pinnedNodeId.value  = payload.pinnedNodeId  || ''
}

const handleStatusChange = (text) => {
  const t = text || 'READY'
  statusText.value = t
  if (t === 'AUTO ROTATE ON') {
    autoRotateEnabled.value = true
  } else if (t === 'AUTO ROTATE OFF') {
    autoRotateEnabled.value = false
  }
}

const handleAutoRotateChange = (enabled) => {
  autoRotateEnabled.value = Boolean(enabled)
}

const setRiskFilter = (key) => {
  activeRiskFilter.value = key
  if (!topologyEngine) return
  if (key === 'all') {
    topologyEngine.setNodeFilter(null)
    handleStatusChange('FILTER: ALL')
  } else {
    topologyEngine.setNodeFilter((record) => record.riskLevel === key)
    handleStatusChange(`FILTER: ${key.toUpperCase()}`)
  }
}

const handleSearch = () => {
  if (!topologyEngine) return

  const query = searchKeyword.value.trim()
  if (!query) {
    handleStatusChange('ENTER A NODE NAME')
    return
  }

  const matched = topologyEngine.focusByKeyword(query, { pin: true })
  if (!matched) {
    handleStatusChange('NO MATCH')
  }
}

const toggleAutoRotate = () => {
  autoRotateEnabled.value = !autoRotateEnabled.value
  if (topologyEngine) {
    topologyEngine.setAutoRotate(autoRotateEnabled.value)
  }
  handleStatusChange(autoRotateEnabled.value ? 'AUTO ROTATE ON' : 'AUTO ROTATE OFF')
}

const handleReset = () => {
  searchKeyword.value = ''
  if (topologyEngine) {
    topologyEngine.resetView()
    topologyEngine.setAutoRotate(autoRotateEnabled.value)
  }
  handleStatusChange(autoRotateEnabled.value ? 'AUTO ROTATE ON' : 'AUTO ROTATE OFF')
}

onMounted(() => {
  if (!mountRef.value) return

  topologyEngine = new TopologyInteraction({
    onNodeStateChange: handleNodeStateChange,
    onStatusChange: handleStatusChange,
    onAutoRotateChange: handleAutoRotateChange,
  })

  topologyEngine.mount(mountRef.value)
  topologyEngine.setAutoRotate(autoRotateEnabled.value)
  topologyEngine.setTopologyModel(topologyModel.value)
})

watch(() => props.topology, syncTopologyModel, { deep: false })

watch(autoRotateEnabled, (enabled) => {
  if (topologyEngine) {
    topologyEngine.setAutoRotate(enabled)
  }
})

onBeforeUnmount(() => {
  if (topologyEngine) {
    topologyEngine.dispose()
    topologyEngine = null
  }
})
</script>

<style scoped>
.topology-scene {
  width: 100%;
  height: 100%;
  min-height: 260px;
  position: relative;
  overflow: hidden;
  isolation: isolate;
  --panel-bg: linear-gradient(145deg, rgba(10, 23, 43, 0.95), rgba(4, 11, 24, 0.95));
  --panel-bg-weak: linear-gradient(145deg, rgba(13, 31, 56, 0.9), rgba(5, 14, 29, 0.9));
  --panel-border: rgba(101, 186, 229, 0.35);
  --panel-border-strong: rgba(0, 229, 255, 0.58);
  --panel-text-main: #d9f3ff;
  --panel-text-muted: #85aec4;
  --panel-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
  background:
    radial-gradient(circle at 16% 14%, rgba(40, 102, 182, 0.22), transparent 42%),
    radial-gradient(circle at 74% 58%, rgba(0, 160, 236, 0.18), transparent 44%),
    linear-gradient(180deg, #040914 0%, #051326 56%, #06182f 100%);
}

.topology-scene::before,
.topology-scene::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.topology-scene::before {
  background:
    linear-gradient(180deg, rgba(5, 18, 36, 0), rgba(5, 18, 36, 0.62)),
    repeating-linear-gradient(
      116deg,
      rgba(125, 197, 255, 0.055) 0,
      rgba(125, 197, 255, 0.055) 1px,
      transparent 1px,
      transparent 17px
    );
}

.topology-scene::after {
  background: radial-gradient(circle at 82% 24%, rgba(88, 170, 255, 0.18), transparent 36%);
}

.topology-scene :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
  position: absolute;
  inset: 0;
}

.topology-toolbar {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 16px;
  z-index: 11;
  display: flex;
  flex-wrap: nowrap; /* 强制不换行，保持设计图中的同行布局 */
  gap: 12px;
  pointer-events: none;
}

.toolbar-search,
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 1;
  pointer-events: auto;
  animation: panel-slide-in 620ms cubic-bezier(0.18, 0.8, 0.22, 1) both;
}

.toolbar-search {
  flex: 1; /* 搜索框区域占满剩余空间 */
  min-width: 280px;
}

.toolbar-input {
  flex: 1;
  height: 36px;
  padding: 0 14px 0 18px;
  border: 1px solid rgba(94, 177, 219, 0.28);
  background: linear-gradient(145deg, rgba(19, 43, 71, 0.9), rgba(9, 21, 39, 0.92));
  color: var(--panel-text-main);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.05em;
  outline: none;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  box-shadow: inset 0 0 0 1px rgba(162, 229, 255, 0.06);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.toolbar-input::placeholder {
  color: #9db9cb;
}

.toolbar-input:focus {
  border-color: rgba(0, 229, 255, 0.62);
  box-shadow: inset 0 0 0 1px rgba(176, 233, 255, 0.14);
}

.toolbar-actions {
  flex: 0 0 auto;
}

.toolbar-button {
  height: 36px;
  min-width: 118px;
  padding: 0 16px;
  border: 1px solid rgba(0, 229, 255, 0.42);
  background: linear-gradient(135deg, rgba(17, 55, 81, 0.92), rgba(7, 25, 49, 0.94));
  color: #e3f5ff;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.11em;
  white-space: nowrap;
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  box-shadow: inset 0 0 0 1px rgba(167, 231, 255, 0.08);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
  cursor: pointer;
}

.toolbar-button:hover:not(:disabled) {
  border-color: rgba(0, 229, 255, 0.82);
  color: #ffffff;
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.18), inset 0 0 0 1px rgba(162, 229, 255, 0.15);
  transform: translateY(-1px);
}

.toolbar-button:active:not(:disabled) {
  transform: translateY(0);
}

.toolbar-button.active {
  border-color: rgba(0, 255, 157, 0.82);
  background: linear-gradient(135deg, rgba(0, 255, 178, 0.24), rgba(9, 35, 58, 0.94));
  color: #dcffef;
  box-shadow: 0 0 11px rgba(0, 255, 157, 0.16);
}

.toolbar-button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.toolbar-button--primary {
  border-color: rgba(0, 229, 255, 0.68);
  color: #f0fdff;
  background: linear-gradient(135deg, rgba(0, 216, 255, 0.22), rgba(8, 31, 57, 0.96));
}

.topology-filter-bar {
  position: absolute;
  left: 16px;
  top: 64px; /* 紧贴工具栏下方 */
  z-index: 11;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
  animation: panel-slide-in 650ms cubic-bezier(0.18, 0.8, 0.22, 1) both;
}

.filter-label {
  color: #c5e3f1;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  margin-right: 4px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid rgba(100, 178, 216, 0.34);
  background: var(--panel-bg-weak);
  color: #d8f1ff;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  cursor: pointer;
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  transition: border-color 0.2s ease, color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.filter-chip:hover {
  border-color: rgba(0, 229, 255, 0.62);
  color: #f5fdff;
}

.filter-chip:active {
  transform: translateY(1px);
}

.filter-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.filter-chip--active.filter-chip--all {
  border-color: rgba(127, 168, 182, 0.7);
  color: #d8f5ff;
  box-shadow: 0 0 9px rgba(127, 168, 182, 0.2);
}

.filter-chip--active.filter-chip--critical {
  border-color: rgba(255, 23, 68, 0.74);
  color: #ffadbe;
  box-shadow: 0 0 10px rgba(255, 23, 68, 0.28);
}

.filter-chip--active.filter-chip--high {
  border-color: rgba(255, 87, 34, 0.74);
  color: #ffcbad;
  box-shadow: 0 0 10px rgba(255, 87, 34, 0.24);
}

.filter-chip--active.filter-chip--medium {
  border-color: rgba(255, 193, 7, 0.8);
  color: #ffe7a8;
  box-shadow: 0 0 10px rgba(255, 193, 7, 0.24);
}

.filter-chip--active.filter-chip--low {
  border-color: rgba(69, 90, 100, 0.82);
  color: #bdcdd5;
  box-shadow: 0 0 8px rgba(69, 90, 100, 0.24);
}

.topology-tooltip {
  position: absolute;
  z-index: 10;
  pointer-events: none;
  min-width: 172px;
  max-width: 236px;
  padding: 10px 12px;
  border: 1px solid rgba(123, 194, 236, 0.46);
  background: linear-gradient(145deg, rgba(14, 36, 60, 0.95), rgba(4, 13, 27, 0.95));
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(171, 230, 255, 0.1);
  color: #d8f5ff;
  overflow: hidden;
  transition: opacity 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.topology-tooltip--locked {
  border-color: rgba(0, 255, 157, 0.5);
  box-shadow: 0 0 0 1px rgba(0, 255, 157, 0.2), 0 8px 24px rgba(0, 0, 0, 0.48);
}

.tooltip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.tooltip-title {
  color: #00e5ff;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.tooltip-badge {
  padding: 1px 6px;
  border: 1px solid rgba(0, 255, 157, 0.34);
  background: rgba(0, 255, 157, 0.09);
  color: #b8ffe4;
  font-size: 9px;
  font-family: var(--font-ui);
  letter-spacing: 0.08em;
}

.tooltip-type,
.tooltip-metric,
.tooltip-meta {
  font-family: var(--font-ui);
  font-size: 10px;
}

.tooltip-type {
  color: #82afc5;
  text-transform: uppercase;
}

.tooltip-metric {
  margin-top: 3px;
  color: #b9dfeb;
}

.tooltip-energy {
  position: relative;
  height: 6px;
  margin-top: 6px;
  border: 1px solid rgba(137, 204, 255, 0.28);
  background: rgba(10, 26, 48, 0.8);
  overflow: hidden;
}

.tooltip-energy-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #22d3ff, #5ba8ff);
  box-shadow: 0 0 8px rgba(56, 184, 255, 0.5);
  transform-origin: left center;
  animation: energy-pulse 1.8s ease-in-out infinite;
}

.tooltip-meta {
  margin-top: 6px;
  color: rgba(151, 215, 236, 0.68);
  letter-spacing: 0.08em;
}

.tooltip-risk {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.tooltip-risk-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tooltip-risk--critical { color: #ff1744; }
.tooltip-risk--critical .tooltip-risk-dot { background: #ff1744; box-shadow: 0 0 6px #ff1744; }
.tooltip-risk--high { color: #ff5722; }
.tooltip-risk--high .tooltip-risk-dot { background: #ff5722; box-shadow: 0 0 6px #ff5722; }
.tooltip-risk--medium { color: #ffc107; }
.tooltip-risk--medium .tooltip-risk-dot { background: #ffc107; box-shadow: 0 0 5px #ffc107; }
.tooltip-risk--low, .tooltip-risk--info { color: #90a4ae; }
.tooltip-risk--low .tooltip-risk-dot, .tooltip-risk--info .tooltip-risk-dot { background: #455a64; box-shadow: 0 0 4px #455a64; }

.topology-status {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  animation: panel-slide-in 660ms cubic-bezier(0.18, 0.8, 0.22, 1) both;
}

.status-chip,
.status-summary,
.status-focus {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid rgba(97, 175, 215, 0.34);
  background: linear-gradient(145deg, rgba(14, 33, 56, 0.9), rgba(6, 16, 31, 0.92));
  color: #9fd8ee;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.status-summary {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-chip {
  color: #d0ffe9;
  border-color: rgba(0, 255, 157, 0.34);
}

.status-focus {
  max-width: 260px;
  color: #bdeeff;
  border-color: rgba(70, 182, 255, 0.38);
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 分离后的图例容器 */
.topology-legend {
  position: absolute;
  z-index: 8;
  pointer-events: none;
  animation: panel-slide-in 720ms cubic-bezier(0.18, 0.8, 0.22, 1) both;
}

.topology-legend--left {
  left: 20px;
  bottom: 70px; 
}

.topology-legend--right {
  right: 20px;
  bottom: 16px;
}

.legend-block {
  padding: 12px 14px;
  border: 1px solid var(--panel-border);
  background: linear-gradient(145deg, rgba(15, 35, 59, 0.92), rgba(5, 14, 29, 0.92));
  position: relative;
  box-shadow: var(--panel-shadow), inset 0 0 0 1px rgba(160, 228, 255, 0.05);
}

.legend-block--compact {
  width: 180px;
  min-width: 150px;
}

.topology-legend--right .legend-block {
  width: 200px;
}

.legend-block::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(141, 214, 253, 0.55), transparent);
}

.legend-title {
  color: #b6f0ff;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.1em;
  margin-bottom: 10px;
}

.legend-title--sub {
  font-size: 10px;
  color: rgba(180, 239, 255, 0.75);
  margin-bottom: 8px;
}

.legend-item {
  display: grid;
  grid-template-columns: 10px auto 1fr;
  align-items: center;
  column-gap: 8px;
  margin-bottom: 6px;
}

.legend-item--line {
  grid-template-columns: 24px auto;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-dot--risk {
  width: 7px;
  height: 7px;
}

.legend-line {
  width: 22px;
  height: 2px;
}

.legend-label {
  color: #d8f6ff;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.05em;
}

.legend-note {
  color: #7fa8b6;
  font-family: var(--font-ui);
  font-size: 10px;
  text-align: right;
}

.legend-range {
  margin-top: 6px;
  color: #a6dff2;
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.05em;
}

.legend-note--meta {
  margin-top: 4px;
  text-align: left;
}

.legend-divider {
  margin: 0 6px;
  color: rgba(125, 176, 197, 0.75);
}

.legend-separator {
  height: 1px;
  background: rgba(0, 229, 255, 0.16);
  margin: 10px 0;
}

@keyframes panel-slide-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes energy-pulse {
  0% { filter: brightness(0.9); }
  50% { filter: brightness(1.18); }
  100% { filter: brightness(0.9); }
}

@media (max-width: 900px) {
  .topology-toolbar {
    flex-wrap: wrap;
  }
  .toolbar-search {
    width: 100%;
    flex: 1 1 100%;
  }
  .topology-filter-bar {
    top: 110px;
  }
  .topology-legend--left {
    left: 16px;
    bottom: 60px;
  }
}
</style>