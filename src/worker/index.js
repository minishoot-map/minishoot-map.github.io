// @ts-check
import objectUrl from '$/objects.bp'
import polygonsUrl from '$/polygons.bp'

globalThis.objectsP = __worker_objects ? fetch(objectUrl) : (console.warn('skipping objects'), new Promise(()=>{}))
globalThis.polygonsP = __worker_colliders && __worker_objects ? fetch(polygonsUrl) : (console.warn('skipping colliders'), new Promise(()=>{}))

var worker
import('./module.js').then(_module => {
    worker = _module
    tryProcess()
})

var clientReady

/** @typedef {[message: unknown, transfer?: Transferable[]]} Message */
/** @type {Array<Message>} */
var outQueue = []
/** @param {Message} args */
globalThis.message = (...args) => {
    if(clientReady) postMessage(...args)
    else outQueue.push(args)
}

const inQueue = []

onmessage = (e) => {
    const d = e.data
    console.log('received from client', d.type)
    if(d.type !== 'ready') {
        return (inQueue.push(d), tryProcess())
    }
    else {
        clientReady = true
        outQueue.forEach(args => {
            try { postMessage(...args) }
            catch(e) { console.warn(e) }
        })
        outQueue.length = 0
    }
}

function tryProcess() {
    if(!worker) return
    inQueue.forEach(it => worker.onmessage(it))
    inQueue.length = 0
}
