import * as canvasDisplay from './canvas.js'
import * as backgroundsDisplay from './renderBackground.js'
import * as collidersDisplay from './renderColliders.js'
import * as circularDisplay from './renderCircularColliders.js'
import * as markersDisplay from './renderMarkers.js'
import * as specMarkerDisplay from './renderSpecialMarker.js'
import * as sideMenu from './sideMenu'

// rollup doesn't duplicate modules, so this imports everything...
// import { xpForCrystalSize } from '$/meta.json'
const xpForCrystalSize = [5, 10, 20, 50]
if(import.meta.env.DEV) {
    const { xpForCrystalSize: expected } = await import('$/meta.json')
    let match = false
    if(xpForCrystalSize.length === expected.length) {
        let i = 0;
        for(; i < expected.length; i++) {
            if(xpForCrystalSize[i] !== expected[i]) break;
        }
        match = i === expected.length
    }
    if(!match) {
        throw new Error("xpForCrystalSize doesn't match")
    }
}

function resolvablePromise() {
    var resolve
    const promise = new Promise((s, j) => {
        resolve = s
    })
    return { resolve, promise }
}

const collidersP2 = resolvablePromise()
const markersP2 = resolvablePromise()
const markersSpecialP2 = resolvablePromise()

var worker
if(__worker) {
    worker = window.worker
    worker.onmessage = (e) => {
        const d = e.data
        console.log('received from worker', d.type)

        if(d.type === 'click') {
            const obj = {
                first: d.first,
                nearby: d.nearby,
                nearbyReferenceInfos: d.nearbyReferenceInfos,
            }
            sideMenu.setCurrentObject(obj)
            context.currentObject = obj
            context.requestRender(1)
            updUrl(d.first)
        }
        else if(d.type === 'getInfo') {
            const obj = { first: d.object }
            sideMenu.setCurrentObject(obj)
            context.currentObject = obj
            context.requestRender(1)
            updUrl(d.object)
        }
        else if(d.type === 'getSceneInfo') {
            const obj = { scene: d.scene }
            sideMenu.setCurrentObject(obj)
            context.currentObject = obj
            context.requestRender(1)
            updUrlScene(d.scene)
        }
        else if(d.type === 'colliders-done') {
            const it = {
                verts: d.verts,
                indices: d.indices,
                polyDrawData: d.polyDrawData,
                circularData: d.circularData,
                circularDrawData: d.circularDrawData,
            }
            collidersP2.resolve(it)
        }
        else if(d.type == 'markers-done') {
            markersP2.resolve({
                markersData: d.markersData,
                markers: d.markers,
            })
        }
        else if(d.type == 'markers-special-done') {
            markersSpecialP2.resolve({
                regularCount: d.regularCount,
                specialMarkers: d.specialMarkers,
                restMarkers: d.restMarkers,
            })
        }
        else if(d.type == 'marker-filters') {
            const it = { markersIndices: d.markersIndices }
            markersDisplay.setFiltered(context, it)
            specMarkerDisplay.setFiltered(context, it)
        }
    }
    worker.postMessage({ type: 'ready' })
}

const canvas = document.getElementById('glCanvas')
// extensions can remove canvas from DOM after requesting webgl2
const canvasParent = canvas.parentNode
const gl = canvas.getContext('webgl2', { alpha: false })

if (!gl) {
    try { canvasParent.removeChild(canvas) }
    catch(err) { console.error(err) }
    canvasParent.append(document.createTextNode(
        "Sorry, your device doesn't support WebGL2"
    ))
    throw new Error('WebGL 2 is not supported.')
}

// Note: this is not correct alpha blending, works only if background is already fully transparent!
// 1. Source alpha is multiplied by itself so overall transparency decreases when drawing transparent things
// 2. Disregards destination alpha (dst color should be multiplied by it).
// This all doesn't matter when background starts as fully opaque and alpha is disregarded at the end.
gl.enable(gl.BLEND)
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

