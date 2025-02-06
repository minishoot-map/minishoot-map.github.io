import meta from '$/meta.json'
import * as load from './load.js'

export { meta }
export const parsedSchema = load.parseSchema(meta.schemas)

// class itself is also in the list!
const schemaSuperClasses = Array(meta.schemas.length)
for(let i = 0; i < schemaSuperClasses.length; i++) {
    schemaSuperClasses[i] = Array(meta.schemas.length).fill(undefined)
}

for(let i = 0; i < meta.schemas.length; i++) {
    let classI = i
    let baseC = 0
    while(classI != null) {
        schemaSuperClasses[classI][i] = baseC
        classI = meta.schemas[classI][2]?.base
        baseC++
    }
}

export function getAsBase(it, hierarchy) {
    var baseC = hierarchy[it._schema]
    if(baseC == null) return
    for(; baseC > 0; baseC--) it = it._base
    return it
}

export function getHierarchy(schemaI) {
    return schemaSuperClasses[schemaI]
}

/** @returns {number | undefined} */
export function stepsToBase(schemaI, baseSchemaI) {
    return schemaSuperClasses[baseSchemaI][schemaI]
}

export function gotoBase(it, steps) {
    for(; steps > 0; steps--) it = it._base
    return it
}
