import * as THREE from 'three'
import {
    LINK_SEVERITY_STYLE,
    NODE_TYPE_STYLE,
    getLinkStyle,
    getNodeStyle,
} from './TopologyDataAdapter.js'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3)

const toCssOpacity = (value, fallback = 1) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : fallback
}

const getBackgroundColor = (renderer) => {
    const color = renderer?.getClearColor?.(new THREE.Color())
    return color ? color.getHex() : 0x050814
}

const createCanvasTextSprite = (text, colorHex, options = {}) => {
    const value = String(text || '').trim().slice(0, 28)
    if (!value) return null

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return null

    const fontSize = options.fontSize || 28
    const paddingX = options.paddingX || 22
    const paddingY = options.paddingY || 13
    context.font = `700 ${fontSize}px "Roboto Mono", monospace`
    const metrics = context.measureText(value)
    const width = Math.max(120, Math.ceil(metrics.width) + paddingX * 2)
    const height = fontSize + paddingY * 2

    canvas.width = width
    canvas.height = height

    context.font = `700 ${fontSize}px "Roboto Mono", monospace`
    context.textBaseline = 'middle'
    context.clearRect(0, 0, width, height)
    context.fillStyle = 'rgba(5, 8, 20, 0.72)'
    context.fillRect(0, 0, width, height)
    context.strokeStyle = 'rgba(0, 229, 255, 0.3)'
    context.lineWidth = 2
    context.strokeRect(1, 1, width - 2, height - 2)
    context.fillStyle = colorHex
    context.fillText(value, paddingX, height / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false

    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
    })

    const sprite = new THREE.Sprite(material)
    const heightScale = (options.scale || 1) * 1.5
    const widthScale = (canvas.width / canvas.height) * heightScale
    sprite.scale.set(widthScale, heightScale, 1)
    sprite.renderOrder = 3

    return sprite
}