function render(context) {
    if(window.__stop) return

    if(!canvasDisplay.resize(context)) return

    const b = context.cameraBuf
    const aspect = context.canvasSize[1] / context.canvasSize[0]
    const scale = 1 / context.camera.scale
    b[0] = -context.camera.posX * (scale * aspect)
    b[1] = -context.camera.posY * scale
    b[2] = scale * aspect
    b[3] = scale

    let count = 0
    count += specMarkerDisplay.getMarkerCount(context)
    count += markersDisplay.getMarkerCount(context)

    const minC = 10, maxC = 300
    const countFac = Math.min(Math.max(minC, count), maxC) / (maxC - minC)
    const from = 5, to = 1
    let sizeFac = from + (countFac * countFac) * (to - from)
    if(!(isFinite(sizeFac) && sizeFac >= 1)) sizeFac = 1

    // 0.5 rem at scale 1 (because space is -1 to 1 and not 0 to 1)
    const rem05 = context.sizes.fontSize / context.sizes.heightCssPx
    // radius
    b[4] = Math.min(context.camera.scale, 200 * sizeFac) * rem05 * 1.3

    gl.bindBuffer(gl.UNIFORM_BUFFER, context.cameraUbo)
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, b)

    backgroundsDisplay.render(context)
    if(__render_colliders) collidersDisplay.render(context)
    if(__render_circular) circularDisplay.render(context)
    specMarkerDisplay.renderRest(context)
    specMarkerDisplay.renderVisible(context)
    markersDisplay.render(context)
    specMarkerDisplay.renderSelected(context)
}

function requestRender(priority/* 0 - immediate, 1 - animation, 2 - idle */, opts) {
    const rr = this.renderRequest
    if(rr != null) {
        if(rr.priority <= priority) return
        rr.cancel()
    }

    if(priority == 0) {
        this.renderRequest = null
        render(this)
    }
    else if(priority == 1) {
        this.renderRequest = {
            priority: 1,
            cancel() { cancelAnimationFrame(this.id) },
            id: requestAnimationFrame(() => {
                this.renderRequest = null
                render(this)
            })
        }
    }
    else {
        try {
            this.renderRequest = {
                priority: 2,
                cancel() { cancelIdleCallback(this.id) },
                id: requestIdleCallback(() => {
                    this.renderRequest = null
                    render(this)
                }, opts)
            }
        }
        catch(err) {
            // probably Safari. It doesn't have this callback
            console.error(err)
            this.requestRender(1)
        }
    }
}

const filters = [
    [
        '$Object', 'Markers', true, 'filters',
        [
            ['Npc', 'NPCs', true, 'filters', []],
            ['NpcTiny', 'Race spirits', true, 'filters', []],
            ['Pickup', 'Pickups', true, 'filters', [
                ['CrystalKey', 'Regular keys', true, 'filters', []],
                ['BossKey', 'Boss keys', true, 'filters', []],
                ['CrystalBoss', 'Boss drop keys', true, 'filters', []],
                ['KeyUnique', 'Unique keys', true, 'filters', []],
                ['ModulePickup', 'Module pickups', true, 'filters', []],
                ['SkillPickup', 'Skill pickups', true, 'filters', []],
                ['StatsPickup', 'Stats pickups', true, 'filters', []],
                ['ScarabPickup', 'Scarabs', true, 'filters', []],
                ['LorePickup', 'Lore tablets', true, 'filters', []],
                ['MapPickup', 'Map pieces', true, 'filters', []],
            ], true],
            [
                'Enemy', 'Enemies', true, 'filters',
                [
                    ['size', 'Filter by size', false, 'number', 3],
                    ['tier', 'Filter by tier', false, 'number', 1],
                ], true
            ],
            [
                'Jar', 'Jars', true, 'filters',
                [
                    ['size', 'Filter by size', false, 'number', 0],
                    [
                        'dropType', 'Filter by drop type', false, 'enum',
                        [
                            [0, 'nothing [0]', false],
                            [1, 'hp [1]', false],
                            [2, 'random [2]', false],
                            [3, 'big crystal [3]', true],
                            [4, 'energy [4]', false],
                            [5, 'full energy [5]', false],
                            [6, '65 big crystals [6]', true],
                        ],
                    ]
                ], true
            ],
            [
                'CrystalDestroyable', 'Crystals', true, 'filters',
                [
                    ['dropXp', 'Filter by xp drop', true, 'boolean', [false, true]],
                    [
                        'size', 'Filter by size', false, 'enum',
                        (() => {
                            const result = []
                            for(let i = 0; i < xpForCrystalSize.length; i++) {
                                result.push([i, '' + i + ' [' + xpForCrystalSize[i] + ' xp]', true])
                            }
                            return result
                        })(),
                    ],
                ], true
            ],
            ['Unlocker', 'Unlockers', true, 'filters', []],
            ['UnlockerTrigger', 'Unlocker triggers', true, 'filters', []],
            ['Transition', 'Transitions', true, 'filters', []],
            ['Tunnel', 'Tunnels', true, 'filters', []],
            ['Torch', 'Torches', false, 'filters', []],
        ],
    ],
    [
        '$Rest', 'All other objects (slow!)', false, 'filters', [],
    ],
    [
        '$Collider', 'Colliders', false, 'filters',
        [
            [
                'layer', 'Filter by layer', true, 'enum',
                [
                    // TODO: auto calculate which layers are absent from colliders
                    [0, '0', false],
                    // [1, '1', true],
                    // [2, '2', true],
                    [3, '3', false],
                    [4, 'water [4]', true],
                    [5, '5', false],
                    [6, 'deep water [6]', true],
                    // [7, '7', true],
                    // [8, '8', true],
                    // [9, '9', true],
                    // [10, '10', true],
                    [11, '11', false],
                    [12, 'destroyable [12]', true],
                    [13, 'destroyable [13]', true],
                    [14, 'wall [14]', true],
                    [15, '15', false],
                    [16, 'hole [16]', true],
                    [17, 'trigger? [17]', false],
                    [18, '18', false],
                    // [19, '19', true],
                    [20, '20', false],
                    [21, '21', false],
                    // [22, '22', true],
                    [23, 'static [23]', true],
                    // [24, '24', true],
                    [25, 'bridge [25]', true],
                    [26, 'destroyable [26]', true],
                    // [27, '27', true],
                    // [28, '28', true],
                    [29, '29', false],
                    // [30, '30', true],
                    [31, '31', false],
                ], true
            ]
        ],
    ],
    [
        '$Background', 'Backgrounds', true, 'filters',
        []
    ]
]

