// @ts-check
import * as Load from '../load.js'
import markersData from '$/markers.json'
import markersMeta from '$/markers-meta.json'
import { meta, getAsSchema, parsedSchema, stepsToBase, getBase } from '../schema.js'

const onClickCompletable = {
    haveMarkers: false,
    haveFilters: false,
    /** @type {object} */
    coordinates: null,
    update() {
        if(!(this.haveMarkers && this.haveFilters && this.coordinates != null)) {
            return
        }
        onClick(this.coordinates.x, this.coordinates.y)
        this.coordinates = null
    },
}

const getInfoCompletable = {
    haveProcessedObjects: false,
    /** @type {number | null} */
    index: null,
    update() {
        if(!(this.haveProcessedObjects && this.index != null)) {
            return
        }
        getInfo(this.index)
        this.index = null
    },
}

const filtersCompletable = {
    haveProcessedObjects: false,
    /** @type {object} */
    filters: null,
    update() {
        if(!(this.haveProcessedObjects && this.filters != null)) {
            return
        }
        calcMarkerFilters(this.filters.selected, this.filters.filters)
        this.filters = null
    },
}

async function load(promise) {
    return new Uint8Array(await (await promise).arrayBuffer())
}

const objectsP = load(globalThis.objectsP)
const polygonsP = load(globalThis.polygonsP)
const message = globalThis.message

export function onmessage(it) {
    if(it.type === 'click') {
        onClickCompletable.coordinates = it
        onClickCompletable.update()
    }
    else if(it.type === 'getInfo') {
        getInfoCompletable.index = it.index
        getInfoCompletable.update()
    }
    else if(it.type == 'filters') {
        filtersCompletable.filters = { selected: it.selected, filters: it.filters }
        filtersCompletable.update()
    }
    else {
        console.warn('unknown message type', it.type)
    }
}

const ti = parsedSchema.typeSchemaI

var matrixArr
var matrixEndI = 0

var deg2rad = (Math.PI / 180)
// Note: rotation is counter-clockwise in both Unity and css (right?)
function construct(t) {
    var sin = Math.sin(t.rotation * deg2rad)
    var cos = Math.cos(t.rotation * deg2rad)

    const i = matrixEndI
    matrixArr[i + 0] = cos * t.scale[0]
    matrixArr[i + 1] = -sin * t.scale[1]
    matrixArr[i + 2] = t.position[0]
    matrixArr[i + 3] = sin * t.scale[0]
    matrixArr[i + 4] = cos * t.scale[1]
    matrixArr[i + 5] = t.position[1]
    matrixEndI += 6

    return i
}

var scenes
var objects = []
function prepareObjects(parentMatrixI, parentI, obj) {
    var transform
    for(let i = 0; i < obj.components.length && transform == null; i++) {
        transform = getAsSchema(obj.components[i], parsedSchema.typeSchemaI.Transform)
    }
    if(transform == null) throw "Unreachable"
    obj.transform = transform
    obj._parentI = parentI

    const index = objects.length
    objects.push(obj)
    obj._index = index

    var matrixI = construct(transform)
    if(parentMatrixI) premultiplyBy(matrixArr, matrixI, matrixArr, parentMatrixI)
    obj.matrixI = matrixI
    obj.pos = [matrixArr[matrixI + 2], matrixArr[matrixI + 5]]

    obj.children.forEach(c => prepareObjects(matrixI, index, c))
}

/**
    @param {Float32Array} n
    @param {number} ni
    @param {Float32Array} m
    @param {number} mi
*/
function premultiplyBy(n, ni, m, mi) {
    var a = m[mi + 0] * n[ni + 0] + m[mi + 1] * n[ni + 3]
    var b = m[mi + 0] * n[ni + 1] + m[mi + 1] * n[ni + 4]
    var c = m[mi + 0] * n[ni + 2] + m[mi + 1] * n[ni + 5] + m[mi + 2]
    var d = m[mi + 3] * n[ni + 0] + m[mi + 4] * n[ni + 3]
    var e = m[mi + 3] * n[ni + 1] + m[mi + 4] * n[ni + 4]
    var f = m[mi + 3] * n[ni + 2] + m[mi + 4] * n[ni + 5] + m[mi + 5]

    n[ni + 0] = a
    n[ni + 1] = b
    n[ni + 2] = c
    n[ni + 3] = d
    n[ni + 4] = e
    n[ni + 5] = f

    return n
}

