#!/usr/bin/env python3

# 修改前端 useChatSettings.js，添加硅基流动 provider 支持

with open('/root/DeepSoc/vue_frontend/src/composables/useChatSettings.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 修改 1: 添加硅基流动 provider 选项
old_providers = """const PROVIDER_OPTIONS = [
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'minimax', label: 'MiniMax' },
]"""

new_providers = """const PROVIDER_OPTIONS = [
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'siliconflow', label: 'SiliconFlow (硅基流动)' },
]"""

content = content.replace(old_providers, new_providers)

# 修改 2: 添加硅基流动模型列表
old_models = """const MODELS_BY_PROVIDER = {
  ollama: ['DeepSeek-R1:7b', 'Qwen3:8b', 'Llama3:8b'],
  openai: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  minimax: ['MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1', 'MiniMax-M2.1-highspeed', 'MiniMax-M2'],
}"""

new_models = """const MODELS_BY_PROVIDER = {
  ollama: ['DeepSeek-R1:7b', 'Qwen3:8b', 'Llama3:8b'],
  openai: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  minimax: ['MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1', 'MiniMax-M2.1-highspeed', 'MiniMax-M2'],
  siliconflow: ['DeepSeek-V3.2', 'DeepSeek-R1', 'Qwen2.5-72B'],
}"""

content = content.replace(old_models, new_models)

# 修改 3: 添加硅基流动 API Key 占位符
old_placeholder = """  const providerApiKeyPlaceholder = computed(() => {
    if (llmProvider.value === 'openai') return 'sk-...'
    if (llmProvider.value === 'deepseek') return 'sk-...'
    if (llmProvider.value === 'minimax') return '输入 MiniMax API Key'
    return 'Ollama 本地模式不需要 API Key'
  })"""

new_placeholder = """  const providerApiKeyPlaceholder = computed(() => {
    if (llmProvider.value === 'openai') return 'sk-...'
    if (llmProvider.value === 'deepseek') return 'sk-...'
    if (llmProvider.value === 'minimax') return '输入 MiniMax API Key'
    if (llmProvider.value === 'siliconflow') return 'sk-...（硅基流动 API Key）'
    return 'Ollama 本地模式不需要 API Key'
  })"""

content = content.replace(old_placeholder, new_placeholder)

with open('/root/DeepSoc/vue_frontend/src/composables/useChatSettings.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ 前端 useChatSettings.js 已更新，添加了硅基流动支持")
