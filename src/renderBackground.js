import * as B from '$/backgrounds.json'
import { loadShader, checkProg } from './render_util.js'
import backgroundsUrl from '$/backgrounds.pak'

// THIS LANGUAGE... IMAGINE NOT BEING ABLE TO PRINT A NUMBER WITH DECIMAL POINT
// NO, toFixed() ALSO ROUNDS THE NUMBER OR ADDS A MILLION ZEROS
// NO, toString() PRINTS INTEGERS WITHOUT DECIMAL POINT
const bgSize = B.size + '.0'

const vsSource = `#version 300 es
precision highp float;

layout(std140) uniform Camera {
    vec2 add;
    vec2 multiply;
    float markerRadius;
} cam;

in vec2 coord;
in int index;

const vec2 coords[4] = vec2[4](
    vec2(-0.5, -0.5),
    vec2(0.5, -0.5),
    vec2(-0.5, 0.5),
    vec2(0.5, 0.5)
);

out vec2 uv;
flat out int tIndex;

void main(void) {
    vec2 off = coords[gl_VertexID];
    vec2 pos = (coord + off * ${bgSize}) * cam.multiply + cam.add;
    gl_Position = vec4(pos, 1.0, 1.0);
    uv = vec2(off.x + 0.5, 0.5 - off.y);
    tIndex = index;
}
`
const fsSource = `#version 300 es
precision highp float; ${''/*required for fancy interpolation for some reason*/}

uniform highp sampler2DArray textures;
in vec2 uv;
flat in int tIndex;
out vec4 color;

vec4 g(int x, int y) {
    return texelFetch(textures, ivec3(x, y, tIndex), 0);
}

void main(void) {
    vec2 texSize = vec2(textureSize(textures, 0));
    vec2 pxCoord = uv * texSize;
    float diff = dFdx(pxCoord).x;
    float d2 = diff * 0.5;

    vec4 value = texture(textures, vec3(uv, tIndex));

    ${''/*fix ugly stairstep when zooming in*/}
    vec2 prev = pxCoord - d2, fprev = floor(prev);
    vec2 next = pxCoord + d2, fnext = floor(next);
    ivec2 cprev = ivec2(clamp(fprev, vec2(0), vec2(texSize - 1.0)));
    ivec2 cnext = ivec2(clamp(fnext, vec2(0), vec2(texSize - 1.0)));
    vec4 v1 = g(cprev.x, cprev.y), v3 = g(cnext.x, cprev.y),
         v7 = g(cprev.x, cnext.y), v9 = g(cnext.x, cnext.y);

    if(diff < 1.0) {
        vec2 fac = (next - fnext) / diff;
        value = mix(mix(v1, v3, fac.x), mix(v7, v9, fac.x), fac.y);
    }

    color = value;
}
`

// Need to quantize clear color to the same precision as background texture
// to remove seams. Result is hardware-dependent! ([0, 12, 16] and [8, 12, 25])
// RGB need to be unsigned bytes. Floats do not work
function convToRGB565(gl, inputC) {
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGB565, 1, 1)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGB, gl.UNSIGNED_BYTE, inputC)

    const fb = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)

    var res
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
        res = new Uint8Array(4)
        // Why is it RGBA? RGB doesn't work... Also floats do not work.
        // Also why do I need a framebuffer to read pixel data from a texture?
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, res)
    }
    else {
        res = inputC
        console.error('Framebuffer is not complete')
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindTexture(gl.TEXTURE_2D, null)

    gl.deleteFramebuffer(fb)
    gl.deleteTexture(tex)

    return res
}

