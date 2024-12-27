import cdt2d from 'cdt2d' // great lib! Many thanks
import cleanPSLG from 'clean-pslg'
import * as fs from 'node:fs'
import { join } from 'node:path'

import * as meta from '../data-raw/objects/schemas.js'
import { parseSchema, parse } from '../load.js'

const root = join(import.meta.dirname, '..')

const proc = join(root, 'data-processed')
fs.mkdirSync(proc, { recursive: true })

const collidersData = fs.readFileSync(join(root, 'data-raw', 'objects', 'polygons.bp'))
const parsedSchema = parseSchema(meta.schemas)
const allPolygons = parse(parsedSchema, collidersData)

const points = []
const edges = []
function triangulate(i) {
    points.length = 0
    edges.length = 0

    const polygons = allPolygons[i]
    for(let j = 0; j < polygons.length; j++) {
        const polygon = polygons[j]
        if(polygon.length < 3) throw "What is this polygon length " + polygon.length

        var prevPointI = points.length + polygon.length-1 // last point
        for(let k = 0; k < polygon.length; k++) {
            const pointI = points.length
            points.push(polygon[k])
            edges.push([prevPointI, pointI])
            prevPointI = pointI
        }
    }

    /* const ab = new ArrayBuffer(8)
    const dv = new DataView(ab)

    const coords = {}
    for(let i = 0; i < points.length; i++) {
        const p = points[i]
        dv.setFloat32(0, p[0])
        dv.setFloat32(4, p[1])
        const res = dv.getFloat64(0)
        if(coords[res] != null) console.log('Duplicate at', coords[res], i)
        coords[res] = i
    }*/

    if(cleanPSLG(points, edges)) {
        // HOW ARE THERE DUPLICATES??? UNITY HELLO??????????
        // this actually happens on deep water in Overworld, look at the (scuffed) bottom part
        console.log('path', i, 'is broken!')
    }

    return cdt2d(points, edges, { exterior: false })
}

function compactInt(it) {
    if(it < 0) throw "Unreachable"
    const bytes = []
    while(true) {
        var div = it >> 7
        if(div == 0) {
            bytes.push(it)
            break
        }
        else {
            bytes.push((it | (1 << 7)) & 0xff)
            it = div - 1
        }
    }
    return new Uint8Array(bytes)
}

function isPZero(it) {
    return it == 0.0 && 1 / it > 0
}
function compactFloat(it) {
    if(isPZero(it)) {
        const arr = new Uint8Array(1)
        arr[0] = 0b1111_1111
        return arr
    }
    const tmpBuffer = new ArrayBuffer(4)
    const tmpView = new DataView(tmpBuffer)
    tmpView.setFloat32(0, it, false)
    const f = tmpView.getUint8(0)
    if(f == 0b1111_1111 || f == 0b0111_1111) {
        throw "Scary numbers, not tested"
    }
    return tmpView
}

function writeVector2(sw, it) {
    var px0 = isPZero(it[0])
    if(px0 && isPZero(it[1])) {
        const arr = new Uint8Array(1)
        arr[0] = 0b0111_1111
        sw.write(arr)
        return
    }
    if(px0) {
        const arr = new Uint8Array(1)
        arr[0] = 0b1111_1111
        sw.write(arr)
        sw.write(compactFloat(it[1]))
        return
    }

    const tmpBuffer = new ArrayBuffer(4)
    const tmpView = new DataView(tmpBuffer)
    tmpView.setFloat32(0, it[0], false)
    const f = tmpView.getUint8(0)
    if(f == 0b1111_1111 || f == 0b0111_1111 || f == 0b1111_1110) {
        throw "Scary numbers, not tested"
    }
    sw.write(tmpView)
    sw.write(compactFloat(it[1]))
}

const v2arrI = parsedSchema.typeSchemaI['UnityEngine.Vector2[]']
if(v2arrI == null) throw "vec2[] doesn't exist"

var intArrI = parsedSchema.typeSchemaI['System.Int32[]']
if(intArrI == null) {
    var intI = parsedSchema.typeSchemaI['System.Int32']
    if(intI == null) throw "int doesn't exist"

    intArrI = meta.schemas.length
    meta.schemas.push([2, 'System.Int32[]', { elementT: intI }])
}

const colliderDataI = meta.schemas.length
meta.schemas.push([1, "$ColliderData$", { members: ['points', 'indices'], membersT: [v2arrI, intArrI] }])
const colliderDataArrI = meta.schemas.length
meta.schemas.push([2, "$ColliderData$[]", { elementT: colliderDataI }])

const sw = fs.createWriteStream(join(proc, 'polygons.bp'))
sw.write(compactInt(colliderDataArrI))
sw.write(compactInt(allPolygons.length))

for(let i = 0; i < allPolygons.length; i++) {
    const res = triangulate(i)
    sw.write(compactInt(points.length))
    for(let j = 0; j < points.length; j++) {
        writeVector2(sw, points[j])
    }
    sw.write(compactInt(res.length * 3))
    for(let j = 0; j < res.length; j++) {
        sw.write(compactInt(res[j][0]))
        sw.write(compactInt(res[j][1]))
        sw.write(compactInt(res[j][2]))
    }
    console.log(i, res.length)
}

fs.writeFileSync(join(proc, 'meta.json'), JSON.stringify(meta))

console.log('Done!')

/* const res = triangulate(1)
const re = []
for(let i = 0; i < res.length; i++) {
    const r = res[i]
    re.push([points[r[0]], points[r[1]], points[r[2]]])
}
await fs.writeFile(join(root, 'tmp', 'result.json'), JSON.stringify(re)) */