const disposeMaterial = (material) => {
    if (!material) return

    const disposeSingle = (item) => {
        if (!item) return
        for (const key of ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
            if (item[key] && typeof item[key].dispose === 'function') {
                item[key].dispose()
            }
        }
        if (typeof item.dispose === 'function') {
            item.dispose()
        }
    }

    if (Array.isArray(material)) {
        material.forEach((item) => disposeSingle(item))
        return
    }

    disposeSingle(material)
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

export class TopologyRenderer {
    constructor(options = {}) {
        this.options = {
            backgroundColor: 0x050814,
            fogNear: 55,
            fogFar: 135,
            pixelRatioCap: 1.5,
            rotationSpeed: 0.0028,
            maxRenderNodes: options.maxRenderNodes || 400,
            maxRenderLinks: options.maxRenderLinks || 900,
            topTagLabelCount: options.topTagLabelCount || 14,
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
        this.backgroundGroup = null
        this.starField = null
        this.pulseNode = null
        this.flowIndex = 0
        this.flowT = 0
        this.autoRotate = true
        this.isUserInteracting = false
        this.model = null
        this.nodeRecords = []
        this.nodeRecordMap = new Map()
        this.linkRecords = []
        this.adjacencyMap = new Map()
        this.activeNodeState = {
            hoveredNodeId: '',
            focusedNodeId: '',
            pinnedNodeId: '',
        }
        this.resourceCache = {
            geometries: new Map(),
            materials: new Map(),
        }
        this.defaultCameraPosition = new THREE.Vector3(0, 8, 58)
        this.defaultCameraTarget = new THREE.Vector3(0, 0, 0)
        this.nodePointerPosition = new THREE.Vector2()
        this.onTick = null
    }

    mount(container) {
        if (!container) return

        this.container = container
        this.initScene()
        this.initRenderer()
        this.initEnvironment()
        this.startLoop()

        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => {
                this.resize()
            })
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
        this.renderer.domElement.style.display = 'block'
        this.renderer.domElement.style.width = '100%'
        this.renderer.domElement.style.height = '100%'
        this.renderer.domElement.style.position = 'absolute'
        this.renderer.domElement.style.inset = '0'
        this.container.appendChild(this.renderer.domElement)
    }

    initEnvironment() {
        const ambient = new THREE.AmbientLight(0x5a88ff, 0.55)
        this.scene.add(ambient)

        const keyLight = new THREE.PointLight(0x00e5ff, 1.05, 190)
        keyLight.position.set(20, 18, 24)
        this.scene.add(keyLight)

        const sideLight = new THREE.PointLight(0x7b2cbf, 0.8, 160)
        sideLight.position.set(-24, -8, -18)
        this.scene.add(sideLight)

        const starGeometry = new THREE.BufferGeometry()
        const starCount = 180
        const starPositions = new Float32Array(starCount * 3)
        for (let i = 0; i < starCount; i += 1) {
            starPositions[i * 3 + 0] = (Math.random() - 0.5) * 130
            starPositions[i * 3 + 1] = (Math.random() - 0.5) * 80
            starPositions[i * 3 + 2] = (Math.random() - 0.5) * 130
        }
        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))

        const starMaterial = new THREE.PointsMaterial({
            color: 0x5bcfff,
            size: 0.45,
            transparent: true,
            opacity: 0.55,
        })
        this.starField = new THREE.Points(starGeometry, starMaterial)
        this.scene.add(this.starField)
    }

    setTopologyModel(model) {
        this.model = model || null
        this.rebuild()
        this.updateHighlightState()
    }

    setAutoRotate(enabled) {
        this.autoRotate = Boolean(enabled)
    }

    toggleAutoRotate() {
        this.autoRotate = !this.autoRotate
        return this.autoRotate
    }

    setHoveredNodeId(nodeId) {
        this.activeNodeState.hoveredNodeId = nodeId || ''
        this.updateHighlightState()
    }

    setFocusedNodeId(nodeId) {
        this.activeNodeState.focusedNodeId = nodeId || ''
        this.updateHighlightState()
    }

    setPinnedNodeId(nodeId) {
        this.activeNodeState.pinnedNodeId = nodeId || ''
        if (this.activeNodeState.pinnedNodeId) {
            this.activeNodeState.focusedNodeId = this.activeNodeState.pinnedNodeId
        }
        this.updateHighlightState()
    }

    clearSelection() {
        this.activeNodeState.hoveredNodeId = ''
        this.activeNodeState.focusedNodeId = ''
        this.activeNodeState.pinnedNodeId = ''
        this.updateHighlightState()
    }

    getActiveNodeId() {
        return (
            this.activeNodeState.hoveredNodeId ||
            this.activeNodeState.pinnedNodeId ||
            this.activeNodeState.focusedNodeId ||
            ''
        )
    }

    getActiveNodeRecord() {
        return this.getNodeRecord(this.getActiveNodeId())
    }

    getNodeRecord(nodeId) {
        return this.nodeRecordMap.get(String(nodeId || '')) || null
    }

    getNodeWorldPosition(nodeId) {
        const record = this.getNodeRecord(nodeId)
        if (!record?.mesh) return null

        const worldPosition = new THREE.Vector3()
        record.mesh.updateWorldMatrix(true, false)
        record.mesh.getWorldPosition(worldPosition)
        return worldPosition
    }

    projectNodeToScreen(nodeId) {
        if (!this.container || !this.camera) return null

        const worldPosition = this.getNodeWorldPosition(nodeId)
        if (!worldPosition) return null

        const rect = this.renderer?.domElement?.getBoundingClientRect?.()
        if (!rect) return null

        const projected = worldPosition.clone().project(this.camera)
        return {
            x: ((projected.x + 1) / 2) * rect.width,
            y: ((-projected.y + 1) / 2) * rect.height,
        }
    }

    getSphereGeometry(radius, widthSegments = 18, heightSegments = 18) {
        const numericRadius = Number(radius)
        const key = `${numericRadius.toFixed(2)}:${widthSegments}:${heightSegments}`
        if (!this.resourceCache.geometries.has(key)) {
            this.resourceCache.geometries.set(
                key,
                new THREE.SphereGeometry(numericRadius, widthSegments, heightSegments),
            )
        }
        return this.resourceCache.geometries.get(key)
    }

    getMaterialTemplate(key, factory) {
        if (!this.resourceCache.materials.has(key)) {
            this.resourceCache.materials.set(key, factory())
        }
        return this.resourceCache.materials.get(key)
    }

    cloneMaterialTemplate(key, factory) {
        return this.getMaterialTemplate(key, factory).clone()
    }

    getNodeTooltipPayload(nodeId, options = {}) {
        const record = this.getNodeRecord(nodeId)
        if (!record) return null

        const position = options.position || this.projectNodeToScreen(nodeId)
        return {
            show: true,
            x: Math.round(position?.x ?? 0),
            y: Math.round(position?.y ?? 0),
            title: record.name || record.id,
            type: record.typeLabel || record.type || '',
            valueText: String(record.value ?? 0),
            degreeText: String(record.degree ?? 0),
            nodeId: record.id,
            pinnedNodeId: this.activeNodeState.pinnedNodeId,
            focusedNodeId: this.activeNodeState.focusedNodeId,
            hoveredNodeId: this.activeNodeState.hoveredNodeId,
            locked: Boolean(options.locked),
            mode: options.mode || 'hover',
        }
    }

    getNodeByKeyword(keyword) {
        const query = String(keyword || '').trim().toLowerCase()
        if (!query || !this.model?.nodes?.length) return null

        const nodes = this.model.nodes
        const exactId = nodes.find((node) => String(node?.id || '').toLowerCase() === query)
        if (exactId) return exactId

        const exactName = nodes.find((node) => String(node?.name || '').toLowerCase() === query)
        if (exactName) return exactName

        return (
            nodes.find((node) => {
                const id = String(node?.id || '').toLowerCase()
                const name = String(node?.name || '').toLowerCase()
                const type = String(node?.type || '').toLowerCase()
                return id.includes(query) || name.includes(query) || type.includes(query)
            }) || null
        )
    }

    clearGraph() {
        if (!this.networkGroup) return

        while (this.networkGroup.children.length) {
            const child = this.networkGroup.children[this.networkGroup.children.length - 1]
            this.networkGroup.remove(child)
            if (child.geometry) child.geometry.dispose()
            disposeMaterial(child.material)
        }

        this.pulseNode = null
        this.flowIndex = 0
        this.flowT = 0
        this.nodeRecords = []
        this.nodeRecordMap = new Map()
        this.linkRecords = []
        this.adjacencyMap = new Map()
    }

    rebuild() {
        if (!this.networkGroup || !this.model) return

        this.clearGraph()

        const { nodes = [], links = [], labelNodeIds = new Set(), stats = {} } = this.model
        const nodeMap = new Map()
        const nodeLinkMap = new Map()
        const weights = links.map((link) => Number(link.weight) || 1)
        const minWeight = stats.minWeight ?? (weights.length ? Math.min(...weights) : 0)
        const maxWeight = stats.maxWeight ?? (weights.length ? Math.max(...weights) : 0)

        for (const node of nodes) {
            const nodeType = String(node?.type || 'tag')
            const style = getNodeStyle(nodeType)
            const nodeId = String(node.id)
            const degree = Number(node.degree ?? 0)

            const position = ensureVector(node, this.nodeRecords.length, nodes.length)
            const geometry = this.getSphereGeometry(style.radius, 18, 18)
            const material = this.cloneMaterialTemplate(`node:${nodeType}`, () => new THREE.MeshBasicMaterial({
                color: style.color,
                transparent: true,
                opacity: 0.95,
            }))

            const mesh = new THREE.Mesh(geometry, material)
            mesh.position.copy(position)
            mesh.renderOrder = 2
            mesh.userData = {
                id: nodeId,
                name: node.name || nodeId,
                type: nodeType,
                typeLabel: style.label,
                value: node.value,
                degree,
            }

            const glowGeometry = this.getSphereGeometry(style.radius * 1.78, 12, 12)
            const glowMaterial = this.cloneMaterialTemplate(`glow:${nodeType}`, () => new THREE.MeshBasicMaterial({
                color: style.color,
                transparent: true,
                opacity: style.glowOpacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }))
            const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial)
            glowMesh.position.copy(position)
            glowMesh.renderOrder = 1

            let labelSprite = null
            if (nodeType === 'core' || nodeType === 'db_type' || labelNodeIds.has(nodeId)) {
                labelSprite = createCanvasTextSprite(node.name || nodeId, style.labelColor, {
                    scale: style.labelScale,
                })
                if (labelSprite) {
                    labelSprite.position.copy(position)
                    labelSprite.position.y += style.radius + 0.95
                }
            }

            this.networkGroup.add(mesh)
            this.networkGroup.add(glowMesh)
            if (labelSprite) this.networkGroup.add(labelSprite)

            const record = {
                id: nodeId,
                type: nodeType,
                typeLabel: style.label,
                name: node.name || nodeId,
                value: node.value,
                degree,
                mesh,
                glowMesh,
                labelSprite,
                baseOpacity: 0.95,
                baseScale: 1,
                style,
            }

            this.nodeRecords.push(record)
            this.nodeRecordMap.set(nodeId, record)
            nodeMap.set(nodeId, position)
            nodeLinkMap.set(nodeId, new Set([nodeId]))
        }

        for (const link of links) {
            const from = nodeMap.get(String(link.source))
            const to = nodeMap.get(String(link.target))
            if (!from || !to) continue

            const severityStyle = getLinkStyle(link.severity)
            const weight = Number(link.weight) || 1
            const normalizedWeight = maxWeight <= minWeight ? 1 : clamp((weight - minWeight) / (maxWeight - minWeight), 0, 1)
            const baseOpacity = clamp(severityStyle.baseOpacity * (0.42 + normalizedWeight * 0.72), 0.18, 0.98)

            const geometry = new THREE.BufferGeometry().setFromPoints([from, to])
            const material = new THREE.LineBasicMaterial({
                color: severityStyle.color,
                transparent: true,
                opacity: baseOpacity,
            })

            const line = new THREE.Line(geometry, material)
            line.renderOrder = 0
            this.networkGroup.add(line)

            const midpoint = from.clone().lerp(to, 0.5)
            const markerRadius = 0.07 + normalizedWeight * 0.2
            const markerGeometry = this.getSphereGeometry(markerRadius, 8, 8)
            const markerMaterial = this.cloneMaterialTemplate(`marker:${severityStyle.label}:${markerRadius.toFixed(2)}`, () => new THREE.MeshBasicMaterial({
                color: severityStyle.color,
                transparent: true,
                opacity: 0.2 + normalizedWeight * 0.52,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }))
            const markerMesh = new THREE.Mesh(markerGeometry, markerMaterial)
            markerMesh.position.copy(midpoint)
            markerMesh.renderOrder = 1
            this.networkGroup.add(markerMesh)

            const linkRecord = {
                id: `${link.source}->${link.target}:${this.linkRecords.length}`,
                sourceId: String(link.source),
                targetId: String(link.target),
                severity: String(link.severity || 'low'),
                weight,
                normalizedWeight,
                color: severityStyle.color,
                baseOpacity,
                line,
                markerMesh,
                flowSpeed: 0.009 + normalizedWeight * 0.022,
                pulseScale: 0.55 + normalizedWeight * 0.52,
            }
            this.linkRecords.push(linkRecord)

            if (!nodeLinkMap.has(linkRecord.sourceId)) {
                nodeLinkMap.set(linkRecord.sourceId, new Set([linkRecord.sourceId]))
            }
            if (!nodeLinkMap.has(linkRecord.targetId)) {
                nodeLinkMap.set(linkRecord.targetId, new Set([linkRecord.targetId]))
            }
            nodeLinkMap.get(linkRecord.sourceId).add(linkRecord.targetId)
            nodeLinkMap.get(linkRecord.targetId).add(linkRecord.sourceId)
        }

        this.adjacencyMap = nodeLinkMap

        if (!this.pulseNode) {
            const pulseGeometry = this.getSphereGeometry(0.28, 12, 12)
            const pulseMaterial = this.cloneMaterialTemplate('pulse', () => new THREE.MeshBasicMaterial({
                color: 0x00e5ff,
                transparent: true,
                opacity: 1,
            }))
            this.pulseNode = new THREE.Mesh(pulseGeometry, pulseMaterial)
            this.pulseNode.renderOrder = 4
            this.networkGroup.add(this.pulseNode)
        } else {
            this.networkGroup.add(this.pulseNode)
        }

        this.updateHighlightState()
    }

    getRelatedNodeIds(nodeId) {
        return this.adjacencyMap.get(String(nodeId || '')) || new Set([String(nodeId || '')])
    }

    updateHighlightState() {
        if (!this.nodeRecords.length) return

        const activeNodeId = this.getActiveNodeId()
        const hasActiveNode = Boolean(activeNodeId)
        const relatedNodeIds = hasActiveNode ? this.getRelatedNodeIds(activeNodeId) : null

        for (const record of this.nodeRecords) {
            const isActive = record.id === activeNodeId
            const isRelated = relatedNodeIds ? relatedNodeIds.has(record.id) : true
            const targetScale = !hasActiveNode ? 1 : isActive ? 1.46 : isRelated ? 1.14 : 0.86
            const targetOpacity = !hasActiveNode ? record.baseOpacity : isActive ? 1 : isRelated ? 0.9 : 0.28

            record.mesh.scale.setScalar(targetScale)
            record.mesh.material.opacity = targetOpacity
            record.glowMesh.material.opacity = !hasActiveNode
                ? record.style.glowOpacity
                : isActive
                    ? record.style.glowOpacity * 1.8
                    : isRelated
                        ? record.style.glowOpacity * 1.15
                        : record.style.glowOpacity * 0.35

            if (record.labelSprite) {
                record.labelSprite.visible = !hasActiveNode || isActive || isRelated
                record.labelSprite.material.opacity = !hasActiveNode ? 0.96 : isActive || isRelated ? 1 : 0.2
            }
        }

        for (const record of this.linkRecords) {
            const isActiveLink = !hasActiveNode || record.sourceId === activeNodeId || record.targetId === activeNodeId
            record.line.material.opacity = !hasActiveNode
                ? record.baseOpacity
                : isActiveLink
                    ? clamp(record.baseOpacity + 0.22, 0.2, 1)
                    : 0.06
            record.markerMesh.material.opacity = !hasActiveNode
                ? 0.2 + record.normalizedWeight * 0.52
                : isActiveLink
                    ? clamp(0.2 + record.normalizedWeight * 0.52, 0.15, 1)
                    : 0.04
        }
    }

    updatePulse(timestamp) {
        if (!this.pulseNode || !this.linkRecords.length) return

        const activeLink = this.linkRecords[this.flowIndex % this.linkRecords.length]
        this.pulseNode.material.color.setHex(activeLink.color)

        this.flowT += activeLink.flowSpeed
        if (this.flowT >= 1) {
            this.flowT = 0
            this.flowIndex += 1
        }

        const fromRecord = this.nodeRecordMap.get(activeLink.sourceId)
        const toRecord = this.nodeRecordMap.get(activeLink.targetId)
        if (!fromRecord?.mesh || !toRecord?.mesh) return

        const from = new THREE.Vector3()
        const to = new THREE.Vector3()
        fromRecord.mesh.getWorldPosition(from)
        toRecord.mesh.getWorldPosition(to)

        this.pulseNode.position.lerpVectors(from, to, this.flowT)
        this.pulseNode.material.opacity = clamp(0.45 + activeLink.normalizedWeight * 0.5, 0.35, 1)
        const oscillation = 0.1 + activeLink.normalizedWeight * 0.15
        const pulse = activeLink.pulseScale + Math.sin((timestamp || performance.now()) * 0.012) * oscillation
        this.pulseNode.scale.setScalar(pulse)
    }

    update(timestamp = performance.now()) {
        if (!this.scene || !this.camera || !this.renderer) return

        if (this.networkGroup && this.autoRotate && !this.isUserInteracting) {
            this.networkGroup.rotation.y += this.options.rotationSpeed
        }

        this.updatePulse(timestamp)
        this.renderer.render(this.scene, this.camera)
    }

    resize() {
        if (!this.container || !this.camera || !this.renderer) return

        const width = this.container.clientWidth
        const height = this.container.clientHeight
        if (!width || !height) return

        this.camera.aspect = width / Math.max(height, 1)
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(width, height)
    }

    startLoop() {
        if (this.frameId) return

        const tick = (timestamp) => {
            this.frameId = requestAnimationFrame(tick)
            if (typeof this.onTick === 'function') {
                this.onTick(timestamp)
            }
            this.update(timestamp)
            this.lastFrameTime = timestamp
        }

        this.frameId = requestAnimationFrame(tick)
    }

    stopLoop() {
        if (!this.frameId) return
        cancelAnimationFrame(this.frameId)
        this.frameId = null
    }

    syncCameraToDefault(immediate = true) {
        if (!this.camera) return
        this.camera.position.copy(this.defaultCameraPosition)
        this.camera.lookAt(this.defaultCameraTarget)
        if (immediate) {
            this.resize()
        }
    }

    handleUserInteractionStart() {
        this.isUserInteracting = true
    }

    handleUserInteractionEnd() {
        this.isUserInteracting = false
    }

    dispose() {
        this.stopLoop()

        if (this.resizeObserver) {
            this.resizeObserver.disconnect()
            this.resizeObserver = null
        }

        this.clearGraph()

        if (this.scene) {
            this.scene.traverse((object) => {
                if (object.geometry) object.geometry.dispose()
                disposeMaterial(object.material)
            })
        }

        if (this.renderer) {
            if (this.renderer.renderLists && typeof this.renderer.renderLists.dispose === 'function') {
                this.renderer.renderLists.dispose()
            }
            this.renderer.dispose()
            if (typeof this.renderer.forceContextLoss === 'function') {
                this.renderer.forceContextLoss()
            }
            const domElement = this.renderer.domElement
            if (domElement && domElement.parentNode) {
                domElement.parentNode.removeChild(domElement)
            }
        }

        this.scene = null
        this.camera = null
        this.renderer = null
        this.networkGroup = null
        this.starField = null
        this.container = null
        this.pulseNode = null
        this.model = null
        this.nodeRecords = []
        this.nodeRecordMap = new Map()
        this.linkRecords = []
        this.adjacencyMap = new Map()
        this.activeNodeState = {
            hoveredNodeId: '',
            focusedNodeId: '',
            pinnedNodeId: '',
        }

        for (const geometry of this.resourceCache.geometries.values()) {
            geometry.dispose()
        }
        this.resourceCache.geometries.clear()

        for (const material of this.resourceCache.materials.values()) {
            disposeMaterial(material)
        }
        this.resourceCache.materials.clear()
    }
}