const objectsLoadedP = objectsP.then(objectsA => {
    const s = performance.now()
    scenes = Load.parse(parsedSchema, objectsA)
    const objectCount = Load.getLastCounts()[ti.GameObject]
    const e1 = performance.now()

    matrixArr = new Float32Array(objectCount * 6)

    for(let i = 0; i < scenes.length; i++) {
        const roots = scenes[i].roots
        for(let j = 0; j < roots.length; j++) {
            prepareObjects(null, -1 - i, roots[j])
        }
    }
    const e2 = performance.now()

    console.log('parsed in', e1 - s)
    console.log('prepared in', e2 - e1)

    return objects
})

/** @returns {[textureI: number]} */
function createOneTex(comp) {
    return [parsedSchema.schema[comp._schema].textureI]
}

/** @typedef {(component: any, actualComponent: any) => [textureI: number, size?: number]} DisplayFunc */
/** @type {Map<number, DisplayFunc>} */
const displayFuncs = new Map()
/** @type {[baseSteps: number, funcI: number, priority: number][]} */
const schemaDisplayFuncI = Array(meta.schemas.length)
{
    /**
        @param {number} schemaI
        @param {DisplayFunc} func
    */
    function a(schemaI, func) { displayFuncs.set(schemaI, func) }

    a(ti.Enemy, (it, comp) => {
        const size = comp._schema === ti.Boss ? 3 : 1 + 0.33 * it.size
        return [it.spriteI, size]
    })

    a(ti.Jar, (it, comp) => [it.spriteI])
    a(ti.CrystalDestroyable, (it, comp) => {
        const ti = meta.crystalDestroyableTextures[it.dropXp ? 1 : 0]
        return [ti, 1 + 0.5 * it.size]
    })
    a(ti.ScarabPickup, (it, comp) => createOneTex(it)) // Note: flaky texture lookup in retrieve_objects.cs
    ;([
        ti.CrystalBoss, ti.CrystalKey, ti.KeyUnique, ti.BossKey, ti.ModulePickup,
        ti.SkillPickup, ti.StatsPickup, ti.LorePickup, ti.MapPickup
    ]).forEach(s => {
        const steps = stepsToBase(s, ti.Pickup)
        a(s, (it, comp) => [getBase(it, steps).spriteI])
    })
    a(ti.Pickup, (it, comp) => [it.spriteI])
    a(ti.Npc, (it, comp) => [it.spriteI, 1.5])
    a(ti.Tunnel, (it, comp) => [it.spriteI, 1.5])
    a(ti.Torch, (it, comp) => [it.spriteI, 1])
    a(ti.NpcTiny, (it, comp) => [it.spriteI, 1])

    const displayKeys = [...displayFuncs.keys()]

    for(let i = 0; i < meta.schemas.length; i++) {
        let added = false
        let si = 0;
        for(; si < displayKeys.length; si++) {
            const schemaI = displayKeys[si]
            const s = stepsToBase(i, schemaI)
            if(s != null) {
                schemaDisplayFuncI[i] = [s, schemaI, si]
                added = true
                break
            }
        }
        if(!added) {
            let s = stepsToBase(i, ti.Transition)
            if(s != null) {
                schemaDisplayFuncI[i] = [s, -1, si]
            }
            si++

            s = stepsToBase(i, ti.Unlocker)
            if(s != null) {
                schemaDisplayFuncI[i] = [s, -2, si]
            }
            si++

            s = stepsToBase(i, ti.UnlockerTrigger)
            if(s != null) {
                schemaDisplayFuncI[i] = [s, -3, si]
            }
            si++

            s = stepsToBase(i, ti.UnlockerTorch)
            if(s != null) {
                schemaDisplayFuncI[i] = [s, -4, si]
            }
            si++
        }
    }
}

/** @typedef {(component: any) => number | number[]} ReferenceFunc */
/** @type {Map<number, ReferenceFunc>} */
const referenceFuncs = new Map()
/** @type {Array<Array<[baseSteps: number, funcI: number]>>} */
const schemaReferenceFuncI = Array(meta.schemas.length)
{
    /**
        @param {number} schemaI
        @param {ReferenceFunc} func
    */
    function a(schemaI, func) { referenceFuncs.set(schemaI, func) }

    a(ti.ScarabPickup, (it) => it.container)
    a(ti.Transition, (it) => it.destI)
    a(ti.Unlocker, (it) => [it.target, it.targetBis])
    a(ti.UnlockerTrigger, (it) => [it.target, it.targetBis])
    a(ti.UnlockerTorch, (it) => [it.target, it.targetBis, it.linkedTorch])
    a(ti.Buyable, (it) => it.owner)
    a(ti.Tunnel, (it) => it.destination)

    const referenceKeys = [...referenceFuncs.keys()]

    for(let i = 0; i < meta.schemas.length; i++) {
        /** @type {Array<[baseSteps: number, funcI: number]>} */
        const res = []
        schemaReferenceFuncI[i] = res

        for(let j = 0; j < referenceKeys.length; j++) {
            const schemaI = referenceKeys[j]
            const s = stepsToBase(i, schemaI)
            if(s != null) res.push([s, schemaI])
        }
    }
}