function prepFiltersFilter(filter, res) {
    const propFilters = []
    const fieldFilters = filter[4]
    for(let j = 0; j < fieldFilters.length; j++) {
        const fieldFilter = fieldFilters[j]
        if(!fieldFilter[2]) continue
        else if(fieldFilter[3] === 'filters') {
            prepFiltersFilter(fieldFilter, res)
            continue
        }

        let values = []
        if(fieldFilter[3] === 'enum') {
            const filterValues = fieldFilter[4]
            for(let k = 0; k < filterValues.length; k++) {
                const filterValue = filterValues[k]
                if(!filterValue[2]) continue
                values.push(filterValue[0])
            }
        }
        else if(fieldFilter[3] === 'boolean') {
            if(fieldFilter[4][0]) values.push(false)
            if(fieldFilter[4][1]) values.push(true)
        }
        else {
            values.push(fieldFilter[4])
        }

        propFilters.push([fieldFilter[0], values])
    }

    res.push([filter[0], propFilters])
}

function extractMarkerFilters(filters) {
    const res = []
    if(!filters[0][2]) return res

    const ff = filters[0][4]
    for(let i = 0; i < ff.length; i++) {
        const filter = ff[i]

        if(!filter[2]) continue
        if(filter[3] !== 'filters') {
            console.error('not filters?', filter)
            continue
        }

        prepFiltersFilter(filter, res)
    }
    return res
}

function checkEquality(a, b) {
    if(Array.isArray(a) && Array.isArray(b)) {
        if(a.length !== b.length) return false
        for(let i = 0; i < a.length; i++) {
            if(!checkEquality(a[i], b[i])) return false
        }
        return true
    }
    else return a === b
}

function extractColliderFilters(filters) {
    const res = []

    if(!filters[2][2]) {
    }
    else if(filters[2][4][0][2]) {
        const ff = filters[2][4][0][4]
        for(let i = 0; i < ff.length; i++) {
            const f = ff[i]
            if(f[2]) res.push(f[0])
        }
    }
    else {
        for(let i = 0; i < 32; i++) {
            res.push(i)
        }
    }

    return res
}

