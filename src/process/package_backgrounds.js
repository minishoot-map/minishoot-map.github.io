import { promises as fs } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import * as B from '../data-raw/backgrounds/backgrounds.js'

const srcDir = join(import.meta.dirname, '../data-processed/backgrounds')
const dstFilename = join(import.meta.dirname, '../data-processed/backgrounds.pak')

const bs = new Map()

for(let i = 0; i < B.backgrounds.length; i++) {
    const [x, y] = B.backgrounds[i]
    let col = bs.get(x)
    if(col == null) bs.set(x, col = new Map())
    col.set(y, fs.readFile(join(srcDir, x + '_' + y + '.png')))
}

const len = B.backgrounds.length

const filesOrder = (() => {
    const order = []

    let stepSize = 1
    let x = 18, y = 12
    let dx = -1, dy = 0

    function add() {
        const col = bs.get(x)
        if(col == null) return
        const val = col.get(y)
        if(val != null) order.push({ x, y, fileP: val })
    }

    function step() {
        for(let i = 0; i < stepSize; i++) {
            if(order.length >= len) return true
            x += dx
            y += dy
            add()
        }
        // 90 degrees counter clockwise
        const tmp = dx
        dx = -dy
        dy = tmp
    }

    add()
    // go stepSize, turn, go stepSize, stepSize++
    while(true) {
        if(step()) break
        if(step()) break
        stepSize++
    }

    return order
})()

const header = []
function writeUint(v) {
    var it = v
    while(true) {
        var div = it >> 7
        if(div == 0) {
            header.push(it)
            break
        }
        else {
            header.push((it | (1 << 7)) & 0xff)
            it = div - 1
        }
    }
}

writeUint(len)
for(let i = 0; i < filesOrder.length; i++) {
    const it = filesOrder[i]
    const file = await it.fileP
    writeUint(file.length)
    writeUint(it.x)
    writeUint(it.y)
}

const dst = createWriteStream(dstFilename)
const hLen = Buffer.alloc(4)
hLen.writeUint32LE(header.length)
dst.write(hLen)
dst.write(Buffer.from(header))

for(let i = 0; i < filesOrder.length; i++) {
    dst.write(await filesOrder[i].fileP)
}

dst.end(async() => {
    console.log('Done!')
})