/** @typedef {[textureI: number, x: number, y: number, size: number]} RegularDisplay */
/** @typedef {{ object: any, component: any }} MarkerInfo */

/** @type {MarkerInfo[]} */
var allMarkersInfo
/** @type {object[]} */
var restMarkersInfo
/** @type {Array<number> & { includeRest: boolean }} */
var filteredMarkersIndices

/** @type {Promise<{
    colliderObjects: Array<[object: any, component: any]>,
    regularDisplays: Array<RegularDisplay>,
}>} */

const objectsProcessedP = objectsLoadedP.then(objects => {
    /** @type {Array<[object: any, component: any]>} */
    const colliderObjects = []

    /** @type {RegularDisplay[]} */
    const regularDisplays = []

    /** @type {MarkerInfo[]} */
    const regularMarkers = []
    /** @type {MarkerInfo[]} */
    const specialMarkers = []
    /** @type {object[]} */
    const restMarkers = []

    const s = performance.now()
    for(let i = 0; i < objects.length; i++) {
        const obj = objects[i]
        const cs = obj.components

        let minPriority = Infinity
        let minInfo = null
        for(let j = 0; j < cs.length; j++) {
            const comp = cs[j]

            const info = schemaDisplayFuncI[comp._schema]
            if(info != null && info[2] < minPriority) {
                minInfo = { info, comp }
                minPriority = info[2]
            }

            const coll = getAsSchema(comp, ti.Collider2D)
            if(coll != null) {
                if(coll._schema !== ti.TilemapCollider2D) {
                    colliderObjects.push([obj, comp])
                }
            }

            const kInfos = schemaReferenceFuncI[comp._schema]
            for(let ki = 0; ki < kInfos.length; ki++) {
                const kInfo = kInfos[ki]
                const it = getBase(comp, kInfo[0])
                // @ts-ignore
                const res = referenceFuncs.get(kInfo[1])(it)
                if(Array.isArray(res)) {
                    for(let ri = 0; ri < res.length; ri++) {
                        const r = res[ri]
                        if(r < 0) continue
                        const obj = objects[r]
                        if(obj == null) continue

                        /** @type {Set<number> | undefined} */
                        const rb = obj._referencedBy
                        if(rb == null) obj._referencedBy = new Set([i])
                        else rb.add(i)
                    }
                }
                else {
                    if(res < 0) continue
                    const obj = objects[res]
                    if(obj == null) continue

                    /** @type {Set<number> | undefined} */
                    const rb = obj._referencedBy
                    if(rb == null) obj._referencedBy = new Set([i])
                    else rb.add(i)
                }
            }
        }

        if(minInfo != null) {
            const steps = minInfo.info[0], funcI = minInfo.info[1]
            const comp = minInfo.comp
            const it = getBase(comp, steps)
            if(funcI < 0) {
                specialMarkers.push({ object: obj, component: it })
            }
            else {
                obj._markerI = regularMarkers.length
                obj._markerType = 0
                regularMarkers.push({ object: obj, component: it })
                // @ts-ignore
                const r = displayFuncs.get(funcI)(it, comp)
                regularDisplays.push([r[0], obj.pos[0], obj.pos[1], r[1] ?? 1])
            }
        }
        else {
            restMarkers.push(obj)
        }
    }
    const e = performance.now()
    console.log('objects done in', e - s)

    allMarkersInfo = regularMarkers

    const startC = allMarkersInfo.length
    for(let i = 0; i < specialMarkers.length; i++) {
        const s = specialMarkers[i]
        s.object._markerI = startC + i
        s.object._markerType = 1
        allMarkersInfo.push(s)
    }

    restMarkersInfo = restMarkers

    return { colliderObjects, regularDisplays }
}).catch(e => {
    console.error('Error processing objects', e)
    throw e
})

objectsProcessedP.then(() => {
    filtersCompletable.haveProcessedObjects = true
    filtersCompletable.update()
    getInfoCompletable.haveProcessedObjects = true
    getInfoCompletable.update()
})

