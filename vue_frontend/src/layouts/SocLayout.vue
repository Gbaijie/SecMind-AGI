<template>
  <div class="soc-dashboard">
    <SocHeader
      :current-session="currentSession"
      :current-time="currentTime"
      :is-sidebar-open="isSidebarOpen"
      @toggle-sidebar="toggleSidebar"
      @open-settings="openSettingsModal"
    />

    <main class="soc-main">
      <Splitpanes class="soc-split" :horizontal="isCompactLayout">
        <Pane
          v-if="isSidebarOpen"
          class="pane-left"
          :size="leftPaneSize"
          :min-size="isCompactLayout ? 20 : 14"
          :max-size="isCompactLayout ? 36 : 30"
        >
          <aside class="panel-left">
            <SocSidebar
              :search-query="searchQuery"
              :filtered-sessions="filteredSessions"
              :current-session="currentSession"
              @update:search-query="searchQuery = $event"
              @select-session="handleSelectSession"
              @delete-session="handleDeleteSession"
              @create-session="handleCreateSession"
              @clear-history="handleClearHistory"
            />
          </aside>
        </Pane>

        <Pane
          class="pane-center"
          :size="centerPaneSize"
          :min-size="isCompactLayout ? 34 : 38"
        >
          <section class="panel-center">
            <div ref="topologyPanelRef" class="topology-panel-host" v-if="!isTopologyCollapsed">
              <FuiCard title="GLOBAL ATTACK TOPOLOGY" class="center-topology-card" :glow="true">
                <template #actions>
                  <button
                    class="fui-icon-btn"
                    :title="isPanelActive('topology') ? '退出全屏拓扑图' : '全屏拓扑图'"
                    @click="toggleTopologyFullscreen"
                  >
                    <MinimizeIcon v-if="isPanelActive('topology')" class="btn-icon" />
                    <MaximizeIcon v-else class="btn-icon" />
                  </button>
                  <button class="fui-icon-btn" @click="toggleTopology" title="折叠拓扑图">
                    <ChevronUpIcon class="btn-icon" />
                  </button>
                </template>
                <TopologyScene :topology="dashboardStats.topology" />
              </FuiCard>
            </div>

            <div v-else class="topology-collapsed-bar">
              <button class="topology-restore-btn" @click="toggleTopology">
                <ChevronDownIcon class="btn-icon" />
                SHOW GLOBAL ATTACK TOPOLOGY
              </button>
            </div>

            <Chat
              :current-session="currentSession"
              :messages="messages"
              :loading="loading"
              :error="error"
              :on-send-message="handleSendMessage"
              :on-regenerate="handleRegenerate"
              :on-edit-message="handleEditMessage"
              :messages-container-ref="messagesContainerRef"
              :chat-input-ref="chatInputRef"
            />
          </section>
        </Pane>

        <Pane
          class="pane-right"
          :size="rightPaneSize"
          :min-size="isCompactLayout ? 24 : 20"
        >
          <aside class="panel-right">
            <SocRightPanel :dashboard-stats="dashboardStats" :stats-loading="statsLoading" />
          </aside>
        </Pane>
      </Splitpanes>
    </main>

    <Teleport to="body">
      <div
        v-if="fallbackPanelKey === 'topology'"
        class="topology-modal-mask"
        role="dialog"
        aria-modal="true"
        @click.self="closeTopologyFallback"
      >
        <div class="topology-modal-wrap">
          <NCard class="topology-modal-card" :bordered="false" embedded>
            <template #header>
              <span class="topology-modal-title">GLOBAL ATTACK TOPOLOGY</span>
            </template>
            <template #header-extra>
              <NButton
                class="fui-icon-btn"
                quaternary
                circle
                aria-label="Close topology fullscreen"
                @click="closeTopologyFallback"
              >
                <XIcon class="btn-icon" />
              </NButton>
            </template>
            <div class="topology-modal-content">
              <TopologyScene :topology="dashboardStats.topology" />
            </div>
          </NCard>
        </div>
      </div>
    </Teleport>

    <div v-if="showSettingsModal" class="fui-modal-overlay" @click.self="closeSettingsModal">
      <FuiCard title="SYSTEM CONFIG" class="fui-modal-card" :clip="18">
        <template #actions>
          <button class="fui-icon-btn" @click="closeSettingsModal"><XIcon class="btn-icon" /></button>
        </template>

        <div class="modal-body">
          <div class="modal-field">
            <label class="modal-label">EXPORT SESSION</label>
            <select class="fui-select" v-model="selectedSessionForExport">
              <option v-for="s in sessions" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>

          <div class="modal-field">
            <label class="modal-label">MODEL PROVIDER</label>
            <select class="fui-select" :value="llmProvider" @change="updateProvider($event.target.value)">
              <option v-for="provider in availableProviders" :key="provider.value" :value="provider.value">
                {{ provider.label }}
              </option>
            </select>
          </div>

          <div class="modal-field">
            <label class="modal-label">MODEL NAME</label>
            <select class="fui-select" :value="llmModel" @change="updateModel($event.target.value)">
              <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>

          <div class="modal-field">
            <label class="modal-label">PROVIDER API KEY</label>
            <input
              class="fui-input"
              type="password"
              :value="providerApiKey"
              :placeholder="providerApiKeyPlaceholder"
              :disabled="llmProvider === 'ollama'"
              autocomplete="off"
              @input="updateProviderApiKey($event.target.value)"
            />
            <span v-if="llmProvider === 'ollama'" class="modal-tip">本地 Ollama 不需要 API Key。</span>
            <span v-else class="modal-tip">API Key 仅保存在当前浏览器本地并随请求发送到后端。</span>
          </div>

          <div class="modal-field">
            <label class="modal-label">WEB SEARCH API KEY</label>
            <input
              class="fui-input"
              type="password"
              :value="webSearchApiKey"
              :placeholder="webSearchApiKeyPlaceholder"
              autocomplete="off"
              @input="updateWebSearchApiKey($event.target.value)"
            />
            <span class="modal-tip">联网搜索 API Key 仅保存在当前浏览器本地并随请求发送到后端。</span>
          </div>

          <div class="modal-actions">
            <button class="primary" :disabled="isExporting" @click="handleExportSelectedSession">
              <DownloadIcon class="btn-icon" />
              {{ isExporting ? 'EXPORTING...' : 'EXPORT HTML' }}
            </button>
            <button class="danger" @click="handleLogoutFromModal">
              <LogoutIcon class="btn-icon" />
              LOGOUT
            </button>
          </div>
        </div>
      </FuiCard>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard } from 'naive-ui'
