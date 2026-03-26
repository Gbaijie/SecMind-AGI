const MAX_RENDER_NODES = 400
const MAX_RENDER_LINKS = 900
const TOP_TAG_LABEL_COUNT = 14

const toCssHex = (hexColor) => `#${Math.round(hexColor).toString(16).padStart(6, '0')}`

const createNodeStyle = (color, radius, glowOpacity, labelScale, labelColor, label, focusDistance) => ({
    color,
    cssColor: toCssHex(color),
    radius,
    glowOpacity,
    labelScale,
    labelColor,
    label,
    focusDistance,
})

const createLinkStyle = (color, baseOpacity, label) => ({
    color,
    cssColor: toCssHex(color),
    baseOpacity,
    label,
})

export const NODE_TYPE_STYLE = {
    core: createNodeStyle(0x00ff9d, 0.9, 0.2, 1.04, '#ccffe9', 'CORE', 34),
    db_type: createNodeStyle(0x00b8ff, 0.66, 0.16, 0.92, '#d7f2ff', 'DB TYPE', 26),
    tag: createNodeStyle(0xff8a2a, 0.44, 0.1, 0.8, '#ffe5cc', 'TAG', 20),
}

export const LINK_SEVERITY_STYLE = {
    high: createLinkStyle(0xff0055, 0.92, 'HIGH'),
    medium: createLinkStyle(0xff6a00, 0.72, 'MEDIUM'),
    low: createLinkStyle(0x00e5ff, 0.55, 'LOW'),
}

export const NODE_LEGEND_ITEMS = [
    {
        key: 'core',
        label: 'CORE',
        note: 'Always labeled',
        color: NODE_TYPE_STYLE.core.cssColor,
    },
    {
        key: 'db_type',
        label: 'DB TYPE',
        note: 'Always labeled',
        color: NODE_TYPE_STYLE.db_type.cssColor,
    },
    {
        key: 'tag',
        label: 'TAG',
        note: 'Top-value labels',
        color: NODE_TYPE_STYLE.tag.cssColor,
    },
]

export const LINK_LEGEND_ITEMS = [
    {
        key: 'high',
        label: LINK_SEVERITY_STYLE.high.label,
        color: LINK_SEVERITY_STYLE.high.cssColor,
        opacity: LINK_SEVERITY_STYLE.high.baseOpacity,
    },
    {
        key: 'medium',
        label: LINK_SEVERITY_STYLE.medium.label,
        color: LINK_SEVERITY_STYLE.medium.cssColor,
        opacity: LINK_SEVERITY_STYLE.medium.baseOpacity,
    },
    {
        key: 'low',
        label: LINK_SEVERITY_STYLE.low.label,
        color: LINK_SEVERITY_STYLE.low.cssColor,
        opacity: LINK_SEVERITY_STYLE.low.baseOpacity,
    },
]

export const createFallbackRawTopology = () => ({
    nodes: [
        { id: 'core', name: 'DeepSOC Core', type: 'core', x: 0, y: 0, z: 0, value: 1 },
        { id: 'db_type:ioc', name: 'IOC', type: 'db_type', x: -20, y: 4, z: 14, value: 42 },
        { id: 'db_type:cve', name: 'CVE', type: 'db_type', x: 22, y: -4, z: 10, value: 36 },
        { id: 'tag:scanner', name: 'scanner', type: 'tag', x: -28, y: 2, z: 18, value: 16 },
        { id: 'tag:rce', name: 'rce', type: 'tag', x: 30, y: -1, z: 6, value: 11 },
        { id: 'tag:botnet', name: 'botnet', type: 'tag', x: 17, y: 7, z: -22, value: 9 },
    ],
    links: [
        { source: 'core', target: 'db_type:ioc', severity: 'medium', weight: 42 },
        { source: 'core', target: 'db_type:cve', severity: 'high', weight: 36 },
        { source: 'db_type:ioc', target: 'tag:scanner', severity: 'medium', weight: 16 },
        { source: 'db_type:cve', target: 'tag:rce', severity: 'high', weight: 11 },
        { source: 'db_type:ioc', target: 'tag:botnet', severity: 'low', weight: 9 },
    ],
})

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const toFiniteNumber = (value, fallback = 0) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