objectsProcessedP.then(({ regularDisplays }) => {
    if(!__worker_markers) return void(console.warn('skipping markers'))

    const [markerDataC, texW, texH] = markersMeta

    // note: 4 bytes of padding for std140
    const markerDataB = new ArrayBuffer(markerDataC * 16)
    const mddv = new DataView(markerDataB)
    for(var i = 0; i < markerDataC; i++) {
        const td = markersData[i]

        var aspect = td[2] / td[3]
        if(aspect > 1) aspect = -td[3] / td[2]

        mddv.setUint16 (i * 16    , Math.floor(td[0] * 0x10000 / texW), true)
        mddv.setUint16 (i * 16 + 2, Math.floor(td[1] * 0x10000 / texH), true)
        mddv.setUint16 (i * 16 + 4, Math.floor(td[2] * 0x10000 / texW), true)
        mddv.setUint16 (i * 16 + 6, Math.floor(td[3] * 0x10000 / texH), true)
        mddv.setFloat32(i * 16 + 8, aspect, true)
    }

    const markersB = new ArrayBuffer(regularDisplays.length * 16)
    const dv = new DataView(markersB)
    for(let i = 0; i < regularDisplays.length; i++) {
        const r = regularDisplays[i]
        dv.setFloat32(i * 16     , r[1], true)
        dv.setFloat32(i * 16 + 4 , r[2], true)
        dv.setUint32 (i * 16 + 8 , r[0], true)
        dv.setFloat32(i * 16 + 12, r[3], true)
    }

    message({
        type: 'markers-done',
        markersData: markerDataB,
        markers: markersB,
    }, [markerDataB, markersB])


    const specialC = allMarkersInfo.length - regularDisplays.length
    const specialMarkersB = new ArrayBuffer(specialC * 8)
    const sdv = new DataView(specialMarkersB)
    for(let i = 0; i < specialC; i++) {
        const mi = allMarkersInfo[regularDisplays.length + i]
        sdv.setFloat32(i * 8    , mi.object.pos[0], true)
        sdv.setFloat32(i * 8 + 4, mi.object.pos[1], true)
    }

    const restC = restMarkersInfo.length
    const restMarkersB = new ArrayBuffer(restC * 8)
    const rdv = new DataView(restMarkersB)
    for(let i = 0; i < restC; i++) {
        const mi = restMarkersInfo[i]
        rdv.setFloat32(i * 8    , mi.pos[0], true)
        rdv.setFloat32(i * 8 + 4, mi.pos[1], true)
    }

    message({
        type: 'markers-special-done',
        regularCount: regularDisplays.length,
        specialMarkers: specialMarkersB,
        restMarkers: restMarkersB
    }, [specialMarkersB, restMarkersB])
}).catch(e => {
    console.error('error processing markers', e)
})

const boxPoints = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]

