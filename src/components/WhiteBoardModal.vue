<script setup>
import { ref, onMounted, computed, watch } from 'vue'

const props = defineProps(['modelValue'])
const emit = defineEmits(['close', 'send'])

const canvas = ref(null)
let ctx = null
let drawing = false

const lineWidth = ref(3)
const eraserMode = ref(false)
const red = ref(0),
  green = ref(0),
  blue = ref(0)

const currentColor = computed(
  () => `rgb(${red.value}, ${green.value}, ${blue.value})`
)

watch(currentColor, (newColor) => {
  if (ctx && !eraserMode.value) ctx.strokeStyle = newColor
})
watch(lineWidth, (newWidth) => {
  if (ctx) ctx.lineWidth = newWidth
})

const toggleEraser = () => {
  eraserMode.value = !eraserMode.value
  if (ctx)
    ctx.strokeStyle = eraserMode.value
      ? 'white'
      : currentColor.value
}

const allClear = () => {
  if (!ctx) return
  ctx.fillStyle = 'white'
  ctx.fillRect(
    0,
    0,
    canvas.value.width,
    canvas.value.height
  )
}

const handleSend = () => {
  canvas.value.toBlob((blob) => {
    if (blob) emit('send', blob)
  }, 'image/png')
}

// 座標取得の共通化（マウス/タッチ両対応）
const getPos = (e) => {
  const rect = canvas.value.getBoundingClientRect()

  // 表示サイズと内部解像度の比率を計算
  const scaleX = canvas.value.width / rect.width
  const scaleY = canvas.value.height / rect.height

  const clientX = e.touches
    ? e.touches[0].clientX
    : e.clientX
  const clientY = e.touches
    ? e.touches[0].clientY
    : e.clientY

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  }
}

const startDrawing = (e) => {
  drawing = true
  const pos = getPos(e)
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y)
  e.preventDefault()
}

const doDrawing = (e) => {
  if (!drawing) return
  const pos = getPos(e)
  ctx.lineTo(pos.x, pos.y)
  ctx.stroke()
  e.preventDefault()
}

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  allClear()
})
</script>

<template>
  <div
    class="modal-overlay"
    @mousedown.self="$emit('close')"
  >
    <div class="whiteboard-card">
      <div class="wb-header">
        <h3>手書きメッセージ</h3>
        <button @click="$emit('close')" class="close-x">
          ×
        </button>
      </div>

      <canvas
        ref="canvas"
        width="400"
        height="300"
        @mousedown="startDrawing"
        @mousemove="doDrawing"
        @mouseup="drawing = false"
        @touchstart="startDrawing"
        @touchmove="doDrawing"
        @touchend="drawing = false"
      ></canvas>

      <div class="controls">
        <div class="tools-row">
          <button
            @click="toggleEraser"
            :class="{ active: eraserMode }"
          >
            🧽 {{ eraserMode ? 'ペン' : '消しゴム' }}
          </button>
          <button @click="allClear">🗑️ 全消し</button>
          <input
            type="range"
            v-model="lineWidth"
            min="1"
            max="20"
            title="太さ"
          />
        </div>
        <div class="colors-row">
          <input
            type="range"
            v-model="red"
            min="0"
            max="255"
            class="r-slide"
          />
          <input
            type="range"
            v-model="green"
            min="0"
            max="255"
            class="g-slide"
          />
          <input
            type="range"
            v-model="blue"
            min="0"
            max="255"
            class="b-slide"
          />
          <div
            class="preview"
            :style="{ backgroundColor: currentColor }"
          ></div>
        </div>
      </div>

      <button @click="handleSend" class="send-draw-btn">
        🚀 この画像を送る
      </button>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}
.whiteboard-card {
  background: #1e1e1e;
  padding: 20px;
  border-radius: 20px;
  width: 90%;
  max-width: 450px;
}
.wb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
canvas {
  background: white;
  width: 100%;
  height: auto;
  border-radius: 8px;
  cursor: default;
  touch-action: none;
}
.controls {
  margin: 15px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tools-row,
.colors-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.preview {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid #fff;
}
.send-draw-btn {
  width: 100%;
  padding: 12px;
  background: #52c41a;
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: bold;
  cursor: pointer;
}
.r-slide {
  accent-color: red;
}
.g-slide {
  accent-color: green;
}
.b-slide {
  accent-color: blue;
}
</style>