import { Pane, Splitpanes } from 'splitpanes'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  LogoutIcon,
  MaximizeIcon,
  MinimizeIcon,
  XIcon,
} from 'vue-tabler-icons'
import 'splitpanes/dist/splitpanes.css'
import api from '../api'
import FuiCard from '../components/FuiCard.vue'
import TopologyScene from '../components/TopologyScene.vue'
import SocHeader from '../components/layout/SocHeader.vue'
import SocSidebar from '../components/layout/SocSidebar.vue'
import SocRightPanel from '../components/layout/SocRightPanel.vue'
import { useClock } from '../composables/useClock'
import { useDashboardStats } from '../composables/useDashboardStats'
import { useChatSession } from '../composables/useChatSession'
import { useChatSettings } from '../composables/useChatSettings'
import { useFullscreenPanel } from '../composables/useFullscreenPanel'
import { useAppStore } from '../stores/appStore'
import Chat from '../views/Chat.vue'

const router = useRouter()
const appStore = useAppStore()
const isTopologyCollapsed = ref(false)
const isCompactLayout = ref(false)
const messagesContainerRef = ref(null)
const chatInputRef = ref(null)
const topologyPanelRef = ref(null)

const { currentTime } = useClock()
const { dashboardStats, statsLoading } = useDashboardStats(api)
const {
  searchQuery,
  sessions,
  currentSession,
  messages,
  loading,
  error,
  filteredSessions,
  handleSelectSession,
  handleDeleteSession,
  handleCreateSession,
  handleClearHistory,
  handleSendMessage,
  handleRegenerate,
  handleEditMessage,
  initializeChatSession,
} = useChatSession({
  apiClient: api,
  messagesContainerRef,
  chatInputRef,
})

const {
  showSettingsModal,
  isExporting,
  selectedSessionForExport,
  llmProvider,
  llmModel,
  providerApiKey,
  webSearchApiKey,
  availableProviders,
  availableModels,
  providerApiKeyPlaceholder,
  webSearchApiKeyPlaceholder,
  updateProvider,
  updateModel,
  updateProviderApiKey,
  updateWebSearchApiKey,
  openSettingsModal,
  closeSettingsModal,
  handleExportSelectedSession,
  handleLogoutFromModal,
} = useChatSettings({
  router,
  apiClient: api,
  currentSession,
  sessions,
})

const { fallbackPanelKey, togglePanel, closeFallbackPanel, isPanelActive } = useFullscreenPanel({
  topology: topologyPanelRef,
})

const isSidebarOpen = computed(() => appStore.isSidebarOpen)

