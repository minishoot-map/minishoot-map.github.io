var primIParsers, index, array, schemas, terminals
var stringMap

const int_max = 2 ** 31 - 1
function parseCompressedInt() {
    var res = 0
    var i = 0
    do {
        var cur = pop()
        res = res + ((cur << (i*7)) | 0) | 0
        i++
    } while(cur & 0b1000_0000)
    if(res < 0) {
        res = int_max - res | 0
    }
    return res
}

const bytes4 = new ArrayBuffer(4)
const bytes4view = new DataView(bytes4)
function parseFloat() {
    if(peek() === 0b1111_1111) {
        skip()
        return 0
    }
    for(var i = 3; i > -1; i--) bytes4view.setUint8(i, pop())
    return bytes4view.getFloat32(0, true)
}
function parseVector2() {
    if(peek() === 0b0111_1111) {
        skip()
        return [0, 0]
    }
    const x = parseFloat()
    const y = parseFloat()
    return [x, y]
}

function parseString() {
    if(peek() !== 0) {
        const index = parseCompressedInt() - 1
        return stringMap[index]
    }
    else {
        skip()
        var res = ''
        if(peek() == 0b1000_0000) return res
        do {
            var cur = pop()
            res += String.fromCharCode(cur & 0b0111_1111)
        } while((cur & 0b1000_0000) == 0)
        stringMap.push(res)
        return res
    }
}

function parseAny() {
    var schemaI = parseCompressedInt()
    return parseBySchema(schemaI)
}

const primParsers = {
    ["GameManager+None"]: () => { throw new Error("None is not parsable i=" + index) },
    ["System.Boolean"]: () => pop() != 0,
    ["System.Int32"]: parseCompressedInt,
    ["System.Single"]: parseFloat,
    ["System.String"]: parseString,
    ["GameManager+Reference"]: parseCompressedInt,
    ["GameManager+Sprite"]: parseCompressedInt,
    ["UnityEngine.Vector2"]: parseVector2,
    ["GameManager+Any"]: parseAny,
}

function parsePrimitive(schemaI) {
    return primIParsers[schemaI]()
}

function parseBySchema(schemaI) {
    const schema = schemas[schemaI]
    const type = schema.type
    if(type === 0) {
        return parsePrimitive(schemaI)
    }
    else if(type === 1) {
        return parseRecord(schemaI)
    }
    else if(type === 2) {
        return parseArray(schemaI)
    }
    else throw new Error("No type " + type + " i=" + index)
}

function parseRecord(schemaI) {
    const term = terminals[schemaI]
    if(term !== null) return term

    const schema = schemas[schemaI]

    const names = schema.members
    const types = schema.membersT

    const res = {}
    for(var i = 0; i < names.length; i++) {
        res[names[i]] = parseBySchema(types[i])
    }
    if(schema.base != null) {
        res._base = parseBySchema(schema.base)
    }
    res._schema = schemaI

    return res
}

function parseArray(schemaI) {
    const schema = schemas[schemaI]
    const len = parseCompressedInt()
    const res = Array(len)
    for(var i = 0; i < len; i++) {
        res[i] = parseBySchema(schema.elementT)
    }
    res._schema = schemaI
    return res
}

const shortenName = /[.]([^.]+)$/

function peek() {
    if(index < array.length) return array[index]
    throw 'Reading past the end'
}
function pop() {
    var cur = peek()
    index++
    return cur
}
function skip() {
    index++
}

export function parseSchema(schema) {
    const typeSchemaI = {}

    const terminals = []
    for(let i = 0; i < schema.length; i++) terminals.push(null)
    let maybeTerminalsI = []

    for(var i = 0; i < schema.length; i++) {
        const s = schema[i]
        s.type = s[0]
        s.name = s[1]
        s.shortName = s.name
        for(let key in s[2]) s[key] = s[2][key]
        if(s.type === 1) {
            s.members ??= []
            s.membersT ??= []
        }

        const match = shortenName.exec(s.name)
        if(match) {
            const shortName = match[1]
            if(!typeSchemaI.hasOwnProperty(shortName)) {
                typeSchemaI[shortName] = i
                s.shortName = shortName
            }
        }
        typeSchemaI[s.name] = i

        if(s.type === 1 && s.members.length == 0) {
            if(s.base == null) {
                terminals[i] = {
                    _schema: i,
                }
            }
            else if(terminals[s.base]) {
                terminals[i] = {
                    _schema: i,
                    _base: terminals[s.base],
                }
            }
            else {
                maybeTerminalsI.push(i)
            }
        }
    }

    while(true) {
        const remMaybeTerminalsI = []

        let added = false
        for(let i = 0; i < maybeTerminalsI.length; i++) {
            const schemaI = maybeTerminalsI[i]
            const s = schema[schemaI]
            if(terminals[s.base] !== null) {
                terminals[schemaI] = {
                    _schema: schemaI,
                    _base: terminals[s.base],
                }
                added = true
            }
            else {
                remMaybeTerminalsI.push(schemaI)
            }
        }
        if(!added) break

        maybeTerminalsI = remMaybeTerminalsI
    }

    return { schema, typeSchemaI, terminals }
}

export function parse(parsedSchema, objectsUint8Array) {
    index = 0
    array = objectsUint8Array
    primIParsers = Array(10)
    schemas = parsedSchema.schema
    terminals = parsedSchema.terminals
    stringMap = []

    for(const key in primParsers) {
        primIParsers[parsedSchema.typeSchemaI[key]] = primParsers[key]
    }

    return parseAny()
}