var polygons
Promise.all([objectsProcessedP, polygonsP]).then(([pObjects, polygonsA]) => {
    polygons = Load.parse(parsedSchema, polygonsA)

    const { colliderObjects } = pObjects

    var totalPointsC = 0, totalIndicesC = 0
    var totalCircularC = 0
    const polyDrawDataByLayer = Array(32)
    const circularDrawDataByLayer = Array(32)

    for(var i = 0; i < 32; i++) {
        polyDrawDataByLayer[i] = []
        circularDrawDataByLayer[i] = []
    }

    for(var i = 0; i < colliderObjects.length; i++) {
        const pobj = colliderObjects[i]
        const layer = pobj[0].layer, coll = pobj[1], s = pobj[1]._schema

        if(s === ti.CompositeCollider2D) {
            const polygon = polygons[coll.polygons]
            if(polygon.indices.length == 0) continue

            polyDrawDataByLayer[layer].push(pobj)

            totalPointsC += polygon.points.length
            totalIndicesC += polygon.indices.length
        }
        else if(s === ti.PolygonCollider2D) {
            const polygon = polygons[coll.points]
            if(polygon.indices.length == 0) continue

            polyDrawDataByLayer[layer].push(pobj)

            totalPointsC += polygon.points.length
            totalIndicesC += polygon.indices.length
        }
        else if(s === ti.BoxCollider2D) {
            polyDrawDataByLayer[layer].push(pobj)

            totalPointsC += 4
            totalIndicesC += 6
        }
        else if(s === ti.CircleCollider2D) {
            circularDrawDataByLayer[layer].push(pobj)
            totalCircularC++
        }
        else if(s === ti.CapsuleCollider2D) {
            circularDrawDataByLayer[layer].push(pobj)
            totalCircularC++
        }
    }

    const verts = new Float32Array(totalPointsC * 2)
    const indices = new Uint32Array(totalIndicesC)
    let vertI = 0, indexI = 0
    const polyDrawData = []
    for(let i = 0; i < polyDrawDataByLayer.length; i++) {
        const startIndexI = indexI

        const datas = polyDrawDataByLayer[i]
        if(datas.length == 0) continue
        for(let j = 0; j < datas.length; j++) {
            const startVertexI = vertI

            const data = datas[j]
            const mI = data[0].matrixI
            const coll = data[1]
            const off = getAsSchema(coll, ti.Collider2D).offset

            if(coll._schema === ti.CompositeCollider2D) {
                const poly = polygons[coll.polygons]
                for(let k = 0; k < poly.points.length; k++) {
                    const x = poly.points[k][0] + off[0]
                    const y = poly.points[k][1] + off[1]
                    verts[vertI*2    ]
                        = x * matrixArr[mI + 0]
                        + y * matrixArr[mI + 1]
                        + matrixArr[mI + 2]

                    verts[vertI*2 + 1]
                        = x * matrixArr[mI + 3]
                        + y * matrixArr[mI + 4]
                        + matrixArr[mI + 5]
                    vertI++
                }
                for(let k = 0; k < poly.indices.length; k++) {
                    indices[indexI++] = startVertexI + poly.indices[k]
                }
            }
            else if(coll._schema === ti.PolygonCollider2D) {
                const poly = polygons[coll.points]
                for(let k = 0; k < poly.points.length; k++) {
                    const x = poly.points[k][0] + off[0]
                    const y = poly.points[k][1] + off[1]
                    verts[vertI*2    ]
                        = x * matrixArr[mI + 0]
                        + y * matrixArr[mI + 1]
                        + matrixArr[mI + 2]

                    verts[vertI*2 + 1]
                        = x * matrixArr[mI + 3]
                        + y * matrixArr[mI + 4]
                        + matrixArr[mI + 5]

                    vertI++
                }
                for(let k = 0; k < poly.indices.length; k++) {
                    indices[indexI++] = startVertexI + poly.indices[k]
                }
            }
            else if(coll._schema === ti.BoxCollider2D) {
                const size = coll.size
                for(let k = 0; k < boxPoints.length; k++) {
                    const x = boxPoints[k][0] * size[0] + off[0]
                    const y = boxPoints[k][1] * size[1] + off[1]
                    verts[vertI*2    ]
                        = x * matrixArr[mI + 0]
                        + y * matrixArr[mI + 1]
                        + matrixArr[mI + 2]

                    verts[vertI*2 + 1]
                        = x * matrixArr[mI + 3]
                        + y * matrixArr[mI + 4]
                        + matrixArr[mI + 5]

                    vertI++
                }
                indices[indexI++] = startVertexI + 0
                indices[indexI++] = startVertexI + 1
                indices[indexI++] = startVertexI + 2
                indices[indexI++] = startVertexI + 1
                indices[indexI++] = startVertexI + 2
                indices[indexI++] = startVertexI + 3
            }
        }

        polyDrawData.push({ startIndexI, length: indexI - startIndexI, layer: i })
    }

    // we need to send the whole 2x3 matrix + the bigger size of the capsule collider
    const cirSize = 28
    const cirSizeF = 7  // in float32
    const circularData = new ArrayBuffer(cirSize * totalCircularC)
    const arr = new Float32Array(circularData)

    const circularDrawData = []
    var circI = 0
    for(let i = 0; i < circularDrawDataByLayer.length; i++) {
        const startCircI = circI

        const cdd = circularDrawDataByLayer[i]
        if(cdd.length === 0) continue
        for(let j = 0; j < cdd.length; j++) {
            const data = cdd[j]
            const mI = data[0].matrixI
            const coll = data[1]
            const off = getAsSchema(coll, ti.Collider2D).offset

            const arrOff = circI * cirSizeF

            if(coll._schema === ti.CircleCollider2D) {
                arr[arrOff + 0] = coll.radius * 2
                arr[arrOff + 2] = off[0]
                arr[arrOff + 4] = coll.radius * 2
                arr[arrOff + 5] = off[1]
                arr[arrOff + 6] = 1
                premultiplyBy(arr, arrOff, matrixArr, mI)
                circI++
            }
            else if(coll._schema === ti.CapsuleCollider2D) {
                const size = coll.size
                if(coll.size[0] > coll.size[1]) {
                    arr[arrOff + 0] = coll.size[0]
                    arr[arrOff + 2] = off[0]
                    arr[arrOff + 4] = coll.size[1]
                    arr[arrOff + 5] = off[1]
                    arr[arrOff + 6] = size[0] / size[1]
                }
                else { // rotate 90 degrees because the shader expects width > height
                    arr[arrOff + 1] = -coll.size[0]
                    arr[arrOff + 2] = off[0]
                    arr[arrOff + 3] = coll.size[1]
                    arr[arrOff + 5] = off[1]
                    arr[arrOff + 6] = size[1] / size[0]
                }
                premultiplyBy(arr, arrOff, matrixArr, mI)
                circI++
            }
        }

        circularDrawData.push({ startIndexI: startCircI, length: circI - startCircI, layer: i })
    }

    message({
        type: 'colliders-done',
        verts, indices, polyDrawData,
        circularData, circularDrawData,
    }, [verts.buffer, indices.buffer, circularData])
}).catch(e => {
    console.error('Error processing colliders', e)
})

