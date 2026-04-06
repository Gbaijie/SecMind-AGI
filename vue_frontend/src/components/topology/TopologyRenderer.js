import * as THREE from 'three'
import {
    getLinkStyle,
    getNodeStyle,
} from './TopologyDataAdapter.js'

// ── 工具 ─────────────────────────────────────────
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const lerp = (a, b, t) => a + (b - a) * t
const easeOutCubic = (v) => 1 - Math.pow(1 - v, 3)

const getRiskPulseBias = (riskLevel) => {
    if (riskLevel === 'critical') return 1
    if (riskLevel === 'high') return 0.82
    if (riskLevel === 'medium') return 0.66
    return 0.46
}

const disposeMaterial = (material) => {
    if (!material) return
    const one = (m) => {
        if (!m) return
        for (const k of ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
            m[k]?.dispose?.()
        }
        m.dispose?.()
    }
    Array.isArray(material) ? material.forEach(one) : one(material)
}

const ensureVector = (node, index, total) => {
    const fallbackRadius = 24
    const angle = (index / Math.max(total, 1)) * Math.PI * 2
    return new THREE.Vector3(
        Number.isFinite(node?.x) ? node.x : Math.cos(angle) * fallbackRadius,
        Number.isFinite(node?.y) ? node.y : ((index % 4) - 1.5) * 3,
        Number.isFinite(node?.z) ? node.z : Math.sin(angle) * fallbackRadius,
    )
}

// ── 贝塞尔曲线生成 ────────────────────────────────
const BEZIER_SEGMENTS = 32

const buildBezierCurve = (from, to) => {
    const dist = from.distanceTo(to)
    const lift = clamp(dist * 0.22, 2, 14)
    const ctrl = new THREE.Vector3(
        (from.x + to.x) / 2 + (Math.random() - 0.5) * dist * 0.14,
        (from.y + to.y) / 2 + lift,
        (from.z + to.z) / 2 + (Math.random() - 0.5) * dist * 0.14,
    )
    return new THREE.QuadraticBezierCurve3(from, ctrl, to)
}