function updateBackground(context, index, chunks) {
    const rd = context.backgrounds
    if(rd?.loadImages !== true) return

    const imgData = rd.images[index]

    const blob = new Blob(chunks, { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.src = url

    img.addEventListener('error', _ => {
        // note: don't redender just because a texture errored.
        // Technically can be the last texture, so this will make
        // mimpaps not appear. But only until the user moves the screen
        // or something else triggers a rerender, so shouldn't be a big deal
        rd.changed.push(index)
        imgData.done = true
        URL.revokeObjectURL(url)
        console.log('err')
    })
    img.addEventListener('load', _ => {
        const gl = context.gl

        gl.bindTexture(gl.TEXTURE_2D_ARRAY, rd.bgTextures)
        gl.texSubImage3D(
            gl.TEXTURE_2D_ARRAY, 0,
            0, 0, index,
            B.resolution, B.resolution, 1,
            gl.RGB, gl.UNSIGNED_BYTE,
            img
        )

        rd.changed.push(index)
        imgData.ok = true
        imgData.done = true

        if(index < 2) {
            context.requestRender(1)
        }
        else {
            context.requestRender(2, { timeout: 1000 })
        }
        URL.revokeObjectURL(url)
    })

}

async function downloadBackgrounds(context) {
    const gl = context.gl
    const rd = context.backgrounds
    if(!rd) return

    const resp = await fetch(backgroundsUrl)
    const body = resp.body
    const reader = body.getReader()

    var tmp = new Uint8Array()

    function tryRead(length) {
        if(tmp.length < length) return
        const chunks = [tmp.subarray(0, length)]
        tmp = tmp.subarray(length)
        return chunks
    }
    async function read(length) {
        const chunks = []
        var totalLength = tmp.length
        var last = tmp
        while(totalLength < length) {
            const { done, value } = await reader.read()
            if(done) throw new Error('Trying to read ' + length + ' but reached EOF')

            chunks.push(last)
            last = value
            totalLength += value.length
        }

        const off = length - (totalLength - last.length)
        chunks.push(last.subarray(0, off))
        tmp = last.subarray(off)

        return chunks
    }

    function combineChunks(chunks, len) {
        const res = new Uint8Array(len)
        var off = 0
        for(let i = 0; i < chunks.length; i++) {
            res.set(chunks[i], off)
            off += chunks[i].length
        }
        return res
    }

    const headerLenB = combineChunks(await read(4), 4)
    const headerLen = new DataView(
        headerLenB.buffer,
        headerLenB.byteOffset,
        headerLenB.byteLength
    ).getUint32(headerLenB, true)
    const header = combineChunks(await read(headerLen), headerLen)

    var index = 0
    // duplicate from load.js
    function parseCompressedInt() {
        var res = 0
        var i = 0
        do {
            var cur = header[index++]
            res = res + (cur << (i*7))
            i++
        } while(cur & 0b1000_0000)
        return res
    }

    const texturesC = parseCompressedInt()

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, rd.bgTextures)
    gl.texStorage3D(
        gl.TEXTURE_2D_ARRAY, __backgrounds_mipmap_levels,
        gl.RGB565, B.resolution, B.resolution,
        texturesC
    )

    gl.bindBuffer(gl.ARRAY_BUFFER, rd.buf)
    gl.bufferData(gl.ARRAY_BUFFER, texturesC * 12, gl.DYNAMIC_DRAW)

    const coordsDv = new DataView(new ArrayBuffer(texturesC * 12))
    rd.dataView = coordsDv

    const imageDatas = Array(texturesC)
    rd.images = imageDatas

    for(let i = 0; i < texturesC; i++) {
        const size = parseCompressedInt()
        const xi = parseCompressedInt()
        const yi = parseCompressedInt()

        const x = B.startPos[0] + xi * B.size
        const y = B.startPos[1] + yi * B.size
        imageDatas[i] = { ok: false, done: false, size, x, y }
    }

    for(let i = 0; i < texturesC; i++) {
        const id = imageDatas[i]
        var chunks = tryRead(id.size)
        if(chunks == null) chunks = await read(id.size)
        updateBackground(context, i, chunks)
    }
}

export function setup(context) {
    const { gl } = context

    const renderData = { changed: [], curCount: 0, doneCount: 0 }
    context.backgrounds = renderData

    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource)
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource)

    const prog = gl.createProgram()
    renderData.prog = prog
    gl.attachShader(prog, vertexShader, 'backgrounds v')
    gl.attachShader(prog, fragmentShader, 'backgrounds f')
    gl.linkProgram(prog)

    if(!checkProg(gl, prog)) return

    gl.useProgram(prog)

    gl.uniformBlockBinding(prog, gl.getUniformBlockIndex(prog, "Camera"), 0)

    const bgTextures = gl.createTexture()
    renderData.bgTextures = bgTextures

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, bgTextures)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST) // for now
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    renderData.images = null

    const buf = gl.createBuffer()
    renderData.buf = buf

    const vao = gl.createVertexArray()
    renderData.vao = vao
    gl.bindVertexArray(vao)

    const indexIn = gl.getAttribLocation(renderData.prog, 'index')
    const coordIn = gl.getAttribLocation(renderData.prog, 'coord')

    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.vertexAttribPointer(coordIn, 2, gl.FLOAT, false, 12, 0)
    gl.vertexAttribIPointer(indexIn, 1, gl.INT, 12, 8)

    gl.enableVertexAttribArray(coordIn)
    gl.vertexAttribDivisor(coordIn, 1)
    gl.enableVertexAttribArray(indexIn)
    gl.vertexAttribDivisor(indexIn, 1)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, bgTextures)
    const texturesU = gl.getUniformLocation(prog, 'textures')
    gl.uniform1i(texturesU, 0)

    const c = B.color
    const inputData = new Uint8Array(3)
    inputData[0] = (c      ) & 0xff
    inputData[1] = (c >>  8) & 0xff
    inputData[2] = (c >> 16) & 0xff
    const res = convToRGB565(gl, inputData)
    gl.clearColor(res[0] / 255, res[1] / 255, res[2] / 255, 1)

    renderData.ok = true

    renderData.loadImages = true
    renderData.showImages = true

    if(__backgrounds) {
        downloadBackgrounds(context).catch(e => {
            console.error('Error processing backgrounds', e)
        })
    }
    else {
        console.warn('skipping backgrounds')
    }
}

export function setFiltered(context, showImages) {
    const renderData = context.backgrounds
    if(!renderData) return console.error('renderData where?')

    renderData.showImages = showImages
    context.requestRender(1)
}

export function render(context) {
    const { gl } = context
    const rd = context.backgrounds
    if(rd?.ok !== true) {
        gl.clearColor(1, 1, 1, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)
        return
    }

    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(rd.prog)
    if(rd.changed.length != 0) {
        const dv = rd.dataView

        const ch = rd.changed
        const im = rd.images
        let addedC = 0
        for(let i = 0; i < ch.length; i++) {
            const index = ch[i]
            const it = im[index]
            if(!it.ok) continue
            dv.setFloat32(addedC * 12    , it.x, true)
            dv.setFloat32(addedC * 12 + 4, it.y, true)
            dv.setUint32 (addedC * 12 + 8, index, true)
            addedC++
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, rd.buf)
        gl.bufferSubData(gl.ARRAY_BUFFER, rd.curCount * 12, dv, 0, addedC * 12)

        rd.curCount += addedC
        rd.doneCount += ch.length
        ch.length = 0

        if(rd.doneCount === rd.images.length && !rd.mimpaps) {
            rd.mimpaps = true
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, rd.bgTextures)
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
            gl.generateMipmap(gl.TEXTURE_2D_ARRAY)
        }
    }

    if(rd.showImages) {
        gl.bindVertexArray(rd.vao)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, rd.curCount)
    }
}
