import * as path from 'node:path'
var id = 0

/**
 * @param {Object} input
 * @param {string} [input.name] - The name of the worker in the start error message.
 * @param {string} input.htmlPath - Absolute path to the file in which to include the WebWorker.
 * @param {string} input.workerPath - Absolute path to the WebWorker file.
 * @param {Object} [input.workerParams={type: "module"}] - Serializable object that is passed to the WebWorker constructor.
 * @param {string} input.assignTo - Where to assign the WebWorker (e.g. 'window.worker').
 * @param {string} [input.inlineOnBuild=true] - Whether to inline the script that creates the WebWorker into html's head.
 */
export default function inlineWorker(input) {
    const thisId = id++

    if(!input) {
        console.error('ERROR [Inline Worker Plugin]: no input. id=' + id)
        return
    }

    const workerParams = input.workerParams ?? { type: 'module' }
    const inlineOnBuild = input.inlineOnBuild ?? true
    const htmlPath = path.resolve(input.htmlPath)

    const workerPath = JSON.stringify('' + input.workerPath)
    const params = JSON.stringify(workerParams)
    const name = input.name != null ? JSON.stringify('`' + input.name + '`') : '' + thisId

    const importCodeChunkName = 'virtual:inline_worker@chunk' + thisId
    const importCodeSrcId = 'virtual:inline_worker@include_worker' + thisId + '.js'
    const importCodeVirtId = '\0inline_worker@include_worker' + thisId + '.js'
    const importCode = `
${input.assignTo} = (() => {
    const worker = new Worker(new URL(${workerPath}, import.meta.url), ${params})
    worker.onerror = () => { console.error('Worker ' + ${name} + ' error') }
    return worker
})()`

    var shouldInline = inlineOnBuild

    const buildPlugin = {
        name: 'vite:inline_worker' + thisId,
        enforce: 'post', // so that it sees the include_worker file added by Vite
        config: (_, env) => {
            const isBuild = env.command === 'build'
            shouldInline &&= isBuild
            if(!shouldInline) return
            return {
                build: {
                    rollupOptions: {
                        output: {
                            manualChunks: { [importCodeChunkName]: [importCodeSrcId] }
                        }
                    }
                }
            }
        },
        buildStart(opts) {
            if(!shouldInline) return
            opts.input.push(importCodeSrcId) // is this allowed?
        },
        resolveId: (id) => {
            if(!shouldInline) return
            if(id === importCodeSrcId) return importCodeVirtId
        },
        load: (id) => {
            if(!shouldInline) return
            if(id === importCodeVirtId) {
                return { code: importCode, moduleSideEffects: true }
            }
        },
        transformIndexHtml: { // add a script to replace its `children` later
            order: 'post',
            handler: (_, ctx) => {
                if(!shouldInline) return
                if(path.resolve(ctx.filename) === htmlPath) {
                    return [{ tag: 'script', children: importCodeVirtId }]
                }
            },
        },
        // Note: worker's asset `originalFileName` is null, we can't grab it from there
        generateBundle: (_options, bundle, _isWrite) => {
            if(!shouldInline) return

            var htmlAsset, bundleToDelete, codeToEmbed
            for(const name in bundle) {
                const b = bundle[name]

                if(b.originalFileName != null && htmlPath === path.resolve(b.originalFileName)) {
                    htmlAsset = b
                    continue
                }
                if(b.type !== 'chunk') continue

                const ids = b.moduleIds
                for(let i = 0; i < ids.length; i++) {
                    const id = ids[i]
                    if(id !== importCodeVirtId) continue
                    // dubious, no? the file would've been in /assets/
                    // The URL path is absolute anyway...
                    codeToEmbed = b.code.replace(
                        /new URL\((.+?),import\.meta\.url\)/,
                        '$1'
                    ).trim()
                    bundleToDelete = name
                    break
                }
            }

            if(bundleToDelete == null) {
                console.error(
                    'ERROR [Inline Worker Plugin]: could not find '
                        + 'generated bundle. id=' + id
                )
                return
            }
            delete bundle[bundleToDelete]

            if(htmlAsset == null) {
                console.error(
                    'ERROR [Inline Worker Plugin]: could not find html file `'
                        + htmlPath + '`. id =' + id
                )
                return
            }
            htmlAsset.source = htmlAsset.source.replace(importCodeVirtId, codeToEmbed)
        },
    }

    const servePlugin = {
        name: 'vite:inline_worker@serve' + thisId,
        transformIndexHtml: {
            order: 'pre',
            handler: (_, ctx) => {
                if(shouldInline) return
                if(path.resolve(ctx.filename) === htmlPath) {
                    // include as regular script when not building.
                    // Not 1 to 1 since now it is a module
                    return [{
                        tag: 'script',
                        attrs: { type: 'module' },
                        children: importCode,
                    }]
                }
            },
        },
    }

    return [buildPlugin, servePlugin]
}