// ── Canvas Sprite ─────────────────────────────────
const createCanvasTextSprite = (text, colorHex, options = {}) => {
    const value = String(text || '').trim().slice(0, 28)
    if (!value) return null
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const fontSize = options.fontSize || 28
    const padX = options.paddingX || 22
    const padY = options.paddingY || 13
    const renderScale = options.renderScale || 2
    ctx.font = `700 ${fontSize}px "HarmonyOS Sans SC", "HarmonyOS Sans", "PingFang SC", "Microsoft YaHei", sans-serif`
    const w = Math.max(120, Math.ceil(ctx.measureText(value).width) + padX * 2)
    const h = fontSize + padY * 2
    canvas.width = Math.ceil(w * renderScale); canvas.height = Math.ceil(h * renderScale)
    ctx.scale(renderScale, renderScale)
    ctx.font = `700 ${fontSize}px "HarmonyOS Sans SC", "HarmonyOS Sans", "PingFang SC", "Microsoft YaHei", sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(5,8,20,0.72)'; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(0,229,255,0.3)'; ctx.lineWidth = 2
    ctx.strokeRect(1, 1, w - 2, h - 2)
    ctx.fillStyle = colorHex; ctx.fillText(value, padX, h / 2)
    const tex = new THREE.CanvasTexture(canvas)
    tex.minFilter = tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.96, depthWrite: false })
    const sp = new THREE.Sprite(mat)
    const hs = (options.scale || 1) * 1.5
    sp.scale.set((w / h) * hs, hs, 1)
    sp.renderOrder = 3
    sp.userData = { pixelWidth: w, pixelHeight: h, aspect: w / h, baseScale: hs }
    return sp
}

// ── 流动粒子配置 ──────────────────────────────────
const FLOW_PARTICLE_COUNT = 8
const FLOW_PARTICLE_RADIUS = 0.17
const LINK_PULSE_TAIL_OFFSET = 0.08
const LABEL_LAYER_ORDER = {
    core: 3,
    db_type: 2,
    tag: 1,
}
const LABEL_BASE_GAP = 10
const LABEL_COLLISION_PADDING = 8
const createRadialDiskTexture = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 128)
    gradient.addColorStop(0, 'rgba(110, 235, 255, 0.34)')
    gradient.addColorStop(0.42, 'rgba(34, 170, 255, 0.18)')
    gradient.addColorStop(0.72, 'rgba(10, 58, 96, 0.10)')
    gradient.addColorStop(1, 'rgba(5, 8, 20, 0)')

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 256, 256)

    ctx.strokeStyle = 'rgba(137, 214, 255, 0.16)'
    ctx.lineWidth = 2
    for (let i = 1; i <= 4; i++) {
        ctx.beginPath()
        ctx.arc(128, 128, i * 22, 0, Math.PI * 2)
        ctx.stroke()
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    return texture
}
// 扫描光环配置
const SCAN_RING_MAX_RADIUS = 52
const SCAN_RING_INTERVAL = 4200  // ms 完成一圈

export class TopologyRenderer {
    constructor(options = {}) {
        this.options = {
            backgroundColor: 0x050814,
            fogNear: 62, fogFar: 148,
            pixelRatioCap: 1.5,
            rotationSpeed: 0.0026,
            maxRenderNodes: options.maxRenderNodes || 400,
            maxRenderLinks: options.maxRenderLinks || 900,
            topTagLabelCount: options.topTagLabelCount || 14,
            lerpSpeed: 8,          // opacity/scale lerp 速度（per second）
            ...options,
        }

        this.container = null
        this.scene = null
        this.camera = null
        this.renderer = null
        this.networkGroup = null
        this.resizeObserver = null
        this.frameId = null
        this.lastFrameTime = 0

        this.starField = null
        this.deepStarField = null
        this._starPhases = null
        this.nebulaLayers = []
        this.focusHaloMesh = null
        this.focusHaloPulse = 0
        this.depthFocus = 0

        // 扫描光环
        this.scanRingMesh = null
        this.scanRingT = 0    // 0~1 进度

        // 流动粒子池
        this.flowParticles = []
        this.linkPulses = []

        this.autoRotate = true
        // 用于记录因为用户交互临时暂停 autoRotate 的先前状态
        this._autoRotatePaused = false
        this.isUserInteracting = false
        this.pointerParallax = new THREE.Vector2(0, 0)
        this.pointerParallaxTarget = new THREE.Vector2(0, 0)
        this.model = null
        this.nodeRecords = []
        this.nodeRecordMap = new Map()
        this.linkRecords = []
        this.adjacencyMap = new Map()
        this.activeNodeState = { hoveredNodeId: '', focusedNodeId: '', pinnedNodeId: '' }
        this.resourceCache = { geometries: new Map(), materials: new Map() }
        this.labelLayoutDirty = true
        this.labelLayoutLastRun = 0

        // 节点过滤函数（null = 显示全部）
        this.nodeFilter = null

        this.defaultCameraPosition = new THREE.Vector3(0, 10, 62)
        this.defaultCameraTarget = new THREE.Vector3(0, 0, 0)
        this.onTick = null
    }

    // ── 挂载 ─────────────────────────────────────
    mount(container) {
        if (!container) return
        this.container = container
        this.initScene()
        this.initRenderer()
        this.initEnvironment()
        this.startLoop()
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.resize())
            this.resizeObserver.observe(container)
        }
        this.resize()
    }

    initScene() {
        this.scene = new THREE.Scene()
        this.scene.fog = new THREE.Fog(this.options.backgroundColor, this.options.fogNear, this.options.fogFar)
        this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300)
        this.camera.position.copy(this.defaultCameraPosition)
        this.camera.lookAt(this.defaultCameraTarget)
        this.networkGroup = new THREE.Group()
        this.scene.add(this.networkGroup)
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.options.pixelRatioCap))
        this.renderer.setClearColor(this.options.backgroundColor, 0)
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;position:absolute;inset:0'
        this.container.appendChild(this.renderer.domElement)
    }

    initEnvironment() {
        // 灯光
        this.scene.add(new THREE.AmbientLight(0x5a88ff, 0.55))
        const kl = new THREE.PointLight(0x00e5ff, 1.1, 200)
        kl.position.set(20, 18, 24); this.scene.add(kl)
        const sl = new THREE.PointLight(0x95b6ff, 0.72, 210)
        sl.position.set(-24, -8, -18); this.scene.add(sl)

        // ── 星尘粒子 ──────────────────────────────
        const N = 240
        const pos = new Float32Array(N * 3)
        this._starPhases = new Float32Array(N)
        for (let i = 0; i < N; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 160
            pos[i * 3 + 1] = (Math.random() - 0.5) * 100
            pos[i * 3 + 2] = (Math.random() - 0.5) * 160
            this._starPhases[i] = Math.random() * Math.PI * 2
        }
        const sg = new THREE.BufferGeometry()
        sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        this.starField = new THREE.Points(sg, new THREE.PointsMaterial({
            color: 0x5bcfff, size: 0.46, transparent: true, opacity: 0.5,
        }))
        this.scene.add(this.starField)

        const deepGeo = new THREE.BufferGeometry()
        const deepPos = new Float32Array(N * 3)
        for (let i = 0; i < N; i++) {
            deepPos[i * 3] = (Math.random() - 0.5) * 210
            deepPos[i * 3 + 1] = (Math.random() - 0.5) * 140
            deepPos[i * 3 + 2] = (Math.random() - 0.5) * 210
        }
        deepGeo.setAttribute('position', new THREE.BufferAttribute(deepPos, 3))
        this.deepStarField = new THREE.Points(deepGeo, new THREE.PointsMaterial({
            color: 0xa5d4ff, size: 0.28, transparent: true, opacity: 0.2,
        }))
        this.scene.add(this.deepStarField)

        // ── 极坐标网格地面 ─────────────────────────
        const diskGeo = new THREE.CircleGeometry(SCAN_RING_MAX_RADIUS, 96)
        diskGeo.rotateX(-Math.PI / 2)
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00e5ff,
            map: createRadialDiskTexture(),
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
        this.scanRingMesh = new THREE.Mesh(diskGeo, ringMat)
        this.scanRingMesh.position.y = -12.5
        this.scanRingMesh.renderOrder = 0
        this.scene.add(this.scanRingMesh)

        const focusHaloGeo = new THREE.RingGeometry(0.7, 1, 64)
        focusHaloGeo.rotateX(-Math.PI / 2)
        const focusHaloMat = new THREE.MeshBasicMaterial({
            color: 0x86d8ff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
        })
        this.focusHaloMesh = new THREE.Mesh(focusHaloGeo, focusHaloMat)
        this.focusHaloMesh.visible = false
        this.focusHaloMesh.renderOrder = 5
        this.networkGroup.add(this.focusHaloMesh)
    }

    // ── 资源缓存 ──────────────────────────────────
    getSphereGeometry(radius, w = 20, h = 20) {
        const key = `sph:${Number(radius).toFixed(2)}:${w}:${h}`
        if (!this.resourceCache.geometries.has(key)) {
            this.resourceCache.geometries.set(key, new THREE.SphereGeometry(radius, w, h))
        }
        return this.resourceCache.geometries.get(key)
    }

    getMaterialTemplate(key, factory) {
        if (!this.resourceCache.materials.has(key)) {
            this.resourceCache.materials.set(key, factory())
        }
        return this.resourceCache.materials.get(key)
    }

    makeLineGradientColors(startHex, endHex, segments) {
        const start = new THREE.Color(startHex)
        const end = new THREE.Color(endHex)
        const colors = []
        for (let i = 0; i <= segments; i++) {
            const t = i / Math.max(segments, 1)
            const ease = 0.5 - 0.5 * Math.cos(t * Math.PI)
            const color = start.clone().lerp(end, ease)
            colors.push(color.r, color.g, color.b)
        }
        return new Float32Array(colors)
    }

    cloneMaterialTemplate(key, factory) {
        return this.getMaterialTemplate(key, factory).clone()
    }

    worldToScreen(point) {
        if (!this.camera || !this.renderer?.domElement) return null
        const rect = this.renderer.domElement.getBoundingClientRect()
        if (!rect.width || !rect.height) return null
        const projected = point.clone().project(this.camera)
        return {
            x: ((projected.x + 1) / 2) * rect.width,
            y: ((-projected.y + 1) / 2) * rect.height,
            z: projected.z,
        }
    }

    screenToWorld(x, y, ndcZ) {
        if (!this.camera || !this.renderer?.domElement) return null
        const rect = this.renderer.domElement.getBoundingClientRect()
        if (!rect.width || !rect.height) return null
        return new THREE.Vector3(
            (x / rect.width) * 2 - 1,
            -((y / rect.height) * 2 - 1),
            ndcZ,
        ).unproject(this.camera)
    }

    // ── 模型 setter ───────────────────────────────
    setTopologyModel(model) {
        this.model = model || null
        this.labelLayoutDirty = true
        this.rebuild()
        this.updateHighlightState()
    }

    setAutoRotate(en) { this.autoRotate = Boolean(en) }
    toggleAutoRotate() { this.autoRotate = !this.autoRotate; return this.autoRotate }

    setPointerParallax(nx, ny) {
        this.pointerParallaxTarget.x = clamp(nx, -1, 1)
        this.pointerParallaxTarget.y = clamp(ny, -1, 1)
    }

    // ── 节点过滤（动画隐藏） ──────────────────────
    /**
     * filterFn: (nodeRecord) => boolean | null（null 清除过滤）
     * 当节点不通过过滤时 tgtScale → 0，否则正常高亮逻辑
     */
    setNodeFilter(filterFn) {
        this.nodeFilter = filterFn || null
        this.labelLayoutDirty = true
        this.updateHighlightState()
    }

    // ── 选中状态 ──────────────────────────────────
    setHoveredNodeId(id) { this.activeNodeState.hoveredNodeId = id || ''; this.labelLayoutDirty = true; this.updateHighlightState() }
    setFocusedNodeId(id) { this.activeNodeState.focusedNodeId = id || ''; this.labelLayoutDirty = true; this.updateHighlightState() }
    setPinnedNodeId(id) {
        this.activeNodeState.pinnedNodeId = id || ''
        if (this.activeNodeState.pinnedNodeId) this.activeNodeState.focusedNodeId = id
        this.labelLayoutDirty = true
        this.updateHighlightState()
    }
    clearSelection() {
        this.activeNodeState = { hoveredNodeId: '', focusedNodeId: '', pinnedNodeId: '' }
        this.labelLayoutDirty = true
        this.updateHighlightState()
    }

    getActiveNodeId() {
        return this.activeNodeState.hoveredNodeId
            || this.activeNodeState.pinnedNodeId
            || this.activeNodeState.focusedNodeId || ''
    }
    getActiveNodeRecord() { return this.getNodeRecord(this.getActiveNodeId()) }
    getNodeRecord(id) { return this.nodeRecordMap.get(String(id || '')) || null }

    getNodeWorldPosition(id) {
        const r = this.getNodeRecord(id)
        if (!r?.mesh) return null
        const wp = new THREE.Vector3()
        r.mesh.updateWorldMatrix(true, false)
        r.mesh.getWorldPosition(wp)
        return wp
    }

    projectNodeToScreen(id) {
        if (!this.container || !this.camera) return null
        const wp = this.getNodeWorldPosition(id)
        if (!wp) return null
        const rect = this.renderer?.domElement?.getBoundingClientRect?.()
        if (!rect) return null
        const p = wp.clone().project(this.camera)
        return { x: ((p.x + 1) / 2) * rect.width, y: ((-p.y + 1) / 2) * rect.height }
    }

    getNodeTooltipPayload(nodeId, options = {}) {
        const r = this.getNodeRecord(nodeId)
        if (!r) return null
        const pos = options.position || this.projectNodeToScreen(nodeId)
        return {
            show: true,
            x: Math.round(pos?.x ?? 0), y: Math.round(pos?.y ?? 0),
            title: r.name || r.id,
            type: r.typeLabel || r.type || '',
            valueText: String(r.value ?? 0),
            degreeText: String(r.degree ?? 0),
            riskLevel: r.riskLevel || 'low',
            nodeId: r.id,
            pinnedNodeId: this.activeNodeState.pinnedNodeId,
            focusedNodeId: this.activeNodeState.focusedNodeId,
            hoveredNodeId: this.activeNodeState.hoveredNodeId,
            locked: Boolean(options.locked),
            mode: options.mode || 'hover',
        }
    }

    getNodeByKeyword(kw) {
        const q = String(kw || '').trim().toLowerCase()
        if (!q || !this.model?.nodes?.length) return null
        const ns = this.model.nodes
        return ns.find(n => String(n?.id || '').toLowerCase() === q)
            || ns.find(n => String(n?.name || '').toLowerCase() === q)
            || ns.find(n => [n?.id, n?.name, n?.type].some(v => String(v || '').toLowerCase().includes(q)))
            || null
    }

    // ── 清空图 ────────────────────────────────────
    clearGraph() {
        if (!this.networkGroup) return
        while (this.networkGroup.children.length) {
            const c = this.networkGroup.children[this.networkGroup.children.length - 1]
            this.networkGroup.remove(c)
            c.geometry?.dispose()
            disposeMaterial(c.material)
        }
        this.flowParticles = []
        this.linkPulses = []
        this.nodeRecords = []
        this.nodeRecordMap = new Map()
        this.linkRecords = []
        this.adjacencyMap = new Map()
    }

    // ── 重建拓扑图 ────────────────────────────────
    rebuild() {
        if (!this.networkGroup || !this.model) return
        this.clearGraph()

        const { nodes = [], links = [], labelNodeIds = new Set(), stats = {} } = this.model
        const nodeMap = new Map()
        const nodeLinkMap = new Map()
        const weights = links.map(l => Number(l.weight) || 1)
        const minWeight = stats.minWeight ?? (weights.length ? Math.min(...weights) : 0)
        const maxWeight = stats.maxWeight ?? (weights.length ? Math.max(...weights) : 0)

        // ── 节点 ─────────────────────────────────
        for (const node of nodes) {
            const nodeType = String(node?.type || 'tag')
            const style = getNodeStyle(nodeType)
            const nodeId = String(node.id)
            const degree = Number(node.degree ?? 0)
            const riskStyle = node.riskStyle || {}
            const radiusScale = Number(node.radiusScale ?? 1)
            const riskLevel = node.risk_level || 'low'
            const position = ensureVector(node, this.nodeRecords.length, nodes.length)
            const finalRadius = style.radius * radiusScale
            const labelLayer = LABEL_LAYER_ORDER[nodeType] || 0
            const labelDepthLift = nodeType === 'core' ? 2.4 : nodeType === 'db_type' ? 1.7 : 1.1
            const labelSideBias = (this.nodeRecords.length % 3) - 1

            // 主体球
            const geo = this.getSphereGeometry(finalRadius, 20, 20)
            const mat = this.cloneMaterialTemplate(`node:${nodeType}`, () =>
                new THREE.MeshStandardMaterial({
                    color: style.color,
                    transparent: true,
                    roughness: 0.1,          // 极低的粗糙度，产生极其锐利的高光
                    metalness: 0.85,         // 高金属度，增强对场景中点光源的反射率
                    emissive: new THREE.Color(style.color),
                    emissiveIntensity: 0.15,
                    side: THREE.DoubleSide,  // 【关键技巧】开启双面渲染，渲染球体背面会产生类似玻璃厚度和内部折射的视觉错觉
                    depthWrite: false,       // 关闭深度写入，消除多个透明球体叠加时的 Z-fighting 闪烁，增强全息能量感
                })
            )

            const mesh = new THREE.Mesh(geo, mat)
            mesh.position.copy(position)
            mesh.renderOrder = 2
            mesh.userData = { id: nodeId, name: node.name || nodeId, type: nodeType, typeLabel: style.label, value: node.value, degree }

            const coreMat = this.cloneMaterialTemplate(`node-core:${riskLevel}`, () =>
                new THREE.MeshBasicMaterial({
                    color: riskStyle.glowColor ?? style.color,
                    transparent: true,
                    opacity: clamp(0.42 + getRiskPulseBias(riskLevel) * 0.34, 0.38, 0.9),
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                })
            )
            const coreMesh = new THREE.Mesh(this.getSphereGeometry(finalRadius * 0.52, 14, 14), coreMat)
            coreMesh.position.copy(position)
            coreMesh.renderOrder = 3

            // 辉光球
            const glowColor = riskStyle.glowColor ?? style.color
            const glowOpBase = clamp(style.glowOpacity * (riskStyle.glowScale ?? 1.0), 0.04, 0.62)
            const glowGeo = this.getSphereGeometry(finalRadius * 1.9, 12, 12)
            const glowMat = new THREE.MeshBasicMaterial({
                color: glowColor, transparent: true, opacity: glowOpBase,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
            const glowMesh = new THREE.Mesh(glowGeo, glowMat)
            glowMesh.position.copy(position); glowMesh.renderOrder = 1

            // 外环光晕（critical / high）
            let auraRing = null
            if (riskLevel === 'critical' || riskLevel === 'high') {
                const auraColor = riskLevel === 'critical' ? 0xff1a3a : 0xff4400
                const auraMat = new THREE.MeshBasicMaterial({
                    color: auraColor, transparent: true, opacity: 0.07,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                })
                auraRing = new THREE.Mesh(this.getSphereGeometry(finalRadius * 1.9 * 1.45, 10, 10), auraMat)
                auraRing.position.copy(position); auraRing.renderOrder = 0
            }

            // 文字标签
            let labelSprite = null
            if (nodeType === 'core' || nodeType === 'db_type' || labelNodeIds.has(nodeId)) {
                labelSprite = createCanvasTextSprite(node.name || nodeId, style.labelColor, { scale: style.labelScale })
                if (labelSprite) {
                    labelSprite.position.copy(position)
                    labelSprite.position.y += finalRadius + labelDepthLift
                    labelSprite.position.x += labelSideBias * 0.6
                    labelSprite.renderOrder = 3 + labelLayer
                }
            }

            this.networkGroup.add(mesh, glowMesh, coreMesh)
            if (auraRing) this.networkGroup.add(auraRing)
            if (labelSprite) this.networkGroup.add(labelSprite)

            const record = {
                id: nodeId, type: nodeType, typeLabel: style.label,
                name: node.name || nodeId,
                value: node.value, degree,
                riskLevel, riskStyle, radiusScale, finalRadius,
                mesh, glowMesh, coreMesh, auraRing, labelSprite,
                labelLayer,
                labelDepthLift,
                labelSideBias,
                breathPhase: Math.random() * Math.PI * 2,
                style,
                glowOpBase,
                coreOpBase: coreMat.opacity,

                // ── 动画状态机 ──────────────────
                curOpacity: 0.95, tgtOpacity: 0.95,
                curScale: 0.01, tgtScale: 1.0,     // 从 0 动画弹入
                curGlowOp: glowOpBase, tgtGlowOp: glowOpBase,
                curCoreOp: coreMat.opacity, tgtCoreOp: coreMat.opacity,
                curAuraOp: 0.07, tgtAuraOp: 0.07,
                curLabelOp: 0.96, tgtLabelOp: 0.96,
                curLabelScale: style.labelScale || 1,
            }

            this.nodeRecords.push(record)
            this.nodeRecordMap.set(nodeId, record)
            nodeMap.set(nodeId, position)
            nodeLinkMap.set(nodeId, new Set([nodeId]))
        }

        // ── 连线（贝塞尔） ────────────────────────
        for (const link of links) {
            const from = nodeMap.get(String(link.source))
            const to = nodeMap.get(String(link.target))
            if (!from || !to) continue

            const sev = getLinkStyle(link.severity)
            const weight = Number(link.weight) || 1
            const nw = maxWeight <= minWeight ? 1 : clamp((weight - minWeight) / (maxWeight - minWeight), 0, 1)
            const bOp = clamp(sev.baseOpacity * (0.36 + nw * 0.68), 0.14, 0.92)

            const curve = buildBezierCurve(from, to)
            const linePoints = curve.getPoints(BEZIER_SEGMENTS)
            const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints)
            lineGeo.setAttribute('color', new THREE.BufferAttribute(this.makeLineGradientColors(sev.color, 0xb8f2ff, BEZIER_SEGMENTS), 3))
            const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: bOp, vertexColors: true, blending: THREE.AdditiveBlending })
            const line = new THREE.Line(lineGeo, lineMat)
            line.renderOrder = 0
            this.networkGroup.add(line)

            const lineTubeGeo = new THREE.TubeGeometry(curve, 16, 0.055 + nw * 0.035, 3, false)
            const lineTubeMat = new THREE.MeshBasicMaterial({
                color: sev.color,
                transparent: true,
                opacity: bOp * 0.34,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
            const lineTube = new THREE.Mesh(lineTubeGeo, lineTubeMat)
            lineTube.renderOrder = 0
            this.networkGroup.add(lineTube)

            // 中点标记
            const markerR = 0.08 + nw * 0.22
            const markerMat = this.cloneMaterialTemplate(`marker:${sev.label}:${markerR.toFixed(2)}`, () =>
                new THREE.MeshBasicMaterial({
                    color: sev.color, transparent: true, opacity: 0.2 + nw * 0.55,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                })
            )
            const markerMesh = new THREE.Mesh(this.getSphereGeometry(markerR, 8, 8), markerMat)
            markerMesh.position.copy(from.clone().lerp(to, 0.5))
            markerMesh.renderOrder = 1
            this.networkGroup.add(markerMesh)

            const pulseMat = this.cloneMaterialTemplate(`pulse:${sev.label}`, () =>
                new THREE.MeshBasicMaterial({
                    color: sev.color,
                    transparent: true,
                    opacity: 0.6,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                })
            )
            const pulseTailMat = this.cloneMaterialTemplate(`pulse-tail:${sev.label}`, () =>
                new THREE.MeshBasicMaterial({
                    color: sev.color,
                    transparent: true,
                    opacity: 0.28,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                })
            )
            const pulseMesh = new THREE.Mesh(this.getSphereGeometry(0.2 + nw * 0.22, 10, 10), pulseMat)
            const pulseTail = new THREE.Mesh(this.getSphereGeometry(0.16 + nw * 0.2, 8, 8), pulseTailMat)
            pulseMesh.renderOrder = 4
            pulseTail.renderOrder = 3
            this.networkGroup.add(pulseTail, pulseMesh)

            const rec = {
                id: `${link.source}->${link.target}:${this.linkRecords.length}`,
                sourceId: String(link.source), targetId: String(link.target),
                severity: String(link.severity || 'low'),
                weight, normalizedWeight: nw, color: sev.color, baseOpacity: bOp,
                line, lineTube, markerMesh, curve,
                lineColors: lineGeo.attributes.color,
                flowSpeed: 0.007 + nw * 0.018,
                pulseMesh,
                pulseTail,
                pulseT: Math.random(),
                pulseSpeed: 0.17 + nw * 0.28,
                // 动画
                curLineOp: bOp, tgtLineOp: bOp,
                curLineTubeOp: bOp * 0.34, tgtLineTubeOp: bOp * 0.34,
                curMarkerOp: 0.2 + nw * 0.55, tgtMarkerOp: 0.2 + nw * 0.55,
                curPulseStrength: getRiskPulseBias(link.risk_level || link.severity),
                tgtPulseStrength: getRiskPulseBias(link.risk_level || link.severity),
            }
            this.linkRecords.push(rec)

            if (!nodeLinkMap.has(link.source)) nodeLinkMap.set(link.source, new Set([link.source]))
            if (!nodeLinkMap.has(link.target)) nodeLinkMap.set(link.target, new Set([link.target]))
            nodeLinkMap.get(link.source).add(link.target)
            nodeLinkMap.get(link.target).add(link.source)
        }

        this.adjacencyMap = nodeLinkMap

        // ── 流动粒子池 ────────────────────────────
        if (this.linkRecords.length > 0) {
            const pGeo = this.getSphereGeometry(FLOW_PARTICLE_RADIUS, 8, 8)
            for (let i = 0; i < FLOW_PARTICLE_COUNT; i++) {
                const li = i % this.linkRecords.length
                const lr = this.linkRecords[li]
                const pMat = new THREE.MeshBasicMaterial({
                    color: lr.color, transparent: true, opacity: 0.85,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                })
                const pm = new THREE.Mesh(pGeo, pMat)
                pm.renderOrder = 4
                this.networkGroup.add(pm)
                this.flowParticles.push({ mesh: pm, linkIndex: li, t: i / FLOW_PARTICLE_COUNT })
            }
        }

        this.linkPulses = this.linkRecords.map((r, idx) => ({
            linkId: r.id,
            phase: (idx % 9) / 9,
        }))

        this.updateHighlightState()
    }

    // ── 邻接关系 ──────────────────────────────────
    getRelatedNodeIds(id) {
        return this.adjacencyMap.get(String(id || '')) || new Set([String(id || '')])
    }

    // ── 设置高亮目标值（不直接应用，由 lerp 动画完成） ──
    updateHighlightState() {
        if (!this.nodeRecords.length) return

        const activeId = this.getActiveNodeId()
        const hasActive = Boolean(activeId)
        const related = hasActive ? this.getRelatedNodeIds(activeId) : null

        for (const r of this.nodeRecords) {
            // 1. 过滤器检查
            const passFilter = !this.nodeFilter || this.nodeFilter(r)
            if (!passFilter) {
                r.tgtScale = 0
                r.tgtOpacity = 0
                r.tgtGlowOp = 0
                r.tgtCoreOp = 0
                r.tgtAuraOp = 0
                r.tgtLabelOp = 0
                continue
            }

            // 2. 高亮逻辑
            const isActive = r.id === activeId
            const isRelated = related ? related.has(r.id) : true
            const distanceWeight = !hasActive ? 1 : isActive ? 1 : isRelated ? 0.72 : 0.34

            r.tgtScale = !hasActive ? 1 : isActive ? 1.28 : isRelated ? 1.06 : 0.9
            r.tgtOpacity = !hasActive ? 0.92 : isActive ? 0.96 : isRelated ? 0.82 : 0.26

            const gBase = r.glowOpBase
            r.tgtGlowOp = !hasActive ? gBase
                : isActive ? clamp(gBase * 1.55, 0.08, 0.62)
                    : isRelated ? clamp(gBase * 1.08, 0.05, 0.44)
                        : gBase * 0.18

            const cBase = r.coreOpBase
            r.tgtCoreOp = !hasActive ? cBase
                : isActive ? clamp(cBase * 1.35, 0.22, 0.82)
                    : isRelated ? clamp(cBase * 1.06, 0.18, 0.62)
                        : cBase * 0.24

            r.tgtAuraOp = !hasActive ? 0.07 : isActive ? 0.14 : isRelated ? 0.07 : 0.015
            r.tgtLabelOp = !hasActive ? 0.92 : isActive ? 0.98 : isRelated ? 0.82 : 0.1
            r.tgtLabelScale = !hasActive ? 1 : isActive ? 1.04 : isRelated ? 0.98 : 0.86
            r.tgtLabelLift = !hasActive ? r.labelDepthLift : isActive ? r.labelDepthLift + 0.32 : isRelated ? r.labelDepthLift + 0.08 : r.labelDepthLift - 0.18
            r.tgtLabelSide = r.labelSideBias * (isActive ? 0.55 : isRelated ? 0.34 : 0.16)
            r.tgtLabelWeight = distanceWeight
        }

        for (const r of this.linkRecords) {
            const isActive = !hasActive || r.sourceId === activeId || r.targetId === activeId
            r.tgtLineOp = !hasActive ? r.baseOpacity : isActive ? clamp(r.baseOpacity + 0.18, 0.22, 0.92) : 0.05
            r.tgtLineTubeOp = !hasActive ? r.baseOpacity * 0.34 : isActive ? clamp(r.baseOpacity * 0.54, 0.12, 0.5) : 0.03
            r.tgtMarkerOp = !hasActive ? 0.2 + r.normalizedWeight * 0.55
                : isActive ? clamp(0.25 + r.normalizedWeight * 0.62, 0.15, 1) : 0.04
            r.tgtPulseStrength = !hasActive
                ? getRiskPulseBias(r.severity)
                : isActive
                    ? clamp(getRiskPulseBias(r.severity) + 0.32, 0.32, 1)
                    : 0.18
        }

        this.labelLayoutDirty = true
    }

    // ── Lerp 动画：每帧逼近目标值 ─────────────────
    updateAnimations(delta) {
        const lsp = clamp(this.options.lerpSpeed * delta, 0, 1)
        const lspFast = clamp(lsp * 1.4, 0, 1)

        for (const r of this.nodeRecords) {
            r.curScale = lerp(r.curScale, r.tgtScale, lspFast)
            r.curOpacity = lerp(r.curOpacity, r.tgtOpacity, lsp)
            r.curGlowOp = lerp(r.curGlowOp, r.tgtGlowOp, lsp)
            r.curCoreOp = lerp(r.curCoreOp, r.tgtCoreOp, lsp)
            r.curAuraOp = lerp(r.curAuraOp, r.tgtAuraOp, lsp)
            r.curLabelOp = lerp(r.curLabelOp, r.tgtLabelOp, lsp)
            r.curLabelScale = lerp(r.curLabelScale ?? 1, r.tgtLabelScale ?? 1, lspFast)
            r.curLabelLift = lerp(r.curLabelLift ?? r.labelDepthLift, r.tgtLabelLift ?? r.labelDepthLift, lsp)
            r.curLabelSide = lerp(r.curLabelSide ?? r.labelSideBias, r.tgtLabelSide ?? r.labelSideBias, lsp)
            r.curLabelWeight = lerp(r.curLabelWeight ?? 1, r.tgtLabelWeight ?? 1, lsp)

            r.mesh.scale.setScalar(r.curScale)
            r.mesh.material.opacity = clamp(r.curOpacity * (0.55 + r.curLabelWeight * 0.15), 0.12, 0.75)
            r.glowMesh.material.opacity = r.curGlowOp
            r.coreMesh.material.opacity = r.curCoreOp
            r.coreMesh.scale.setScalar(clamp(0.92 + r.curScale * 0.14, 0.76, 1.24))
            if (r.auraRing) r.auraRing.material.opacity = r.curAuraOp
            if (r.labelSprite) {
                r.labelSprite.material.opacity = r.curLabelOp
                r.labelSprite.visible = r.curScale > 0.05 && r.curLabelOp > 0.03
                const labelBase = (r.style.labelScale || 1) * r.curLabelScale
                const aspect = r.labelSprite.userData?.aspect || 1
                r.labelSprite.scale.set(aspect * labelBase, labelBase, 1)
            }
        }

        for (const r of this.linkRecords) {
            r.curLineOp = lerp(r.curLineOp, r.tgtLineOp, lsp)
            r.curLineTubeOp = lerp(r.curLineTubeOp, r.tgtLineTubeOp, lsp)
            r.curMarkerOp = lerp(r.curMarkerOp, r.tgtMarkerOp, lsp)
            r.curPulseStrength = lerp(r.curPulseStrength, r.tgtPulseStrength, lspFast)
            r.line.material.opacity = r.curLineOp
            r.lineTube.material.opacity = r.curLineTubeOp
            r.markerMesh.material.opacity = r.curMarkerOp
        }
    }

    // ── 呼吸辉光（覆盖在 lerp 之上） ─────────────
    updateBreathingGlow(ts) {
        const t = ts * 0.001
        for (const r of this.nodeRecords) {
            if (r.curScale < 0.05) continue
            const breath = Math.sin(t * 1.4 + r.breathPhase)
            const amplitude = r.riskLevel === 'critical' ? 0.38
                : r.riskLevel === 'high' ? 0.26 : 0.1
            const glowFinal = r.curGlowOp * (1 + breath * amplitude)
            r.glowMesh.material.opacity = clamp(glowFinal, 0.02, 0.72)
            r.coreMesh.material.opacity = clamp(r.curCoreOp * (1.05 + breath * (amplitude * 0.66)), 0.06, 1)
            if (typeof r.mesh.material.emissiveIntensity === 'number') {
                r.mesh.material.emissiveIntensity = clamp(0.18 + r.curCoreOp * 0.42 + breath * 0.08, 0.12, 0.95)
            }

            if (r.auraRing) {
                const aura = Math.sin(t * 0.8 + r.breathPhase + Math.PI * 0.5)
                r.auraRing.material.opacity = clamp(r.curAuraOp + aura * 0.05, 0.01, 0.22)
                r.auraRing.scale.setScalar(1 + aura * 0.06)
            }
        }
    }

    updateFocusHalo(ts) {
        if (!this.focusHaloMesh) return
        const activeNodeId = this.getActiveNodeId()
        const activeNode = activeNodeId ? this.getNodeRecord(activeNodeId) : null
        if (!activeNode || activeNode.curScale < 0.05) {
            this.focusHaloMesh.visible = false
            this.focusHaloMesh.material.opacity = 0
            return
        }

        const risk = getRiskPulseBias(activeNode.riskLevel)
        const pulse = 0.5 + Math.sin(ts * 0.004 + this.focusHaloPulse) * 0.5
        const scale = activeNode.finalRadius * (2.4 + risk * 0.72 + pulse * 0.18)
        this.focusHaloMesh.visible = true
        this.focusHaloMesh.position.copy(activeNode.mesh.position)
        this.focusHaloMesh.position.y = activeNode.mesh.position.y - activeNode.finalRadius * 0.62
        this.focusHaloMesh.scale.setScalar(scale)
        this.focusHaloMesh.material.color.setHex(activeNode.riskLevel === 'critical' ? 0xff5a72 : activeNode.riskLevel === 'high' ? 0xff945f : 0x86d8ff)
        this.focusHaloMesh.material.opacity = clamp(0.16 + risk * 0.2 + pulse * 0.11, 0.14, 0.52)
    }

    updateLabelLayout(force = false, now = performance.now()) {
        if (!this.camera || !this.renderer?.domElement || !this.nodeRecords.length) return
        if (!force) {
            const moving = Boolean(this.autoRotate || this.cameraTween || this.isUserInteracting)
            if (!this.labelLayoutDirty && !moving && now - this.labelLayoutLastRun < 80) return
            if (moving && now - this.labelLayoutLastRun < 33) return
            if (!moving && now - this.labelLayoutLastRun < 80) return
        }

        this.labelLayoutLastRun = now
        this.labelLayoutDirty = false

        const candidates = []
        for (const r of this.nodeRecords) {
            if (!r.labelSprite || !r.labelSprite.visible || r.curLabelOp < 0.02) continue
            const baseWorld = new THREE.Vector3(
                r.mesh.position.x + r.curLabelSide * 0.6,
                r.mesh.position.y + r.finalRadius + r.curLabelLift,
                r.mesh.position.z + r.curLabelSide * 0.18,
            )
            const screen = this.worldToScreen(baseWorld)
            if (!screen) continue

            const width = Math.max(96, (r.labelSprite.userData?.pixelWidth || 120) * (r.labelSprite.scale.x / Math.max(r.labelSprite.userData?.aspect || 1, 1)))
            const height = Math.max(24, (r.labelSprite.userData?.pixelHeight || 40) * (r.labelSprite.scale.y / Math.max(r.labelSprite.userData?.baseScale || 1, 1)))
            const priority = (r.labelLayer || 0) * 10 + (r.curLabelWeight || 1) * 6 + (r.curLabelOp || 0) * 3
            candidates.push({ r, baseWorld, screen, width, height, priority })
        }

        candidates.sort((a, b) => b.priority - a.priority || a.screen.y - b.screen.y || a.screen.x - b.screen.x)

        const placed = []
        for (const item of candidates) {
            let offsetX = 0
            let offsetY = 0
            let attempts = 0
            const maxAttempts = 6

            const collision = () => placed.some((other) => {
                const xOverlap = Math.abs((item.screen.x + offsetX) - other.x) < (item.width + other.width) / 2 + LABEL_COLLISION_PADDING
                const yOverlap = Math.abs((item.screen.y + offsetY) - other.y) < (item.height + other.height) / 2 + LABEL_BASE_GAP
                return xOverlap && yOverlap
            })

            while (attempts < maxAttempts && collision()) {
                const direction = (attempts % 2 === 0 ? 1 : -1)
                offsetY += direction * (LABEL_BASE_GAP + attempts * 4)
                offsetX += (item.r.labelSideBias || 0) * (LABEL_BASE_GAP * 0.35 + attempts * 1.6)
                attempts += 1
            }

            const adjusted = this.screenToWorld(item.screen.x + offsetX, item.screen.y + offsetY, item.screen.z)
            if (adjusted) {
                item.r.labelSprite.position.copy(adjusted)
                item.r.labelSprite.position.x += item.r.curLabelSide * 0.08
                item.r.labelSprite.position.y += item.r.curLabelWeight * 0.08
            }

            placed.push({
                x: item.screen.x + offsetX,
                y: item.screen.y + offsetY,
                width: item.width,
                height: item.height,
            })
        }
    }

    updateDepthAtmosphere() {
        const activeNode = this.getActiveNodeRecord()
        const activeWeight = activeNode ? getRiskPulseBias(activeNode.riskLevel) : 0.34
        const nextNear = activeNode ? 46 - activeWeight * 3.6 : 62
        const nextFar = activeNode ? 122 - activeWeight * 10 : 148
        this.depthFocus = lerp(this.depthFocus, activeNode ? 1 : 0, 0.08)
        if (this.scene?.fog) {
            this.scene.fog.near = lerp(this.scene.fog.near, nextNear, 0.08)
            this.scene.fog.far = lerp(this.scene.fog.far, nextFar, 0.08)
        }
        if (this.camera) {
            const targetFov = activeNode ? 50.5 : 52
            this.camera.fov = lerp(this.camera.fov, targetFov, 0.05)
            this.camera.updateProjectionMatrix()
        }
        if (this.starField) {
            this.starField.material.size = lerp(this.starField.material.size, activeNode ? 0.38 : 0.46, 0.08)
        }
        if (this.deepStarField) {
            this.deepStarField.material.size = lerp(this.deepStarField.material.size, activeNode ? 0.24 : 0.28, 0.08)
        }
        this.labelLayoutDirty = true
    }

    updatePointerParallax(delta) {
        if (!this.networkGroup) return
        const ease = clamp(delta * 4.8, 0, 1)
        this.pointerParallax.lerp(this.pointerParallaxTarget, ease)
        const targetX = this.pointerParallax.y * 0.08
        const targetZ = -this.pointerParallax.x * 0.12
        this.networkGroup.rotation.x = lerp(this.networkGroup.rotation.x, targetX, ease)
        this.networkGroup.rotation.z = lerp(this.networkGroup.rotation.z, targetZ, ease)
    }

    // ── 扫描光环动画 ──────────────────────────────
    updateScanRing(delta) {
        if (!this.scanRingMesh) return
        this.scanRingT += delta / (SCAN_RING_INTERVAL / 1000)
        if (this.scanRingT > 1) this.scanRingT = 0

        const t = this.scanRingT
        const alpha = 0.16 + Math.sin(t * Math.PI) * 0.16

        this.scanRingMesh.scale.setScalar(1)
        this.scanRingMesh.material.opacity = alpha
    }

    // ── 流动粒子 ──────────────────────────────────
    updateFlowParticles() {
        if (!this.flowParticles.length || !this.linkRecords.length) return
        for (const p of this.flowParticles) {
            const lr = this.linkRecords[p.linkIndex % this.linkRecords.length]
            if (!lr?.curve) continue
            p.t += lr.flowSpeed
            if (p.t >= 1) {
                p.t = 0
                p.linkIndex = Math.floor(Math.random() * this.linkRecords.length)
                p.mesh.material.color.setHex(this.linkRecords[p.linkIndex].color)
            }
            p.mesh.position.copy(lr.curve.getPoint(p.t))
            p.mesh.material.opacity = clamp(Math.sin(p.t * Math.PI) * 0.9 * (0.35 + lr.curPulseStrength), 0.04, 0.92)
        }
    }

    updateLinkPulses(ts) {
        if (!this.linkRecords.length) return
        const dt = this.lastFrameTime ? clamp((ts - this.lastFrameTime) / 1000, 0, 0.08) : 0.016
        for (const r of this.linkRecords) {
            if (!r.curve || !r.pulseMesh || !r.pulseTail) continue
            r.pulseT += dt * r.pulseSpeed * (0.65 + r.curPulseStrength)
            if (r.pulseT > 1) r.pulseT -= 1

            const head = r.curve.getPoint(r.pulseT)
            const tailT = clamp(r.pulseT - LINK_PULSE_TAIL_OFFSET - (1 - r.curPulseStrength) * 0.03, 0, 1)
            const tail = r.curve.getPoint(tailT)
            const pulseEnvelope = Math.sin(r.pulseT * Math.PI)
            const pulseOp = clamp((0.35 + pulseEnvelope * 0.55) * r.curPulseStrength, 0.06, 0.95)

            r.pulseMesh.position.copy(head)
            r.pulseTail.position.copy(tail)
            r.pulseMesh.material.opacity = pulseOp
            r.pulseTail.material.opacity = pulseOp * 0.42
            r.pulseMesh.scale.setScalar(0.85 + r.normalizedWeight * 1.2 * r.curPulseStrength)
            r.pulseTail.scale.setScalar(0.72 + r.normalizedWeight * 0.8 * r.curPulseStrength)
            r.markerMesh.material.opacity = clamp(r.curMarkerOp + pulseOp * 0.18, 0.02, 1)
        }
    }

    // ── 星尘闪烁 ──────────────────────────────────
    updateStarTwinkle(ts) {
        if (!this.starField) return
        const t = ts * 0.0005
        this.starField.material.opacity = 0.46 + Math.sin(t) * 0.08
        if (this.deepStarField) {
            this.deepStarField.material.opacity = 0.18 + Math.sin(t * 0.6 + 1.2) * 0.06
            this.deepStarField.rotation.y += 0.00008
        }
    }

    // ── 主循环 ────────────────────────────────────
    update(ts = performance.now()) {
        if (!this.scene || !this.camera || !this.renderer) return
        const delta = this.lastFrameTime ? clamp((ts - this.lastFrameTime) / 1000, 0, 0.1) : 0.016

        if (this.networkGroup && this.autoRotate && !this.isUserInteracting) {
            this.networkGroup.rotation.y += this.options.rotationSpeed
        }

        this.updateAnimations(delta)
        this.updatePointerParallax(delta)
        this.updateBreathingGlow(ts)
        this.updateFocusHalo(ts)
        this.updateDepthAtmosphere()
        this.updateLinkPulses(ts)
        this.updateFlowParticles()
        this.updateScanRing(delta)
        this.updateStarTwinkle(ts)
        this.updateLabelLayout(false, ts)

        this.renderer.render(this.scene, this.camera)
    }

    resize() {
        if (!this.container || !this.camera || !this.renderer) return
        const w = this.container.clientWidth
        const h = this.container.clientHeight
        if (!w || !h) return
        this.camera.aspect = w / Math.max(h, 1)
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(w, h)

        // 【新增】动态像素比：大屏/全屏状态下（画布像素 > 约190万）限制像素比为 1.0 保障流畅度
        const isLargeScreen = w * h > 1900000
        const cap = this.options.pixelRatioCap || 1.5
        const targetPixelRatio = isLargeScreen ? 1.0 : Math.min(window.devicePixelRatio || 1, cap)

        this.renderer.setPixelRatio(targetPixelRatio)
    }

    startLoop() {
        if (this.frameId) return
        const tick = (ts) => {
            this.frameId = requestAnimationFrame(tick)
            if (typeof this.onTick === 'function') this.onTick(ts)
            this.update(ts)
            this.lastFrameTime = ts
        }
        this.frameId = requestAnimationFrame(tick)
    }

    stopLoop() {
        if (!this.frameId) return
        cancelAnimationFrame(this.frameId)
        this.frameId = null
    }

    handleUserInteractionStart() { this.isUserInteracting = true }
    handleUserInteractionEnd() { this.isUserInteracting = false }

    dispose() {
        this.stopLoop()
        this.resizeObserver?.disconnect(); this.resizeObserver = null
        this.clearGraph()
        if (this.scene) {
            this.scene.traverse(o => { o.geometry?.dispose(); disposeMaterial(o.material) })
        }
        if (this.renderer) {
            this.renderer.renderLists?.dispose?.()
            this.renderer.dispose()
            this.renderer.forceContextLoss?.()
            const dom = this.renderer.domElement
            dom?.parentNode?.removeChild(dom)
        }
        this.scene = null; this.camera = null; this.renderer = null
        this.networkGroup = null; this.starField = null; this.deepStarField = null; this.scanRingMesh = null
        this.focusHaloMesh = null
        this.nebulaLayers = []
        this.container = null; this.model = null; this.flowParticles = []
        this.linkPulses = []
        this.nodeRecords = []; this.nodeRecordMap = new Map()
        this.linkRecords = []; this.adjacencyMap = new Map()
        this.activeNodeState = { hoveredNodeId: '', focusedNodeId: '', pinnedNodeId: '' }
        this.labelLayoutDirty = true
        for (const g of this.resourceCache.geometries.values()) g.dispose()
        this.resourceCache.geometries.clear()
        for (const m of this.resourceCache.materials.values()) disposeMaterial(m)
        this.resourceCache.materials.clear()
    }
}
