import { loadShader, checkProg } from './render_util.js'
import colliderColorsS from './colliderColors.js'

const vsSource = `#version 300 es
precision highp float;

layout(std140) uniform Camera {
    vec2 add;
    vec2 multiply;
    float markerRadius;
} cam;

in vec3 transform1;
in vec3 transform2;
in float width;

const vec2 coords[4] = vec2[4](
    vec2(-0.5, -0.5),
    vec2(0.5, -0.5),
    vec2(-0.5, 0.5),
    vec2(0.5, 0.5)
);

flat out float collWidth;
out vec2 collCoord;

void main(void) {
    vec2 coord = coords[gl_VertexID];
    coord = vec2(
        dot(coord, transform1.xy) + transform1.z,
        dot(coord, transform2.xy) + transform2.z
    );

    vec2 pos = coord * cam.multiply + cam.add;
    gl_Position = vec4(pos, 1.0, 1.0);

    collWidth = width;
    collCoord = coords[gl_VertexID] * vec2(2.0 * width, 2.0);
}
`

const fsSource = `#version 300 es
precision mediump float;

uniform int layer;

flat in float collWidth;
in vec2 collCoord;

out vec4 color;

${colliderColorsS}

void main(void) {
    vec4 col = layerColors[layer];

    float maxOff = collWidth - 1.0;
    if(collCoord.x < -maxOff) {
        vec2 off = vec2(-maxOff - collCoord.x, collCoord.y);
        float dist2 = dot(off, off);
        if(dist2 > 1.0) col = vec4(0, 0, 0, 0);
    }
    else if(collCoord.x > maxOff) {
        vec2 off = vec2(collCoord.x - maxOff, collCoord.y);
        float dist2 = dot(off, off);
        if(dist2 > 1.0) col = vec4(0, 0, 0, 0);
    }

    color = col;
}
`

function checkOk(context) {
    const m = context?.circular
    if(m && m.buffersOk && m.filtersOk) {
        m.ok = true
        context.requestRender(1)
    }
}

export function setup(gl, context, collidersDataP) {
    const renderData = {}
    context.circular = renderData

    if(!__setup_circular) return

    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource, 'circular colliders v')
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource, 'circular colliders f')

    const prog = gl.createProgram()
    gl.attachShader(prog, vertexShader)
    gl.attachShader(prog, fragmentShader)
    gl.linkProgram(prog)

    if(!checkProg(gl, prog)) return

    gl.useProgram(prog)

    gl.uniformBlockBinding(prog, gl.getUniformBlockIndex(prog, "Camera"), 0)

    const layer = gl.getUniformLocation(prog, 'layer')
    renderData.u = { layer }
    renderData.prog = prog

    const dataB = gl.createBuffer()
    renderData.dataB = dataB

    const vao = gl.createVertexArray()
    renderData.vao = vao
    gl.bindVertexArray(vao)

    gl.bindBuffer(gl.ARRAY_BUFFER, dataB)
    const t1In = gl.getAttribLocation(renderData.prog, 'transform1')
    gl.enableVertexAttribArray(t1In)
    gl.vertexAttribDivisor(t1In, 1)

    const t2In = gl.getAttribLocation(renderData.prog, 'transform2')
    gl.enableVertexAttribArray(t2In)
    gl.vertexAttribDivisor(t2In, 1)

    const widthIn = gl.getAttribLocation(renderData.prog, 'width')
    gl.enableVertexAttribArray(widthIn)
    gl.vertexAttribDivisor(widthIn, 1)

    renderData.inputs = { t1In, t2In, widthIn }

    collidersDataP.then(collidersData => {
        gl.bindBuffer(gl.ARRAY_BUFFER, dataB)
        gl.bufferData(gl.ARRAY_BUFFER, collidersData.circularData, gl.STATIC_DRAW)

        renderData.drawData = Array(32).fill(null)
        const pd = collidersData.circularDrawData
        for(let i = 0; i < pd.length; i++) {
            renderData.drawData[pd[i].layer] = pd[i]
        }

        renderData.buffersOk = true
        checkOk(context)
    })
}

export function setFiltered(context, layers) {
    const renderData = context?.circular
    if(!renderData) return console.error('renderData where?')

    renderData.layers = layers
    renderData.filtersOk = true
    checkOk(context)
}

export function render(context) {
    const rd = context.circular
    if(rd?.ok !== true) return
    const { gl } = context

    gl.useProgram(rd.prog)
    gl.bindVertexArray(rd.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, rd.dataB)
    for(let i = 0; i < rd.layers.length; i++) {
        const layerI = rd.layers[i]
        const it = rd.drawData[layerI]
        if(!it) continue

        gl.uniform1i(rd.u.layer, it.layer)

        // webgl2 does not suck
        // https://stackoverflow.com/questions/69510570/drawing-specific-instances-in-gl-drawarraysinstanced
        const offset = it.startIndexI * 28
        const { t1In, t2In, widthIn } = rd.inputs
        gl.vertexAttribPointer(t1In  , 3, gl.FLOAT, false, 28, offset + 0)
        gl.vertexAttribPointer(t2In  , 3, gl.FLOAT, false, 28, offset + 12)
        gl.vertexAttribPointer(widthIn, 1, gl.FLOAT, false, 28, offset + 24)

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, it.length)
    }
}
