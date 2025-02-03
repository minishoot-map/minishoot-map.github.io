export async function parse(parsedSchema, objectsUint8Array) {
    var int_max = 2 ** 31 - 1
    var bytes4 = new ArrayBuffer(4)
    var bytes4view = new DataView(bytes4)

    const ti = parsedSchema.typeSchemaI

    var primIParsers = {
        [ti["GameManager+None"]]: () => { throw new Error("None is not parsable i=" + index) },
        [ti["System.Boolean"]]: () => pop() != 0,
        [ti["System.Int32"]]: parseCompressedInt,
        [ti["System.Single"]]: parseFloat,
        [ti["System.String"]]: parseString,
        [ti["GameManager+Reference"]]: parseCompressedInt,
        [ti["GameManager+Sprite"]]: parseCompressedInt,
        [ti["UnityEngine.Vector2"]]: parseVector2,
        [ti["GameManager+Any"]]: parseAny,
    }

    var index = 0
    var array = objectsUint8Array
    var schemas = parsedSchema.schema
    var terminals = parsedSchema.terminals
    var stringMap = []
    var counts = []
    for(let i = 0; i < parsedSchema.schema.length; i++) counts[i] = 0

    return [await parseAny(), counts]

    async function parseCompressedInt() {
        var res = 0
        var i = 0
        do {
            var cur = await pop()
            res = res + ((cur << (i*7)) | 0) | 0
            i++
        } while(cur & 0b1000_0000)
        if(res < 0) {
            res = int_max - res | 0
        }
        return res
    }

    async function parseFloat() {
        if(await peek() === 0b1111_1111) {
            await skip()
            return 0
        }
        for(var i = 3; i > -1; i--) bytes4view.setUint8(i, await pop())
        return bytes4view.getFloat32(0, true)
    }
    async function parseVector2() {
        if(await peek() === 0b0111_1111) {
            await skip()
            return [0, 0]
        }
        const x = await parseFloat()
        const y = await parseFloat()
        return [x, y]
    }

    async function parseString() {
        if(await peek() !== 0) {
            const index = (await parseCompressedInt()) - 1
            return stringMap[index]
        }
        else {
            await skip()
            var res = ''
            if(await peek() == 0b1000_0000) return res
            do {
                var cur = await pop()
                res += String.fromCharCode(cur & 0b0111_1111)
            } while((cur & 0b1000_0000) == 0)
            stringMap.push(res)
            return res
        }
    }

    async function parseAny() {
        var schemaI = await parseCompressedInt()
        return parseBySchema(schemaI)
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

    async function parseRecord(schemaI) {
        counts[schemaI]++

        const term = terminals[schemaI]
        if(term !== null) return term

        const schema = schemas[schemaI]

        const names = schema.members
        const types = schema.membersT

        const res = {}
        for(var i = 0; i < names.length; i++) {
            res[names[i]] = await parseBySchema(types[i])
        }
        if(schema.base != null) {
            res._base = await parseBySchema(schema.base)
        }
        res._schema = schemaI

        return res
    }

    async function parseArray(schemaI) {
        const schema = schemas[schemaI]
        const len = await parseCompressedInt()
        const res = Array(len)
        for(var i = 0; i < len; i++) {
            res[i] = await parseBySchema(schema.elementT)
        }
        res._schema = schemaI
        return res
    }

    async function peek() {
        if(index < array.length) return array[index]
        throw 'Reading past the end'
    }
    async function pop() {
        var cur = peek()
        index++
        return cur
    }
    async function skip() {
        index++
    }
}
