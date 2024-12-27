export {}

declare global {
    const __worker: boolean

    const __worker_objects: boolean
    const __worker_markers: boolean
    const __worker_colliders: boolean

    const __setup_markers: boolean
    const __setup_colliders: boolean
    const __setup_circular: boolean

    const __render_markers: boolean
    const __render_colliders: boolean
    const __render_circular: boolean

    const __backgrounds: boolean
    const __backgrounds_mipmap_levels: boolean

    const __markers_mipmap_levels: boolean

    type MapToStr<T> = { [k in keyof T]: string }

    export const $t: MapToStr<typeof import('./strings.ts')['default']>
}