export const normalizeNodeType = (rawType) => {
    const value = String(rawType || '').trim().toLowerCase()
    if (value === 'core' || value === 'db_type' || value === 'tag') return value
    if (value === 'category') return 'db_type'
    if (value === 'source') return 'tag'
    return 'tag'
}

export const normalizeSeverity = (rawSeverity) => {
    const value = String(rawSeverity || '').trim().toLowerCase()
    return LINK_SEVERITY_STYLE[value] ? value : 'low'
}

export const getNodeStyle = (rawType) => NODE_TYPE_STYLE[normalizeNodeType(rawType)] || NODE_TYPE_STYLE.tag

export const getLinkStyle = (rawSeverity) => LINK_SEVERITY_STYLE[normalizeSeverity(rawSeverity)] || LINK_SEVERITY_STYLE.low

export const getLinkWeight = (link) => Math.max(1, toFiniteNumber(link?.weight, 1))

const normalizeWeight = (weight, minWeight, maxWeight) => {
    if (maxWeight <= minWeight) return 1
    return clamp((weight - minWeight) / (maxWeight - minWeight), 0, 1)
}

const scoreNode = (node, degreeMap) => {
    const typeBonus = node.type === 'core' ? 2_000_000 : node.type === 'db_type' ? 800_000 : 0
    const valueScore = node.value * 15
    const degreeScore = (degreeMap.get(node.id) || 0) * 110
    return typeBonus + valueScore + degreeScore
}

const selectLabelNodeIds = (nodes, degreeMap) => {
    const rankedTags = (nodes || [])
        .filter((node) => node.type === 'tag')
        .sort((a, b) => {
            const scoreA = a.value * 2 + (degreeMap.get(a.id) || 0) * 12
            const scoreB = b.value * 2 + (degreeMap.get(b.id) || 0) * 12
            return scoreB - scoreA
        })

    return new Set(rankedTags.slice(0, TOP_TAG_LABEL_COUNT).map((node) => node.id))
}

const createStats = ({ sourceNodeCount, sourceLinkCount, nodes, links, weights }) => {
    const minWeight = weights.length ? Math.min(...weights) : 0
    const maxWeight = weights.length ? Math.max(...weights) : 0

    return {
        minWeight: Math.round(minWeight * 10) / 10,
        maxWeight: Math.round(maxWeight * 10) / 10,
        totalNodes: sourceNodeCount,
        renderedNodes: nodes.length,
        totalLinks: sourceLinkCount,
        renderedLinks: links.length,
    }
}

const prioritizeTopology = (rawNodes, rawLinks) => {
    const normalizedNodes = []
    const nodeMap = new Map()

    for (const sourceNode of rawNodes || []) {
        const nodeId = sourceNode?.id == null ? '' : String(sourceNode.id)
        if (!nodeId || nodeMap.has(nodeId)) continue

        const normalizedNode = {
            ...sourceNode,
            id: nodeId,
            type: normalizeNodeType(sourceNode.type),
            value: Math.max(0, toFiniteNumber(sourceNode.value, 0)),
        }

        normalizedNodes.push(normalizedNode)
        nodeMap.set(nodeId, normalizedNode)
    }

    const normalizedLinks = []
    const degreeMap = new Map()

    for (const sourceLink of rawLinks || []) {
        const sourceId = sourceLink?.source == null ? '' : String(sourceLink.source)
        const targetId = sourceLink?.target == null ? '' : String(sourceLink.target)
        if (!sourceId || !targetId) continue
        if (!nodeMap.has(sourceId) || !nodeMap.has(targetId)) continue

        const normalizedLink = {
            ...sourceLink,
            source: sourceId,
            target: targetId,
            weight: getLinkWeight(sourceLink),
            severity: normalizeSeverity(sourceLink?.severity),
        }

        normalizedLinks.push(normalizedLink)
        degreeMap.set(sourceId, (degreeMap.get(sourceId) || 0) + 1)
        degreeMap.set(targetId, (degreeMap.get(targetId) || 0) + 1)
    }

    if (normalizedNodes.length <= MAX_RENDER_NODES && normalizedLinks.length <= MAX_RENDER_LINKS) {
        return { nodes: normalizedNodes, links: normalizedLinks, degreeMap }
    }

    const selectedNodes = new Map()
    normalizedNodes
        .filter((node) => node.type === 'core')
        .forEach((node) => selectedNodes.set(node.id, node))

    const rankedLinks = [...normalizedLinks].sort((a, b) => b.weight - a.weight)
    for (const link of rankedLinks) {
        if (selectedNodes.size >= MAX_RENDER_NODES) break
        if (selectedNodes.has(link.source) && !selectedNodes.has(link.target)) {
            selectedNodes.set(link.target, nodeMap.get(link.target))
        } else if (selectedNodes.has(link.target) && !selectedNodes.has(link.source)) {
            selectedNodes.set(link.source, nodeMap.get(link.source))
        }
    }

    const rankedNodes = [...normalizedNodes].sort((a, b) => scoreNode(b, degreeMap) - scoreNode(a, degreeMap))
    for (const node of rankedNodes) {
        if (selectedNodes.size >= MAX_RENDER_NODES) break
        if (!selectedNodes.has(node.id)) {
            selectedNodes.set(node.id, node)
        }
    }

    const selectedNodeIds = new Set(selectedNodes.keys())
    const reducedLinks = rankedLinks
        .filter((link) => selectedNodeIds.has(link.source) && selectedNodeIds.has(link.target))
        .slice(0, MAX_RENDER_LINKS)

    const reducedDegreeMap = new Map()
    for (const node of selectedNodes.values()) {
        reducedDegreeMap.set(node.id, 0)
    }
    for (const link of reducedLinks) {
        reducedDegreeMap.set(link.source, (reducedDegreeMap.get(link.source) || 0) + 1)
        reducedDegreeMap.set(link.target, (reducedDegreeMap.get(link.target) || 0) + 1)
    }

    return {
        nodes: [...selectedNodes.values()],
        links: reducedLinks,
        degreeMap: reducedDegreeMap,
    }
}

