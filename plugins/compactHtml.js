// @ts-check
/** @import { type PluginOption } from 'vite' */

const whitespace = /(^ +| *\n[ \n]*)/g

/**
@param {string} targetFileName
@return {PluginOption}
*/
export default function compactHtml(targetFileName) {
    return {
        name: 'my-compact-html',
        enforce: 'post',
        transformIndexHtml: {
            order: 'post',
            handler(html, ctx) {
                if(ctx.filename != targetFileName) return
                return html.replace(whitespace, '\n')
            }
        }
    }
}
