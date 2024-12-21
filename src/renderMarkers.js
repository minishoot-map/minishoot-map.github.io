import { loadShader, checkProg } from './render_util.js'
import markersMeta from '$/markers-meta.json'

import markersImageUrl from '$/markers.png'

const vsSource = `#version 300 es
precision highp float;

layout(std140) uniform Camera {
    vec2 add;
    vec2 multiply;
} cam;

uniform float markerSize;
uniform int drawType;

struct MarkerData {
    uint xy, wh;
    float aspect;
};

layout(std140) uniform MarkersData {
    MarkerData markersData[${markersMeta[0]}];
};

in vec2 coord;
in uint index;
in float size;

out vec2 uv;
flat out int type;

const vec2 coords[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
const float intToFloat = ${1 / 65535};

void main(void) {
    MarkerData md = markersData[index];
    float texAspect = md.aspect;
    uint xy = md.xy;
    uint wh = md.wh;

    vec2 offset = coords[gl_VertexID] * markerSize * (size + float(drawType & 1) * 0.4);
    if(texAspect < 0.0) offset.y *= -texAspect;
    else offset.x *= texAspect;

    vec2 pos = (coord + offset) * cam.multiply + cam.add;
    gl_Position = vec4(pos, 1.0, 1.0);

    vec2 uvOff = vec2(wh & 65535u, wh >> 16u) * vec2(gl_VertexID & 1, 1 - (gl_VertexID >> 1));
    uv = (vec2(xy & 65535u, xy >> 16u) + uvOff) * intToFloat;

    type = drawType;
}
`
const fsSource = `#version 300 es
precision mediump float;

uniform sampler2D tex;
in vec2 uv;
flat in int type;

out vec4 color;

void main(void) {
    vec4 col = texture(tex, uv);
    if((type & 1) != 0) {
        col.rgb = vec3(1, 0, 0);
    }
    if(((type >> 1) & 1) != 0) {
        col.rgb = mix(col.rgb, vec3(1.0), 0.2);
    }


    color = col;
}
`

function checkOk(context) {
    const m = context?.markers
    if(m && m.texOk && m.buffersOk && m.indicesOk) {
        m.ok = true
        context.requestRender(1)
    }
}

function createVao(gl, renderData) {
    const result = { count: 0 }

    const dataB = gl.createBuffer()
    result.dataB = dataB

    const vao = gl.createVertexArray()
    result.vao = vao
    gl.bindVertexArray(vao)

    gl.bindBuffer(gl.ARRAY_BUFFER, dataB)
    const { coordIn, indexIn, sizeIn } = renderData.in
    if(coordIn != -1) {
        gl.enableVertexAttribArray(coordIn)
        gl.vertexAttribPointer(coordIn, 2, gl.FLOAT, false , markerByteC, 0)
        gl.vertexAttribDivisor(coordIn, 1)
    }

    if(indexIn != -1) {
        gl.enableVertexAttribArray(indexIn)
        gl.vertexAttribIPointer(indexIn, 1, gl.UNSIGNED_INT, markerByteC, 8)
        gl.vertexAttribDivisor(indexIn, 1)
    }

    if(sizeIn != -1) {
        gl.enableVertexAttribArray(sizeIn)
        gl.vertexAttribPointer(sizeIn, 1, gl.FLOAT, false  , markerByteC, 12)
        gl.vertexAttribDivisor(sizeIn, 1)
    }
    gl.bindVertexArray(null)

    return result
}