const leftPaneSize = computed(() => (isCompactLayout.value ? 26 : 20))

const centerPaneSize = computed(() => {
  if (isSidebarOpen.value) {
    return isCompactLayout.value ? 44 : 52
  }
  return isCompactLayout.value ? 58 : 68
})

const rightPaneSize = computed(() => {
  if (isSidebarOpen.value) {
    return isCompactLayout.value ? 30 : 28
  }
  return isCompactLayout.value ? 42 : 32
})

const toggleSidebar = () => {
  appStore.toggleSidebar()
}

const toggleTopology = () => {
  isTopologyCollapsed.value = !isTopologyCollapsed.value
}

const toggleTopologyFullscreen = () => {
  togglePanel('topology')
}

const closeTopologyFallback = () => {
  closeFallbackPanel()
}

const syncLayoutMode = () => {
  isCompactLayout.value = window.innerWidth <= 1024
}

onMounted(() => {
  initializeChatSession()
  syncLayoutMode()
  window.addEventListener('resize', syncLayoutMode)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncLayoutMode)
})
</script>

<style scoped>
.soc-dashboard {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: 52px 1fr;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.soc-main {
  min-height: 0;
  padding: 0.85rem;
  overflow: hidden;
}

.soc-split {
  width: 100%;
  height: 100%;
}

.soc-split :deep(.splitpanes__pane) {
  min-height: 0;
  background: transparent;
  box-sizing: border-box;
  padding: 0 0.32rem;
}

.soc-split :deep(.splitpanes__pane:first-child) {
  padding-left: 0;
}

.soc-split :deep(.splitpanes__pane:last-child) {
  padding-right: 0;
}

.soc-split :deep(.splitpanes__splitter) {
  position: relative;
  background: transparent;
  transition: background-color 0.2s ease;
}

.soc-split :deep(.splitpanes__splitter::before) {
  content: '';
  position: absolute;
  inset: 10px 3px;
  border-radius: 6px;
  border: 1px solid rgba(0, 229, 255, 0.2);
  background: linear-gradient(180deg, rgba(0, 229, 255, 0.1), rgba(0, 229, 255, 0.03));
}

.soc-split :deep(.splitpanes__splitter:hover::before) {
  border-color: rgba(0, 229, 255, 0.52);
  box-shadow: 0 0 12px rgba(0, 229, 255, 0.18);
}

.soc-split :deep(.splitpanes--vertical > .splitpanes__splitter) {
  width: 14px;
  background: linear-gradient(90deg, transparent 0%, rgba(0, 229, 255, 0.1) 50%, transparent 100%);
}

.soc-split :deep(.splitpanes--horizontal > .splitpanes__splitter) {
  height: 14px;
  background: linear-gradient(180deg, transparent 0%, rgba(0, 229, 255, 0.1) 50%, transparent 100%);
}

.soc-split :deep(.splitpanes--horizontal > .splitpanes__splitter::before) {
  inset: 3px 10px;
}

.panel-left,
.panel-right {
  display: flex;
  flex-direction: column;
}

.panel-center {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  overflow: hidden;
}

.panel-center :deep(.terminal-shell) {
  flex: 1;
  min-height: 0;
}

.topology-panel-host {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}

.topology-panel-host:fullscreen,
.topology-panel-host:-webkit-full-screen {
  background: #050814;
  padding: 0.9rem;
}

.topology-panel-host:fullscreen .center-topology-card,
.topology-panel-host:-webkit-full-screen .center-topology-card {
  min-height: 0;
  height: 100%;
}

.topology-panel-host:fullscreen .center-topology-card :deep(.fui-card-body),
.topology-panel-host:-webkit-full-screen .center-topology-card :deep(.fui-card-body),
.topology-panel-host:fullscreen :deep(.topology-scene),
.topology-panel-host:-webkit-full-screen :deep(.topology-scene) {
  min-height: 0;
  height: 100%;
}

.center-topology-card {
  min-height: 220px;
  height: clamp(220px, 34vh, 360px);
  flex: 0 0 auto;
}

.center-topology-card :deep(.fui-card-body) {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.topology-collapsed-bar {
  flex-shrink: 0;
  padding: 0.2rem 0;
}

.topology-restore-btn {
  width: 100%;
  height: 34px;
  border: 1px dashed rgba(0, 229, 255, 0.35);
  background: rgba(0, 229, 255, 0.05);
  color: #8fd0e8;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.topology-restore-btn:hover {
  border-color: rgba(0, 229, 255, 0.62);
  color: var(--neon-cyan);
  box-shadow: inset 0 0 10px rgba(0, 229, 255, 0.12);
}

.panel-right {
  overflow-y: auto;
  padding-right: 0.2rem;
}

.panel-right::-webkit-scrollbar {
  width: 5px;
}

.panel-right::-webkit-scrollbar-thumb {
  background: rgba(0, 229, 255, 0.24);
}

.topology-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 10120;
  background: rgba(3, 8, 18, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.2rem;
}

.topology-modal-wrap {
  width: min(1180px, 94vw);
}

.topology-modal-card {
  height: min(82vh, 900px);
  min-height: 520px;
  border: 1px solid rgba(0, 229, 255, 0.3);
  background: rgba(7, 15, 30, 0.95);
}

.topology-modal-card :deep(.n-card-header) {
  border-bottom: 1px solid rgba(0, 229, 255, 0.2);
  background: linear-gradient(90deg, rgba(0, 229, 255, 0.09), transparent 60%);
}

.topology-modal-card :deep(.n-card__content) {
  min-height: 0;
  height: calc(100% - 56px);
  padding-top: 0.7rem;
  display: flex;
  flex-direction: column;
}

.topology-modal-title {
  font-family: var(--font-ui);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.11em;
  color: var(--neon-cyan);
}

.topology-modal-content {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.topology-modal-content :deep(.topology-scene) {
  min-height: 0;
  height: 100%;
}

.fui-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 8, 22, 0.72);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 140;
}

.fui-modal-card {
  width: min(520px, calc(100vw - 2rem));
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 0.36rem;
}

.modal-label {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.11em;
  color: #89a8ba;
}

.fui-select,
.fui-input {
  height: 36px;
  border: 1px solid rgba(0, 229, 255, 0.25);
  background: rgba(3, 10, 24, 0.8);
  color: var(--text-main);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 0 0.6rem;
}

.fui-input::placeholder {
  color: #6f95a9;
}

.fui-select:focus,
.fui-input:focus {
  outline: none;
  border-color: rgba(0, 229, 255, 0.52);
}

.fui-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.modal-tip {
  font-size: 0.58rem;
  color: #7ca4b8;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
}

.fui-icon-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0, 229, 255, 0.24);
  background: rgba(0, 229, 255, 0.06);
  color: var(--neon-cyan);
  cursor: pointer;
  transition: all 0.2s ease;
}

