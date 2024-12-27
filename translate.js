// @ts-check
/** @import { type PluginOption } from 'vite' */
import fsp from 'node:fs/promises'
import path from 'node:path'

// very hacky

/**
@return {PluginOption}
*/
export default function translate(strings) {
    const htmlRegex = /\$t\.([\w\d]+)/g
    const jsName = '$t'

    let root

    const buildInput = { main: '/index.html', ru: '/ru.html' }

    /** @type {PluginOption} */
    const html = {
        name: 'my-translation-plugin-html',
        config() {
            return {
                build: { rollupOptions: { input: buildInput } },
            }
        },
        configResolved(c) {
            root = c.root
        },
        configureServer(ser) {
            ser.middlewares.use(async(q, s, n) => {
                if(q.url?.startsWith('/ru') && !q.url.includes('html-proxy')) {
                    const cont = await fsp.readFile(path.join(root, 'index.html'))
                    const str = cont.toString('utf8')
                    const res = await ser.transformIndexHtml('/ru.html', str)
                    s.end(res)
                }
                else {
                    n()
                }
            })
        },
        async load(fp) {
            if(fp === path.join(root, 'ru.html')) {
                const cont = await fsp.readFile(path.join(root, 'index.html'))
                return cont.toString('utf8')
            }
        },
        transformIndexHtml: {
            order: 'pre',
            handler: (html, ctx) => {
                const variant = ctx.path == '/ru.html' ? 1 : 0

                return html.replaceAll(htmlRegex, (full, name) => {
                    const arr = strings[name]
                    if(arr == null) {
                        console.warn('[my translation plugin] no string for', full)
                        return full
                    }
                    else {
                        return arr[variant]
                    }
                })
            },
        },
    }

    /** @type {PluginOption} */
    const js = {
        name: 'my-translation-plugin-js',
        config() {
            return {
                build: {
                    rollupOptions: {
                        output: {
                            manualChunks: {
                                t1: ['/$$$page-en.js'],
                                t2: ['/$$$page-ru.js'],
                            }
                        }
                    }
                }
            }
        },
        transformIndexHtml: {
            order: 'pre',
            handler: (html, ctx) => {
                const variant = ctx.path == '/ru.html'
                return [{
                    attrs: {
                        src: variant ? '/$$$page-ru.js' : '/$$$page-en.js',
                        type: 'module',
                    },
                    tag: 'script',
                    injectTo: 'head-prepend',
                }]
            }
        },
        resolveId(id) {
            if(id === '/$$$page-ru.js') {
                return '\0/$$$page-ru.js'
            }
            else if(id === '/$$$page-en.js') {
                return '\0/$$$page-en.js'
            }
        },
        load(id) {
            if(id === '\0/$$$page-en.js') {
                const res = {}
                for(const k in strings) {
                    res[k] = strings[k][0]
                }
                return `window.${jsName} = ${JSON.stringify(res)}`
            }
            else if(id === '\0/$$$page-ru.js') {
                const res = {}
                for(const k in strings) {
                    res[k] = strings[k][1]
                }
                return `window.${jsName} = ${JSON.stringify(res)}`
            }
        }
    }

    return [html, js]
}
