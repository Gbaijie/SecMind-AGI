<!--
  组件职责：渲染攻击拓扑 3D 场景并提供搜索、聚焦和旋转控制。
  业务模块：可视化拓扑模块
  主要数据流：topology 数据 -> DataAdapter -> TopologyRenderer / TopologyInteraction -> WebGL 画面
-->

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
          {{ autoRotateEnabled ? 'AUTO ROTATE ON' : 'AUTO ROTATE OFF' }}
        </button>
        <button class="toolbar-button" type="button" :disabled="!hasActiveSelection" @click="handlePinToggle">
          {{ pinButtonLabel }}
        </button>
        <button class="toolbar-button" type="button" @click="handleReset">RESET VIEW</button>
      </div>
    </div>

    <div
      v-show="tooltip.show"
      class="topology-tooltip"
      :class="{ 'topology-tooltip--locked': tooltip.locked }"
      :style="tooltipStyle"
    >
      <div class="tooltip-head">
        <div class="tooltip-title">{{ tooltip.title }}</div>
        <div v-if="tooltip.locked" class="tooltip-badge">LOCKED</div>
      </div>
      <div v-if="tooltip.type" class="tooltip-type">Type: {{ tooltip.type }}</div>
      <div class="tooltip-metric">Value: {{ tooltip.valueText }}</div>
      <div class="tooltip-metric">Degree: {{ tooltip.degreeText }}</div>
      <div class="tooltip-meta">{{ tooltip.mode.toUpperCase() }}</div>
    </div>

    <div class="topology-status">
      <span class="status-chip">{{ statusText }}</span>
      <span class="status-summary">{{ summaryText }}</span>
    </div>

    <div class="topology-legend">
      <div class="legend-block">
        <div class="legend-title">NODE TYPES</div>
        <div v-for="item in nodeLegendItems" :key="item.key" class="legend-item">
          <span class="legend-dot" :style="{ backgroundColor: item.color, boxShadow: `0 0 9px ${item.color}` }"></span>
          <span class="legend-label">{{ item.label }}</span>
          <span class="legend-note">{{ item.note }}</span>
        </div>
      </div>

      <div class="legend-block">
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

const props = defineProps({
  topology: {
    type: Object,
    default: () => ({ nodes: [], links: [] }),
  },
})

const mountRef = ref(null)
const searchKeyword = ref('')
const autoRotateEnabled = ref(true)
const statusText = ref('AUTO ROTATE ON')
const activeNodeId = ref('')
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
  mode: 'hover',
  locked: false,
  nodeId: '',
})

const topologyModel = ref(buildTopologyModel(props.topology))
const tooltipStyle = computed(() => ({ left: `${tooltip.value.x}px`, top: `${tooltip.value.y}px` }))
const legendStats = computed(() => topologyModel.value?.stats || { minWeight: 0, maxWeight: 0, renderedNodes: 0, totalNodes: 0, renderedLinks: 0, totalLinks: 0 })
const summaryText = computed(() => getTopologySummaryText(topologyModel.value))
const hasActiveSelection = computed(() => Boolean(activeNodeId.value || focusedNodeId.value || pinnedNodeId.value))
const pinButtonLabel = computed(() => (pinnedNodeId.value ? 'UNPIN NODE' : 'PIN NODE'))

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
      x: 0,
      y: 0,
      title: '',
      type: '',
      valueText: '',
      degreeText: '',
      mode: 'hover',
      locked: false,
      nodeId: '',
      pinnedNodeId: '',
      focusedNodeId: '',
      hoveredNodeId: '',
    })
    triggerRef(tooltip)
    activeNodeId.value = ''
    focusedNodeId.value = ''
    pinnedNodeId.value = ''
    return
  }

  Object.assign(tooltip.value, {
    show: true,
    x: payload.x ?? 0,
    y: payload.y ?? 0,
    title: payload.title || '',
    type: payload.type || '',
    valueText: payload.valueText || '0',
    degreeText: payload.degreeText || '0',
    mode: payload.mode || 'hover',
    locked: Boolean(payload.locked),
    nodeId: payload.nodeId || '',
    pinnedNodeId: payload.pinnedNodeId || '',
    focusedNodeId: payload.focusedNodeId || '',
    hoveredNodeId: payload.hoveredNodeId || '',
  })
  triggerRef(tooltip)
  activeNodeId.value = payload.nodeId || ''
  focusedNodeId.value = payload.focusedNodeId || ''
  pinnedNodeId.value = payload.pinnedNodeId || ''
}

const handleStatusChange = (text) => {
  statusText.value = text || 'READY'
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

const handlePinToggle = () => {
  if (!topologyEngine || !hasActiveSelection.value) return
  topologyEngine.togglePin(pinnedNodeId.value || activeNodeId.value)
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
  })

  topologyEngine.mount(mountRef.value)
  topologyEngine.setAutoRotate(autoRotateEnabled.value)
  topologyEngine.setTopologyModel(topologyModel.value)
})

watch(
  () => props.topology,
  () => {
    syncTopologyModel()
  },
  { deep: false }
)

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
  min-height: 230px;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 45%, rgba(0, 229, 255, 0.08), transparent 60%),
    linear-gradient(180deg, rgba(5, 8, 20, 0.96), rgba(5, 8, 20, 0.88));
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
  left: 10px;
  right: 10px;
  top: 10px;
  z-index: 11;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;
}

.toolbar-search,
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
  flex-wrap: wrap;
}