.fui-icon-btn:hover {
  border-color: rgba(0, 229, 255, 0.52);
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.18);
}

.btn-icon {
  width: 14px;
  height: 14px;
  display: block;
  flex-shrink: 0;
  color: currentColor;
}

.fui-icon-btn :deep(svg),
.fui-icon-btn :deep(svg *),
.modal-actions button :deep(svg),
.modal-actions button :deep(svg *),
.topology-restore-btn :deep(svg),
.topology-restore-btn :deep(svg *) {
  color: currentColor;
  stroke: currentColor;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.62rem;
  padding-top: 0.2rem;
}

.modal-actions button {
  min-width: 132px;
  height: 34px;
  border: 1px solid rgba(0, 229, 255, 0.32);
  background: rgba(0, 229, 255, 0.08);
  color: var(--neon-cyan);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.1em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.34rem;
  cursor: pointer;
}

.modal-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-actions .primary:hover:not(:disabled) {
  border-color: rgba(0, 229, 255, 0.58);
  box-shadow: 0 0 12px rgba(0, 229, 255, 0.18);
}

.modal-actions .danger {
  color: #ff7ea8;
  border-color: rgba(255, 0, 85, 0.32);
  background: rgba(255, 0, 85, 0.11);
}

.modal-actions .danger:hover {
  border-color: rgba(255, 0, 85, 0.58);
  box-shadow: 0 0 12px rgba(255, 0, 85, 0.2);
}

@media (max-width: 1320px) {
  .soc-main {
    padding: 0.78rem;
  }

  .center-topology-card {
    min-height: 208px;
  }
}

@media (max-width: 1024px) {
  .soc-dashboard {
    grid-template-rows: 48px 1fr;
  }

  .soc-main {
    padding: 0.7rem;
  }

  .center-topology-card {
    flex: 0 0 auto;
    min-height: 260px;
  }

  .panel-right {
    overflow: visible;
    padding-right: 0;
  }

  .topology-modal-wrap {
    width: min(980px, 96vw);
  }

  .topology-modal-card {
    height: min(72vh, 760px);
    min-height: 430px;
  }

  .modal-actions {
    flex-direction: column;
  }

  .modal-actions button {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .soc-main {
    padding: 0.56rem;
  }

  .topology-restore-btn {
    font-size: 0.55rem;
  }
}
</style>