function sendFiltersUpdate(context) {
    const lastFilters = context.lastFilters

    const markers = extractMarkerFilters(context.filters)
    markers.includeRest = context.filters[1][2]
    if(!checkEquality(markers, lastFilters.markers)
        || markers.includeRest !== lastFilters.includeRest
    ) {
        lastFilters.markers = markers

        try { worker.postMessage({ type: 'filters', markers }) }
        catch(e) { console.error(e) }
    }

    const colliders = extractColliderFilters(context.filters)
    if(!checkEquality(colliders, lastFilters.colliders)) {
        lastFilters.colliders = colliders

        collidersDisplay.setFiltered(context, colliders)
        circularDisplay.setFiltered(context, colliders)
    }

    backgroundsDisplay.setFiltered(context, context.filters[3][2])
}

const context = {
    canvas, gl,
    renderRequest: null,
    requestRender,
    camera: { posX: 0, posY: 33, scale: 10 },
    canvasSize: [],
    filters,
    lastFilters: {},
    currentObject: null,
    sizes: { fontSize: 16, heightCssPx: 1000 },
    filtersUpdated() {
        try { sideMenu.filtersUpdated() }
        catch(e) { console.error(e) }

        sendFiltersUpdate(this)
    },
    onClick(x, y) {
        worker?.postMessage({ type: 'click', x, y })
    },
    viewObject(index) {
        if(index == null) return
        worker?.postMessage({ type: 'getInfo', index })
    }
}

try { sideMenu.setup(context) }
catch(e) { console.error(e) }

try { canvasDisplay.setup(context) }
catch(e) { console.error(e) }

try { backgroundsDisplay.setup(context) }
catch(e) { console.error(e) }

try { if(__setup_markers) markersDisplay.setup(gl, context, markersP2.promise) }
catch(e) { console.error(e) }

try { specMarkerDisplay.setup(context, markersSpecialP2.promise) }
catch(e) { console.error(e) }

try { collidersDisplay.setup(gl, context, collidersP2.promise) }
catch(e) { console.error(e) }

try { circularDisplay.setup(gl, context, collidersP2.promise) }
catch(e) { console.error(e) }

function updFontSize() {
    const newSize = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const old = context.sizes.fontSize
    if(newSize !== old) {
        context.sizes.fontSize = newSize
        context.requestRender(1)
    }
}

// javascript can't notify when rem changes 🤡
try {
    const remPls = document.createElement('div')
    remPls.setAttribute('style', 'position:absolute;width:1rem')
    document.body.append(remPls)
    const observer = new ResizeObserver(() => {
        updFontSize()
    });
    observer.observe(remPls)
}
catch(err) {
    try { updFontSize() }
    catch(err) { console.error(err) }
    console.error(err)
}


/* prep Camera UBO */ {
    /*
layout(std140) uniform Camera {
    vec2 add;
    vec2 multiply;
    float markerRadius;
} cam;
    */

    // rounded to 4 floats!
    const ubo = gl.createBuffer()
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo)
    gl.bufferData(gl.UNIFORM_BUFFER, 32, gl.STATIC_DRAW)
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo)

    context.cameraUbo = ubo
    context.cameraBuf = new Float32Array(8)
}

try { sendFiltersUpdate(context) }
catch(e) { console.error(e) }

try {
    const url = new URL(window.location.href)
    const posx = parseFloat(url.searchParams.get('posx'))
    const posy = parseFloat(url.searchParams.get('posy'))
    const obji = parseFloat(url.searchParams.get('obji'))
    if(isFinite(posx) && isFinite(posy)) {
        context.camera.posX = posx
        context.camera.posY = posy
        context.requestRender(1)
    }
    if(isFinite(obji)) {
        worker?.postMessage({ type: 'getInfo', index: obji })
    }
}
catch(e) {
    console.error(e)
}

function updUrl(obj) {
    const posx = obj.pos[0]
    const posy = obj.pos[1]
    const obji = obj.index

    const url = new URL(window.location.href)
    url.searchParams.set('posx', posx)
    url.searchParams.set('posy', posy)
    url.searchParams.set('obji', obji)

    const prevUrl = new URL(window.location.href)
    if(url.toString() != prevUrl.toString()) {
        window.history.pushState({}, '', url)
    }
}

function updUrlScene(it) {
    const url = new URL(window.location.href)
    url.searchParams.set('obji', it.index)
    url.searchParams.delete('posx')
    url.searchParams.delete('posy')

    const prevUrl = new URL(window.location.href)
    if(url.toString() != prevUrl.toString()) {
        window.history.pushState({}, '', url)
    }
}