objectsProcessedP.then(d => {
    onClickCompletable.haveMarkers = true
    onClickCompletable.update()
})

function serializeObject(obj) {
    const referenceInfos = {}

    const children = Array(obj.children.length)
    for(let i = 0; i < obj.children.length; i++) {
        const child = obj.children[i]
        if(child) {
            children[i] = child._index
            const name = child.name
            referenceInfos[child._index] = [name, child.pos[0], child.pos[1]]
        }
        else {
            children[i] = null
        }
    }

    function a(ii) {
        const obj = objects[ii]
        if(!obj) return
        const name = obj.name
        referenceInfos[ii] = [name, obj.pos[0], obj.pos[1]]
    }

    for(let i = 0; i < obj.components.length; i++) {
        const cc = obj.components[i]
        let s
        s = getAsSchema(cc, ti.ScarabPickup)
        if(s) a(s.container)

        s = getAsSchema(cc, ti.Transition)
        if(s) a(s.destI)

        s = getAsSchema(cc, ti.Unlocker)
        if(s) {
            a(s.target)
            a(s.targetBis)
            for(let i = 0; i < s.group.length; i++) a(s.group[i])
        }

        s = getAsSchema(cc, ti.UnlockerTorch)
        if(s) {
            a(s.target)
            a(s.targetBis)
            a(s.linkedTorch)
            for(let i = 0; i < s.group.length; i++) a(s.group[i])
        }

        s = getAsSchema(cc, ti.Buyable)
        if(s) a(s.owner)

        s = getAsSchema(cc, ti.Tunnel)
        if(s) a(s.destination)

        s = getAsSchema(cc, ti.Tunnel)
        if(s) a(s.destination)
    }

    /** @type {Set<number> | undefined} */
    const _referencedBy = obj._referencedBy
    /** @type {number[]} */
    let referencedBy
    if(_referencedBy) {
        referencedBy = [..._referencedBy]
        for(let i = 0; i < referencedBy.length; i++) {
            a(referencedBy[i])
        }
    }
    else {
        referencedBy = []
    }

    const parentChain = []
    var parentI = obj._parentI
    for(let i = 0; i < 1000; i++) { // no infinite loops!
        parentChain.push(parentI)

        if(parentI < 0) {
            const name = scenes[-parentI - 1]?.name
            referenceInfos[parentI] = [name]
            break
        }
        else {
            const parent = objects[parentI]
            if(parent == null) break

            const name = parent.name
            referenceInfos[parentI] = [name, parent.pos[0], parent.pos[1]]
            parentI = parent._parentI
        }
    }

    return {
        index: obj._index,
        name: obj.name,
        pos: obj.pos,
        components: obj.components,
        markerI: obj._markerI,
        markerType: obj._markerType,
        referenceInfos,
        children,
        parentChain: parentChain,
        referencedBy,
    }
}

