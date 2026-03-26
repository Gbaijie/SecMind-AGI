<!--
  组件职责：聊天页外层容器，负责页面级装配与路由承接。
  业务模块：对话业务页面
  主要数据流：路由进入 -> 页面容器 -> Chat 业务组件
-->

<template>
  <n-layout has-sider class="chat-page-layout">
    <n-layout-sider class="chat-page-sider" :width="292" bordered>
      <div class="chat-page-sider-inner">
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
      </div>
    </n-layout-sider>

    <n-layout-content class="chat-page-content">
      <ChatTerminal
        :current-session="currentSession"
        :messages="messages"
        :loading="loading"
        :error="error"
        :entry-hint="drilldownHint"
        :on-send-message="handleSendMessageWithHintClear"
        :on-regenerate="handleRegenerate"
        :on-edit-message="handleEditMessage"
        :messages-container-ref="messagesContainerRef"
        :chat-input-ref="chatInputRef"
      />
    </n-layout-content>
  </n-layout>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '../stores/chatStore'
import { NLayout, NLayoutContent, NLayoutSider } from 'naive-ui'
import api from '../api'
import SocSidebar from '../components/layout/SocSidebar.vue'
import { useChatSession } from '../composables/useChatSession'
import ChatTerminal from './Chat.vue'

const messagesContainerRef = ref(null)
const chatInputRef = ref(null)
const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const drilldownHint = ref('')

const {
  searchQuery,
  filteredSessions,
  currentSession,
  messages,
  loading,
  error,
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

const handleSendMessageWithHintClear = (...args) => {
  drilldownHint.value = ''
  return handleSendMessage(...args)
}

onMounted(async () => {
  await initializeChatSession()

  if (route.query.autoSend === 'true') {
    const draftText = chatStore.draftInputs?.[currentSession.value]
    if (draftText && draftText.trim()) {
      const normalizedDraft = draftText.trim()
      chatInputRef.value?.setContent(normalizedDraft)
      drilldownHint.value = '已预填看板下钻问题，可直接编辑后发送。'
      await nextTick()
      chatInputRef.value?.focus()
      // 移除 url 中的 autoSend 参数，避免刷新后重复显示入口状态
      router.replace({ query: { ...route.query, autoSend: undefined } })
    }
  }
})
</script>

<style scoped>
.chat-page-layout {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: transparent;
}

.chat-page-sider {
  background: transparent;
  padding-right: 0.9rem;
}

.chat-page-sider-inner {
  height: 100%;
  min-height: 0;
  padding: 0 0 0 15px; 
}

.chat-page-content {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

@media (max-width: 1024px) {
  .chat-page-sider {
    width: 250px !important;
    max-width: 250px;
    padding-right: 0.7rem;
  }
}

@media (max-width: 640px) {
  .chat-page-sider {
    width: 220px !important;
    max-width: 220px;
    padding-right: 0.55rem;
  }
}
</style>