.toolbar-search {
  flex: 1 1 320px;
  min-width: 260px;
}

.toolbar-input {
  flex: 1 1 220px;
  min-width: 180px;
  height: 30px;
  border: 1px solid rgba(0, 229, 255, 0.22);
  background: rgba(4, 9, 20, 0.82);
  color: #d8f5ff;
  padding: 0 10px;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.04em;
  outline: none;
}

.toolbar-input::placeholder {
  color: rgba(151, 215, 236, 0.7);
}

.toolbar-input:focus {
  border-color: rgba(0, 229, 255, 0.6);
  box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.08);
}

.toolbar-button {
  height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(0, 229, 255, 0.24);
  background: rgba(0, 229, 255, 0.06);
  color: #97d7ec;
  font-family: var(--font-mono);
  font-size: 0.54rem;
  letter-spacing: 0.1em;
  white-space: nowrap;
  transition: all 0.18s ease;
}

.toolbar-button:hover:not(:disabled) {
  border-color: rgba(0, 229, 255, 0.56);
  color: #d8f5ff;
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.12);
}

.toolbar-button.active {
  border-color: rgba(0, 255, 157, 0.55);
  color: #b8ffe4;
  background: rgba(0, 255, 157, 0.08);
}

.toolbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.toolbar-button--primary {
  border-color: rgba(0, 255, 157, 0.38);
  color: #ccffe9;
  background: rgba(0, 255, 157, 0.08);
}

.topology-tooltip {
  position: absolute;
  z-index: 10;
  pointer-events: none;
  min-width: 158px;
  max-width: 220px;
  padding: 8px 11px;
  border-radius: 5px;
  border: 1px solid rgba(0, 229, 255, 0.35);
  background: rgba(5, 8, 20, 0.92);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  color: #d8f5ff;
  transform: translate(0, 0);
}

.topology-tooltip--locked {
  border-color: rgba(0, 255, 157, 0.45);
  box-shadow: 0 0 0 1px rgba(0, 255, 157, 0.18), 0 4px 14px rgba(0, 0, 0, 0.5);
}

.tooltip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.tooltip-title {
  font-weight: 700;
  color: #00e5ff;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.05em;
}

.tooltip-badge {
  padding: 1px 5px;
  border-radius: 999px;
  border: 1px solid rgba(0, 255, 157, 0.34);
  background: rgba(0, 255, 157, 0.08);
  color: #b8ffe4;
  font-size: 0.48rem;
  font-family: var(--font-mono);
  letter-spacing: 0.08em;
}

.tooltip-type,
.tooltip-metric,
.tooltip-meta {
  font-family: var(--font-mono);
  font-size: 0.56rem;
}

.tooltip-type {
  color: #7ba7bc;
  text-transform: uppercase;
}

.tooltip-metric {
  margin-top: 2px;
  color: #b8deea;
}

.tooltip-meta {
  margin-top: 5px;
  color: rgba(151, 215, 236, 0.62);
  letter-spacing: 0.08em;
}

.topology-status {
  position: absolute;
  left: 10px;
  bottom: 10px;
  z-index: 9;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  pointer-events: none;
}

.status-chip,
.status-summary {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid rgba(0, 229, 255, 0.22);
  background: rgba(4, 9, 20, 0.8);
  color: #97d7ec;
  font-family: var(--font-mono);
  font-size: 0.5rem;
  letter-spacing: 0.08em;
}

.status-chip {
  color: #ccffe9;
  border-color: rgba(0, 255, 157, 0.26);
}

.topology-legend {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 9;
  display: flex;
  gap: 8px;
  pointer-events: none;
}

.legend-block {
  min-width: 168px;
  padding: 7px 9px;
  border: 1px solid rgba(0, 229, 255, 0.28);
  border-radius: 5px;
  background: rgba(4, 9, 20, 0.75);
  backdrop-filter: blur(2px);
}

.legend-title {
  color: #b4efff;
  font-family: var(--font-mono);
  font-size: 0.54rem;
  letter-spacing: 0.1em;
  margin-bottom: 6px;
}

.legend-item {
  display: grid;
  grid-template-columns: 10px auto 1fr;
  align-items: center;
  column-gap: 6px;
  margin-bottom: 4px;
}

.legend-item--line {
  grid-template-columns: 22px auto;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-line {
  width: 20px;
  height: 2px;
  border-radius: 2px;
}

.legend-label {
  color: #d4f6ff;
  font-family: var(--font-mono);
  font-size: 0.56rem;
  letter-spacing: 0.05em;
}

.legend-note {
  color: #7fa8b6;
  font-family: var(--font-mono);
  font-size: 0.5rem;
  text-align: right;
}

.legend-range {
  margin-top: 2px;
  color: #9ddbf1;
  font-family: var(--font-mono);
  font-size: 0.52rem;
  letter-spacing: 0.05em;
}

.legend-note--meta {
  margin-top: 2px;
  text-align: left;
}

.legend-divider {
  margin: 0 5px;
  color: rgba(125, 176, 197, 0.75);
}

@media (max-width: 900px) {
  .topology-toolbar {
    left: 8px;
    right: 8px;
  }

  .toolbar-search,
  .toolbar-actions {
    width: 100%;
  }

  .toolbar-search {
    min-width: 0;
  }

  .toolbar-input {
    min-width: 0;
  }

  .topology-legend {
    left: 10px;
    right: 10px;
    bottom: 8px;
    flex-direction: column;
  }

  .legend-block {
    min-width: 0;
  }
}
</style>
