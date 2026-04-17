<!--
  组件职责：渲染全局动态背景并管理动画帧与尺寸监听。
  业务模块：视觉背景层
  主要数据流：窗口尺寸/时间帧 -> canvas 绘制 -> 背景视觉输出
-->

<template>
  <div class="fui-bg" aria-hidden="true" />
</template>

<style scoped>
.fui-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-color: #050814;
  pointer-events: none;
}
</style>
