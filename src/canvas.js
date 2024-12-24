
function shouldResize(c) {
    const pw = Math.floor(c.resizeData.prevCanvasSize[0])
    const ph = Math.floor(c.resizeData.prevCanvasSize[1])

    const cw = Math.floor(c.canvasSize[0])
    const ch = Math.floor(c.canvasSize[1])

    if(cw !== pw || ch !== ph) {
        return [cw, ch]
    }
}

export function resize(context) {
    const resizeInfo = shouldResize(context)

    context.resizeData.prevCanvasSize[0] = context.canvasSize[0]
    context.resizeData.prevCanvasSize[1] = context.canvasSize[1]
    if(resizeInfo) {
        if(resizeInfo[0] >= 1 && resizeInfo[1] >= 1) {
            context.canvas.width = resizeInfo[0]
            context.canvas.height = resizeInfo[1]
            context.gl.viewport(0, 0, resizeInfo[0], resizeInfo[1])
            return true
        }
    }
    else if(context.canvasSize[0] >= 1 && context.canvasSize[1] >= 1) return true
}

var minScale = 0.1, maxScale = 10000
function clampedScale(scale, old) {
    if(scale != scale) {
        return [false, old]
    }
    if(scale <= maxScale) {
        if(scale >= minScale) return [true, scale]
        else return [false, minScale]
    }
    else return [false, maxScale]
}
function clampScale(scale, old) {
    return clampedScale(scale, old)[1]
}

// 0 to height => 1 to -1
// 0 to width => -smth to smth
function xScreenToCamera(it, bounds) {
    return (it - (bounds.left + bounds.width * 0.5)) * 2 / bounds.height
}
function yScreenToCamera(it, bounds) {
    return ((bounds.top + bounds.height * 0.5) - it) * 2 / bounds.height
}

function xCameraToWorld(it, camera) {
    return it * camera.scale + camera.posX
}
function yCameraToWorld(it, camera) {
    return it * camera.scale + camera.posY
}