export const buildTopologyModel = (topology = {}, options = {}) => {
    const fallbackTopology = createFallbackRawTopology()
    const sourceTopology = {
        nodes: Array.isArray(topology?.nodes) && topology.nodes.length ? topology.nodes : fallbackTopology.nodes,
        links: Array.isArray(topology?.links) && topology.links.length ? topology.links : fallbackTopology.links,
    }

    const normalized = prioritizeTopology(sourceTopology.nodes, sourceTopology.links)
    const labelNodeIds = selectLabelNodeIds(normalized.nodes, normalized.degreeMap)
    const nodesWithDegree = normalized.nodes.map((node) => ({
        ...node,
        degree: normalized.degreeMap.get(node.id) || 0,
    }))
    const weights = normalized.links.map((link) => getLinkWeight(link))
    const stats = createStats({
        sourceNodeCount: sourceTopology.nodes.length,
        sourceLinkCount: sourceTopology.links.length,
        nodes: nodesWithDegree,
        links: normalized.links,
        weights,
    })

    return {
        nodes: nodesWithDegree,
        links: normalized.links,
        degreeMap: normalized.degreeMap,
        labelNodeIds,
        stats,
        options: {
            maxRenderNodes: options.maxRenderNodes || MAX_RENDER_NODES,
            maxRenderLinks: options.maxRenderLinks || MAX_RENDER_LINKS,
            topTagLabelCount: options.topTagLabelCount || TOP_TAG_LABEL_COUNT,
        },
    }
}

export const findNodeByKeyword = (nodes, keyword) => {
    const query = String(keyword || '').trim().toLowerCase()
    if (!query) return null

    const normalizedNodes = Array.isArray(nodes) ? nodes : []
    const exactId = normalizedNodes.find((node) => String(node?.id || '').toLowerCase() === query)
    if (exactId) return exactId

    const exactName = normalizedNodes.find((node) => String(node?.name || '').toLowerCase() === query)
    if (exactName) return exactName

    return (
        normalizedNodes.find((node) => {
            const id = String(node?.id || '').toLowerCase()
            const name = String(node?.name || '').toLowerCase()
            const type = String(node?.type || '').toLowerCase()
            return id.includes(query) || name.includes(query) || type.includes(query)
        }) || null
    )
}

export const getTopologySummaryText = (model) => {
    const stats = model?.stats || {}
    return `Nodes ${stats.renderedNodes || 0}/${stats.totalNodes || 0} · Links ${stats.renderedLinks || 0}/${stats.totalLinks || 0}`
}
