
export function parse(parsedSchema, objectsUint8Array) {
    var int_max = 2 ** 31 - 1
    var bytes4 = new ArrayBuffer(4)
    var bytes4view = new DataView(bytes4)

    const ti = parsedSchema.typeSchemaI
    var primIParsers = {
        [ti["GameManager+None"]]: () => { throw new Error("None is not parsable i=" + index) },
        [ti["System.Boolean"]]: parseBool,
        [ti["System.Int32"]]: parseCompressedInt,
        [ti["System.Single"]]: parseFloat,
        [ti["System.String"]]: parseString,
        [ti["GameManager+Reference"]]: parseCompressedInt,
        [ti["GameManager+Sprite"]]: parseCompressedInt,
        [ti["UnityEngine.Vector2"]]: parseVector2,
        [ti["GameManager+Any"]]: parseAny,
    }

    var resume_primIParsers = {
        [ti["GameManager+None"]]: () => { throw new Error("None is not parsable i=" + index) },
        [ti["System.Boolean"]]: resume_parseBool,
        [ti["System.Int32"]]: resume_parseCompressedInt,
        [ti["System.Single"]]: resume_parseFloat,
        [ti["System.String"]]: resume_parseString,
        [ti["GameManager+Reference"]]: resume_parseCompressedInt,
        [ti["GameManager+Sprite"]]: resume_parseCompressedInt,
        [ti["UnityEngine.Vector2"]]: resume_parseVector2,
        [ti["GameManager+Any"]]: resume_parseAny,
    }

    var index = 0
    var array = objectsUint8Array
    var schemas = parsedSchema.schema
    var terminals = parsedSchema.terminals
    var stringMap = []
    var counts = []
    for(let i = 0; i < parsedSchema.schema.length; i++) counts[i] = 0

    var has = true
    var saved

    let result = parseAny()
    while(result === null) {
        has = true
        const s = saved
        saved = undefined
        try {
        result = resume_parseAny(s)
        }
        catch(e) {
            console.log(s)
            throw e
        }
    }
    console.log('done!')

    return [result, counts]


    function peek() {
        if(index < array.length) return array[index]
        throw 'Reading past the end'
    }
    function pop() {
        var cur = peek()
        index++
        has = false
        return cur
    }
    function skip() {
        index++
        has = false
    }

    // regular functions
    function parseBool() {
        if(!has) {
            return null
        }
        return pop() !== 0
    }

    function parseCompressedInt() {
        var res = 0
        var i = 0
        do {
            if(!has) {
                saved = [res, i]
                return null
            }
            var cur = pop()
            res = res + ((cur << (i*7)) | 0) | 0
            i++
        } while(cur & 0b1000_0000)
        if(res < 0) {
            res = int_max - res | 0
        }
        return res
    }

    function parseFloat() {
        if(!has) {
            saved = null
            return null
        }
        if(peek() === 0b1111_1111) {
            skip()
            return 0
        }
        for(var i = 3; i > -1; i--) {
            if(!has) {
                saved = i
                return null
            }
            bytes4view.setUint8(i, pop())
        }
        return bytes4view.getFloat32(0, true)
    }

    function parseVector2() {
        if(!has) {
            saved = [0]
            return null
        }
        if(peek() === 0b0111_1111) {
            skip()
            return [0, 0]
        }
        const x = parseFloat()
        if(x === null) {
            saved = [1, saved]
            return null
        }
        const y = parseFloat()
        if(y === null) {
            saved = [2, x, saved]
            return null
        }
        return [x, y]
    }

    function parseString() {
        if(!has) {
            saved = [0]
            return null
        }
        if(peek() !== 0) {
            const index = parseCompressedInt()
            if(index === null) {
                saved = [1, true, saved]
                return null
            }
            return stringMap[index - 1]
        }
        else {
            skip()
            var res = ''

            if(!has) {
                saved = [1, false]
                return null
            }
            if(peek() == 0b1000_0000) return res

            do {
                if(!has) {
                    saved = [2, false, res]
                    return null
                }
                var cur = pop()
                res += String.fromCharCode(cur & 0b0111_1111)
            } while((cur & 0b1000_0000) == 0)
            stringMap.push(res)

            return res
        }
    }

    function parseAny() {
        var schemaI = parseCompressedInt()
        if(schemaI === null) {
            saved = [0, saved]
            return null
        }
        const res = parseBySchema(schemaI)
        if(res === null) {
            saved = [1, schemaI, saved]
            return null
        }
        return res
    }

    function parseBySchema(schemaI) {
        const schema = schemas[schemaI]
        const type = schema.type
        if(type === 0) {
            return primIParsers[schemaI]()
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
        counts[schemaI]++

        const term = terminals[schemaI]
        if(term !== null) return term

        const schema = schemas[schemaI]

        const names = schema.members
        const types = schema.membersT

        const res = {}
        for(var i = 0; i < names.length; i++) {
            const f = parseBySchema(types[i])
            if(f === null) {
                saved = [0, res, i, saved]
                return null
            }
            res[names[i]] = f
        }
        if(schema.base != null) {
            const f = parseBySchema(schema.base)
            if(f === null) {
                saved = [1, res, saved]
                return null
            }
            res._base = f
        }
        res._schema = schemaI

        return res
    }

    function parseArray(schemaI) {
        const schema = schemas[schemaI]
        const len = parseCompressedInt()
        if(len === null) {
            saved = [0, saved]
            return null
        }

        const res = Array(len)
        for(var i = 0; i < len; i++) {
            const f = parseBySchema(schema.elementT)
            if(f === null) {
                saved = [1, res, i, saved]
                return null
            }
            res[i] = f
        }
        res._schema = schemaI

        return res
    }

    // resume functions
    function resume_parseBool(resumed) {
        if(!has) {
            return null
        }
        return pop() !== 0
    }

    function resume_parseCompressedInt(resumed) {
        var res = resumed[0]
        var i = resumed[1]
        do {
            if(!has) {
                saved = [res, i]
                return null
            }
            var cur = pop()
            res = res + ((cur << (i*7)) | 0) | 0
            i++
        } while(cur & 0b1000_0000)
        if(res < 0) {
            res = int_max - res | 0
        }
        return res
    }

    function resume_parseFloat(resumed) {
        if(resumed === null) {
            if(!has) {
                saved = null
                return null
            }
            if(peek() === 0b1111_1111) {
                skip()
                return 0
            }
        }
        for(var i = resumed; i > -1; i--) {
            if(!has) {
                saved = i
                return null
            }
            bytes4view.setUint8(i, pop())
        }
        return bytes4view.getFloat32(0, true)
    }

    function resume_parseVector2(resumed) {
        if(resumed[0] <= 0) {
            if(!has) {
                saved = [0]
                return null
            }
            if(peek() === 0b0111_1111) {
                skip()
                return [0, 0]
            }
        }

        var x
        if(resumed[0] < 1) {
            x = parseFloat()
        }
        else if(resumed[0] == 1) {
            x = resume_parseFloat(resumed[1])
        }
        else {
            x = resumed[1]
        }
        if(x === null) {
            saved = [1, saved]
            return null
        }

        var y
        if(resumed[0] < 2) {
            y = parseFloat()
        }
        else if(resumed[0] <= 2) {
            y = resume_parseFloat(resumed[2])
        }
        if(y === null) {
            saved = [2, x, saved]
            return null
        }

        return [x, y]
    }


    function resume_parseString(resumed) {
        var reused
        if(resumed[0] === 0) {
            if(!has) {
                saved = [0]
                return null
            }
            reused = peek() !== 0
        }
        else {
            reused = resumed[1]
        }

        if(reused) {
            var index
            if(resumed[0] < 1) {
                index = parseCompressedInt()
            }
            else {
                index = resume_parseCompressedInt(resumed[2])
            }
            if(index === null) {
                saved = [1, true, saved]
                return null
            }
            return stringMap[index - 1]
        }
        else {
            if(resumed[0] === 0) {
                skip()
            }

            var res
            if(resumed[0] <= 1) {
                res = ''
                if(!has) {
                    saved = [1, false]
                    return null
                }
                if(peek() == 0b1000_0000) return res
            }
            else {
                res = resumed[2]
            }

            do {
                if(!has) {
                    saved = [2, false, res]
                    return null
                }
                var cur = pop()
                res += String.fromCharCode(cur & 0b0111_1111)
            } while((cur & 0b1000_0000) == 0)
            stringMap.push(res)

            return res
        }
    }

    function resume_parseAny(resumed) {
        console.log(resumed)
        var schemaI
        if(resumed[0] <= 0) {
            schemaI = resume_parseCompressedInt(resumed[1])
            if(schemaI === null) {
                saved = [0, saved]
                return null
            }
        }
        else {
            schemaI = resumed[1]
        }

        var res
        if(resumed[0] === 1) {
            res = resume_parseBySchema(schemaI, resumed[2])
        }
        else {
            res = parseBySchema(schemaI)
        }
        if(res === null) {
            saved = [1, schemaI, saved]
            return null
        }
        return res
    }

    function resume_parseBySchema(schemaI, resumed) {
        const schema = schemas[schemaI]
        const type = schema.type
        if(type === 0) {
            return resume_primIParsers[schemaI](resumed)
        }
        else if(type === 1) {
            return resume_parseRecord(schemaI, resumed)
        }
        else if(type === 2) {
            return resume_parseArray(schemaI, resumed)
        }
        else throw new Error("No type " + type + " i=" + index)
    }

    function resume_parseRecord(schemaI, resumed) {
        const schema = schemas[schemaI]

        const names = schema.members
        const types = schema.membersT

        const res = resumed[1]
        if(resumed[0] <= 0) {
            var i = resumed[2]
            {
                const f = resume_parseBySchema(types[i], resumed[3])
                if(f === null) {
                    saved = [0, res, i, saved]
                    return null
                }
                res[names[i]] = f
                i++
            }

            for(; i < names.length; i++) {
                const f = parseBySchema(types[i])
                if(f === null) {
                    saved = [0, res, i, saved]
                    return null
                }
                res[names[i]] = f
            }
        }

        if(resumed[0] === 1) {
            const f = resume_parseBySchema(schema.base, resumed[2])
            if(f === null) {
                saved = [1, res, saved]
                return null
            }
            res._base = f
        }
        else if(schema.base != null) {
            const f = parseBySchema(schema.base)
            if(f === null) {
                saved = [1, res, saved]
                return null
            }
            res._base = f
        }
        res._schema = schemaI

        return res
    }

    function resume_parseArray(schemaI, resumed) {
        const schema = schemas[schemaI]

        var res
        if(resumed[0] <= 0) {
            const len = resume_parseCompressedInt(resumed[1])
            if(len === null) {
                saved = [0, saved]
                return null
            }
            res = Array(len)
        }
        else {
            res = resumed[1]
        }

        var i
        if(resumed[0] === 1) {
            i = resumed[2]
            const f = resume_parseBySchema(schema.elementT, resumed[3])
            if(f === null) {
                saved = [1, res, i, saved]
                return null
            }
            res[i] = f
            i++
        }
        else {
            i = 0
        }

        if(resumed[0] <= 1) {
            const len = res.length
            for(; i < len; i++) {
                const f = parseBySchema(schema.elementT)
                if(f === null) {
                    saved = [1, res, i, saved]
                    return null
                }
                res[i] = f
            }
            res._schema = schemaI
        }

        return res
    }
}