export function setup(gl, context, markersDataP) {
    const renderData = {}
    context.markers = renderData

    if(!__setup_markers) return

    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource, 'markers v')
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource, 'markers f')

    const prog = gl.createProgram()
    gl.attachShader(prog, vertexShader)
    gl.attachShader(prog, fragmentShader)
    gl.linkProgram(prog)

    if(!checkProg(gl, prog)) return

    gl.useProgram(prog)

    gl.uniformBlockBinding(prog, gl.getUniformBlockIndex(prog, "Camera"), 0)

    const texture = gl.createTexture()
    renderData.texture = texture
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texStorage2D(gl.TEXTURE_2D, __markers_mipmap_levels, gl.RGBA8, markersMeta[1], markersMeta[2])
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    gl.activeTexture(gl.TEXTURE0 + 1)
    gl.bindTexture(gl.TEXTURE_2D, texture)

    const img = new Image()
    img.src = markersImageUrl
    img.addEventListener('load', _ => {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, img.width, img.height, gl.RGBA, gl.UNSIGNED_BYTE, img)
        gl.generateMipmap(gl.TEXTURE_2D)

        renderData.texOk = true
        checkOk(context)
    })

    const drawType = gl.getUniformLocation(prog, 'drawType')
    const markerSize = gl.getUniformLocation(prog, 'markerSize')
    const tex = gl.getUniformLocation(prog, 'tex')
    gl.uniform1i(tex, 1)

    renderData.u = { markerSize, drawType }
    renderData.prog = prog

    const coordIn = gl.getAttribLocation(prog, 'coord')
    const indexIn = gl.getAttribLocation(prog, 'index')
    const sizeIn  = gl.getAttribLocation(prog, 'size')
    renderData.in = { coordIn, indexIn, sizeIn }

    renderData.currentO = createVao(gl, renderData)
    renderData.selectedO = createVao(gl, renderData)
    renderData.selectedI = null

    gl.bindBuffer(gl.ARRAY_BUFFER, renderData.selectedO.dataB)
    gl.bufferData(gl.ARRAY_BUFFER, markerByteC, gl.DYNAMIC_DRAW)

    const markersBIndex = gl.getUniformBlockIndex(prog, "MarkersData")
    const ubo = gl.createBuffer()
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo)
    gl.bufferData(gl.UNIFORM_BUFFER, markersMeta[0] * 16, gl.STATIC_DRAW)
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 1, ubo)
    gl.uniformBlockBinding(prog, markersBIndex, 1)

    markersDataP.then(data => {
        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo)
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data.markersData)

        gl.bindBuffer(gl.ARRAY_BUFFER, renderData.currentO.dataB)
        gl.bufferData(gl.ARRAY_BUFFER, data.markers.byteLength, gl.DYNAMIC_DRAW)

        renderData.markersArray = new Uint8Array(data.markers)
        renderData.tempMarkersArray = new Uint8Array(data.markers.byteLength)
        renderData.buffersOk = true
        renderData.currentInvalid = true

        recalcCurrentMarkers(context)
        checkOk(context)
    })
}

const markerByteC = 16

function recalcCurrentMarkers(context) {
    const renderData = context?.markers
    if(!renderData) return
    if(!renderData.buffersOk || !renderData.indicesOk) return
    if(!renderData.currentInvalid) return
    const { gl } = context

    const selectedI = renderData.selectedI
    const indices = renderData.markersIndices
    const srcB = renderData.markersArray
    const resB = renderData.tempMarkersArray
    const regularC = srcB.length / markerByteC

    let resI = 0
    for(let i = 0; i < indices.length; i++) {
        const index = indices[i]
        if(index === selectedI || index >= regularC) continue
        for(let j = 0; j < markerByteC; j++) {
            resB[resI*markerByteC + j] = srcB[index*markerByteC + j]
        }
        resI++
    }

    const currentO = renderData.currentO
    gl.bindBuffer(gl.ARRAY_BUFFER, currentO.dataB)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, resB, 0, resI * markerByteC)
    currentO.count = resI

    const selectedO = renderData.selectedO
    if(selectedI != null && selectedI < regularC) {
        gl.bindBuffer(gl.ARRAY_BUFFER, selectedO.dataB)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, srcB, selectedI*markerByteC, markerByteC)
        selectedO.count = 1
    }
    else {
        selectedO.count = 0
    }

    renderData.currentInvalid = false
}

export function setFiltered(context, { markersIndices }) {
    const renderData = context?.markers
    if(!renderData) return console.error('renderData where?')

    renderData.markersIndices = markersIndices
    renderData.indicesOk = true
    renderData.currentInvalid = true

    recalcCurrentMarkers(context)
    checkOk(context)
}

export function render(context) {
    const rd = context.markers
    if(rd?.ok !== true) return
    const { gl, camera } = context

    const curSelectedI = context.currentObject?.first?.markerI
    if(curSelectedI != rd.selectedI) {
        rd.selectedI = curSelectedI
        rd.currentInvalid = true
    }

    recalcCurrentMarkers(context)
    if(rd.currentInvalid) return

    gl.useProgram(rd.prog)

    gl.uniform1f(rd.u.markerSize, Math.min(camera.scale, 200) * 0.03)

    const currentO = rd.currentO
    if(currentO.count !== 0) {
        gl.bindVertexArray(currentO.vao)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, currentO.count)
    }

    const selectedO = rd.selectedO
    if(selectedO.count !== 0) {
        gl.uniform1i(rd.u.drawType, 1)
        gl.bindVertexArray(selectedO.vao)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, selectedO.count)

        gl.uniform1i(rd.u.drawType, 2)
        gl.bindVertexArray(selectedO.vao)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, selectedO.count)

        gl.uniform1i(rd.u.drawType, 0)
    }
}