export function setup(context) {
    const resizeData = {
        prevCanvasSize: [ -1, -1 ],
    }
    context.resizeData = resizeData

    const canvas = context.canvas
    const camera = context.camera

    // https://webgl2fundamentals.org/webgl/lessons/webgl-fundamentals.html
    function onResize(entries) {
        const entry = entries[0]
        if(entry == null) return

        const dpr = window.devicePixelRatio

        var widthCssPx, heightCssPx
        if(entry.contentBoxSize) {
            if(entry.contentBoxSize[0]) {
                widthCssPx = entry.contentBoxSize[0].inlineSize
                heightCssPx = entry.contentBoxSize[0].blockSize
            }
            else {
                widthCssPx = entry.contentBoxSize.inlineSize
                heightCssPx = entry.contentBoxSize.blockSize
            }
        }
        else {
            widthCssPx = entry.contentRect.width
            heightCssPx = entry.contentRect.height
        }

        var widthNew, heightNew
        if(entry.devicePixelContentBoxSize) {
            widthNew = entry.devicePixelContentBoxSize[0].inlineSize
            heightNew = entry.devicePixelContentBoxSize[0].blockSize
        }
        else {
            widthNew = widthCssPx * dpr
            heightNew = heightCssPx * dpr
        }
        context.canvasSize[0] = widthNew
        context.canvasSize[1] = heightNew

        if(heightCssPx != context.sizes.heightCssPx) {
            context.sizes.heightCssPx = heightCssPx
            context.requestRender(1)
        }
        if(shouldResize(context)) {
            context.requestRender(0)
        }
    }
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(canvas, {box: 'content-box'});

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault()

        const bounds = canvas.getBoundingClientRect()
        const posX = xScreenToCamera(e.clientX, bounds)
        const posY = yScreenToCamera(e.clientY, bounds)

        const zoomFactor = 0.004
        var delta = 1 + Math.abs(e.deltaY) * zoomFactor
        if(e.deltaY < 0) delta = 1 / delta
        const newScale = clampScale(camera.scale * delta, camera.scale)

        const scale = camera.scale

        camera.scale = newScale
        camera.posX += posX * (scale - newScale)
        camera.posY += posY * (scale - newScale)

        context.requestRender(1)
    });

    var panning = { is: false, prevX: undefined, prevY: undefined }
    var touches = { order: [/*id*/], touches: {/*id: { prevX, prevY }*/} }

    canvas.addEventListener('click', (e) => {
        const bounds = canvas.getBoundingClientRect()
        const x = xCameraToWorld(xScreenToCamera(e.clientX, bounds), camera)
        const y = yCameraToWorld(yScreenToCamera(e.clientY, bounds), camera)

        context.onClick(x, y)
    })

    canvas.addEventListener('mousedown', (e) => {
        const bounds = canvas.getBoundingClientRect()
        panning.is = true
        panning.prevX = xScreenToCamera(e.clientX, bounds)
        panning.prevY = yScreenToCamera(e.clientY, bounds)
    });

    window.addEventListener('mouseup', (e) => {
        canvas.style.pointerEvents = ''
        panning.is = false
    })

    window.addEventListener('mousemove', (e) => {
        if(!panning.is) return
        // https://stackoverflow.com/a/59957886
        canvas.style.pointerEvents = 'none'
        const bounds = canvas.getBoundingClientRect()

        const curX = xScreenToCamera(e.clientX, bounds)
        const curY = yScreenToCamera(e.clientY, bounds)

        camera.posX -= (curX - panning.prevX) * camera.scale
        camera.posY -= (curY - panning.prevY) * camera.scale

        panning.prevX = curX
        panning.prevY = curY

        context.requestRender(1)
    });

    canvas.addEventListener('touchstart', function (e) {
        const bounds = canvas.getBoundingClientRect()

        for(var i = 0; i < e.changedTouches.length; i++) {
            var t = e.changedTouches[i]
            if(touches.touches[t.identifier]) continue;
            touches.order.push(t.identifier)
            touches.touches[t.identifier] = {
                prevX: xScreenToCamera(t.clientX, bounds),
                prevY: yScreenToCamera(t.clientY, bounds),
            }
        }
    });

    canvas.addEventListener('touchmove', function (e) {
        const firstId = touches.order[0]
        const secondId = touches.order[1]

        let t1, t2
        for(let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i]
            if(t.identifier == firstId) {
                t1 = t
            }
            else if(t.identifier == secondId) {
                t2 = t
            }
        }

        const bounds = canvas.getBoundingClientRect()

        ;(() => {
            if(t1 == undefined) return

            const touch1 = touches.touches[firstId]
            if(t2 == undefined) { // pan
                const curX = xScreenToCamera(t1.clientX, bounds)
                const curY = yScreenToCamera(t1.clientY, bounds)

                camera.posX -= (curX - touch1.prevX) * camera.scale
                camera.posY -= (curY - touch1.prevY) * camera.scale

                context.requestRender(1)
            }
            else {
                const touch2 = touches.touches[secondId]

                const curX1 = xScreenToCamera(t1.clientX, bounds)
                const curY1 = yScreenToCamera(t1.clientY, bounds)
                const curX2 = xScreenToCamera(t2.clientX, bounds)
                const curY2 = yScreenToCamera(t2.clientY, bounds)

                const preX1 = touch1.prevX
                const preY1 = touch1.prevY
                const preX2 = touch2.prevX
                const preY2 = touch2.prevY

                const scale = camera.scale

                const dx = curX1 - curX2
                const dy = curY1 - curY2
                const pdx = preX1 - preX2
                const pdy = preY1 - preY2
                const delta = Math.sqrt((pdx * pdx + pdy * pdy) / (dx * dx + dy * dy))
                const newScale = clampScale(scale * delta, scale)

                camera.scale = newScale
                camera.posX += scale * 0.5 * (preX1 + preX2)
                    - newScale * 0.5 * (curX1 + curX2)
                camera.posY += scale * 0.5 * (preY1 + preY2)
                    - newScale * 0.5 * (curY1 + curY2)

                context.requestRender(1)
            }
        })()

        for(let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i]
            const touch = touches.touches[t.identifier]
            touch.prevX = xScreenToCamera(t.clientX, bounds)
            touch.prevY = yScreenToCamera(t.clientY, bounds)
        }

        e.preventDefault()
    });

    canvas.addEventListener('touchend', function (e) {
        for(let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i]
            for(let j = 0; j < touches.order.length; j++) {
                if(touches.order[j] === t.identifier) {
                    delete touches.touches[t.identifier]
                    touches.order.splice(j, 1)
                    break;
                }
            }
        }
    })
}