function onClick(x, y) {
    /** @type {Array<[distance: number, object: object | null]>} */
    const closest = Array(20)
    for(let i = 0; i < closest.length; i++) {
        closest[i] = [1/0, null]
    }

    for(let i = 0; i < filteredMarkersIndices.length; i++) {
        const index = filteredMarkersIndices[i]
        const obj = allMarkersInfo[index].object
        const pos = obj.pos
        const dx = pos[0] - x
        const dy = pos[1] - y
        const sqDist = dx*dx + dy*dy

        var insertI = 0
        while(insertI < closest.length && closest[insertI][0] < sqDist) insertI++

        if(insertI < closest.length) {
            closest.pop()
            closest.splice(insertI, 0, [sqDist, obj])
        }
    }

    if(filteredMarkersIndices.includeRest) {
        for(let i = 0; i < restMarkersInfo.length; i++) {
            const obj = restMarkersInfo[i]
            const pos = obj.pos
            const dx = pos[0] - x
            const dy = pos[1] - y
            const sqDist = dx*dx + dy*dy

            var insertI = 0
            while(insertI < closest.length && closest[insertI][0] < sqDist) insertI++

            if(insertI < closest.length) {
                closest.pop()
                closest.splice(insertI, 0, [sqDist, obj])
            }
        }

    }

    let endI = 0
    while(endI < closest.length && closest[endI][1] != null) endI++
    closest.length = endI

    if(closest.length !== 0) {
        const c = closest[0]
        const obj = c[1]
        const first = serializeObject(obj)

        const nearby = Array(closest.length - 1)
        const nearbyReferenceInfos = {}
        nearby.length = 0
        for(let i = 1; i < closest.length; i++) {
            const c = closest[i]
            const co = c[1]
            nearby.push({
                distance: Math.sqrt(c[0]),
                index: co._index,
            })
            nearbyReferenceInfos[co._index] = [co.name, co.pos[0], co.pos[1]]
        }

        message({ type: 'click', first, nearby, nearbyReferenceInfos })
    }
    else {
        message({ type: 'click' })
    }
}


async function getInfo(index) {
    if(index >= 0) {
        const object = objects[index]
        if(object) {
            message({ type: 'getInfo', object: serializeObject(object) })
        }
        else {
            message({ type: 'getInfoError' })
        }
        return
    }

    const s = scenes[-index - 1]
    if(s) {
        const referenceInfos = {}

        const children = Array(s.roots.length)
        for(let i = 0; i < s.roots.length; i++) {
            const child = s.roots[i]
            if(child) {
                children[i] = child._index
                const name = child.name
                referenceInfos[child._index] = [name, child.pos[0], child.pos[1]]
            }
            else {
                children[i] = null
            }
        }

        message({ type: 'getSceneInfo', scene: { referenceInfos, children, name: s.name, index } })
    }
    else {
        message({ type: 'getInfoError' })
    }
}

const filtersForType = {
    redCoins: [
        { [ti.Jar]: [['dropType', [3, 6]]], [ti.Enemy]: [['size', [3]]] },
        { [ti.Boss]: true },
    ],
    hp: [{ [ti.StatsPickup]: [['statsId', [11]]] }],
    energy: [{ [ti.StatsPickup]: [['statsId', [8]]] }],
    scarabs: [{ [ti.ScarabPickup]: [] }],
    modules: [{
        [ti.StatsPickup]: [['statsId', [
            0, 2, 3, 4, 6, 7, 9, 10, 12, 13, 14, 15
        ]]],
        [ti.ModulePickup]: [],
        [ti.SkillPickup]: [],
    }],
    map:[{ [ti.MapPickup]: [], [ti.LorePickup]: [] }],
}

const dungeonNames = [
    'Overworld > Dungeon1_0',
    'Overworld > Dungeon2_0',
    'Overworld > Dungeon3_0',
    'Overworld > Dungeon4_0',
    'Overworld > Dungeon5_0',

    'Overworld > Cave_47',
    'Cave > Overworld_47',
]
const templeNames = [
    'Overworld > Temple1_0',
    'Overworld > Temple2_0',
    'Overworld > Temple3_0',
    'Overworld > Tower_1',
    'Overworld > Tower_2',
    'Overworld > Tower_3',
    'Overworld > Tower_4',
    'Overworld > Tower_5',
    'Overworld > Tower_6',
    'Overworld > Tower_7',
    'Overworld > Tower_8',
    'Overworld > Tower_9',
    'Overworld > Tower_10',
]

function calcMarkerFilters(name, filters) {
    /** @type Array<number> */
    let filteredIndices
    if(name == 'custom') {
        const fs = {}
        for(let i = 0; i < filters.length; i++) {
            fs[ti[filters[i][0]]] = filters[i][1]
        }

        filteredIndices = customFilters(fs)
    }
    else if(filtersForType[name] != null) {
        const f = filtersForType[name]
        let fs = f[0]
        const es = f[1]
        if(filters.transitions) {
            fs = { ...fs, [ti.Transition]: [] }
        }
        filteredIndices = customFilters(fs, es)
    }
    else if(name == 'default') {
        const e = []
        const fs = {
            [ti.Jar]: [['dropType', [3, 6]]], [ti.Enemy]: [['size', [3]]],
            [ti.Enemy]: [['size', [3]]],
            [ti.Boss]: e,
            [ti.Npc]: e,
            [ti.Pickup]: e,
            [ti.CrystalKey]: e,
            [ti.BossKey]: e,
            [ti.CrystalBoss]: e,
            [ti.KeyUnique]: e,
            [ti.ModulePickup]: e,
            [ti.SkillPickup]: e,
            [ti.StatsPickup]: e,
            [ti.ScarabPickup]: e,
            [ti.LorePickup]: e,
            [ti.MapPickup]: e,
            [ti.Unlocker]: e,
            [ti.UnlockerTrigger]: e,
            [ti.UnlockerTorch]: e,
            [ti.NpcTiny]: e,
        }
        if(filters.transitions) {
            fs[ti.Transition] = e
            fs[ti.Tunnel] = e
        }

        filteredIndices = customFilters(
            fs,
            null,
            new Set([...dungeonNames, ...templeNames])
        )
    }
    else if(name == 'raceSpirits') {
        filteredIndices = findRaceSpirits(filters.transitions)
    }
    else if(name == 'dungeon') {
        filteredIndices = findNames(dungeonNames)
    }
    else if(name == 'temples') {
        filteredIndices = findNames(templeNames)
    }

    if(!filteredIndices) {
        filteredIndices = []
    }

    message({ type: 'marker-filters', selected: name, markersIndices: filteredIndices })

    filteredMarkersIndices =  /** @type {any} */(filteredIndices)
    filteredMarkersIndices.includeRest = filters.includeRest
    onClickCompletable.haveFilters = true
    onClickCompletable.update()
}

function customFilters(filters, excludes, filterNames) {
    /** @type Array<number> */
    const filteredIndices = Array(allMarkersInfo.length)
    filteredIndices.length = 0
    for(let i = 0; i < allMarkersInfo.length; i++) {
        const marker = allMarkersInfo[i];
        const comp = marker.component
        const fieldsFilter = filters[comp._schema]

        let add = false
        if(fieldsFilter) {
            add = true
            for(let j = 0; j < fieldsFilter.length; j++) {
                const ff = fieldsFilter[j]
                if(ff[1].includes(comp[ff[0]])) continue

                add = false
                break
            }
        }

        if(!add && filterNames && filterNames.has(marker.object.name)) add = true

        if(add && excludes) {
            const cs = marker.object.components
            for(let i = 0; i < cs.length; i++) {
                if(!excludes[cs[i]._schema]) continue

                add = false
                break
            }
        }

        if(add) filteredIndices.push(i)
    }

    return filteredIndices
}

function findNames(names) {
    /** @type Array<number> */
    const filteredIndices = Array(names.length)
    filteredIndices.length = 0
    for(let i = 0; i < allMarkersInfo.length; i++) {
        const marker = allMarkersInfo[i]
        const obj = marker.object
        if(!names.includes(obj.name)) continue
        filteredIndices.push(i)
    }
    return filteredIndices
}

function findRaceSpirits(transitions) {
    const filter1 = ti.NpcTiny
    const filter2 = ti.Transition
    const names = [
        "CaveExtra > Cave_0",
        "Cave > CaveExtra_0",
        // second door from ^
        "Cave > Overworld_41",
        "Overworld > Cave_41",

        "CaveExtra > Overworld_1",
        "Overworld > CaveExtra_1",

        "CaveExtra > Overworld_2",
        "Overworld > CaveExtra_2",

        "CaveExtra > Overworld_3",
        "Overworld > CaveExtra_3",

        "CaveExtra > Overworld_4",
        "Overworld > CaveExtra_4",

        "CaveExtra > Overworld_5",
        "Overworld > CaveExtra_5",

        "Cave > Overworld_9",
        "Overworld > Cave_9",

        "Cave > Tower_0",
        "Tower > Cave_0",
        // second door from ^
        "Tower > Overworld_4",
        "Overworld > Tower_4",
    ]

    /** @type Array<number> */
    const filteredIndices = Array(50)
    filteredIndices.length = 0

    for(let i = 0; i < allMarkersInfo.length; i++) {
        const marker = allMarkersInfo[i];
        const comp = marker.component
        const obj = marker.object
        if(comp._schema === filter1) {
            filteredIndices.push(i)
        }
        else if(comp._schema === filter2) {
            if(transitions) {
                filteredIndices.push(i)
            }
            else if(names.includes(obj.name)) {
                filteredIndices.push(i)
            }
        }
    }

    return filteredIndices

}
