export async function parse(parsedSchema, objectsUint8Array) {
    var int_max = 2 ** 31 - 1
    var bytes4 = new ArrayBuffer(4)
    var bytes4view = new DataView(bytes4)

    const ti = parsedSchema.typeSchemaI
    const schema = parsedSchema.schema

    var parserType = Array(schema.length)
    parserType[ti["GameManager+None"]] = 8
    parserType[ti["System.Boolean"]] = 0
    parserType[ti["System.Int32"]] = 1
    parserType[ti["System.Single"]] = 2
    parserType[ti["System.String"]] = 3
    parserType[ti["GameManager+Reference"]] = 1
    parserType[ti["GameManager+Sprite"]] = 1
    parserType[ti["UnityEngine.Vector2"]] = 4
    parserType[ti["GameManager+Any"]] = 5

    for(let i = 0; i < schema.length; i++) {
        const s = schema[i]
        if(parserType[i] != null) continue

        if(s.type === 1) parserType[i] = 6
        else if(s.type == 2) parserType[i] = 7
    }

    var index = 0
    var array = objectsUint8Array
    var schemas = parsedSchema.schema
    var terminals = parsedSchema.terminals
    var stringMap = []
    var counts = []
    for(let i = 0; i < parsedSchema.schema.length; i++) counts[i] = 0

    var has = true

    const stack = [{ t: 5, $: 0 }]
    const results = []

    try {
        while(stack.length > 0) {
            const e = stack[stack.length - 1]
            const t = e.t
            if(t === 0) {
                if(!has) await suspend()
                results.push(pop() !== 0)
                stack.length--
                continue
            }
            else if(t === 1) {
                let res = 0
                let i = 0
                while(true) {
                    if(!has) await suspend()
                    const cur = pop()
                    res = res + ((cur << (i*7)) | 0) | 0
                    i++
                    if((cur & 0b1000_0000) === 0) break
                }
                if(res < 0) {
                    res = int_max - res | 0
                }

                results.push(res)
                stack.length--
                continue
            }
            else if(t === 2) {
                if(!has) await suspend()
                if(peek() === 0b1111_1111) {
                    skip()
                    results.push(0)
                    stack.length--
                    continue
                }

                for(let i = 3; i > -1; i--) {
                    if(!has) await suspend()
                    bytes4view.setUint8(i, pop())
                }

                results.push(bytes4view.getFloat32(0, true))
                stack.length--
                continue

            }
            else if(t === 3) {
                if(e.$ <= 0) {
                    e.$++
                    if(!has) await suspend()
                    e.reused = peek() !== 0
                }

                if(e.reused) {
                    if(e.$ <= 1) {
                        e.$++
                        stack.push({ t: 1 })
                        continue
                    }

                    const index = results.pop()

                    results.push(stringMap[index - 1])
                    stack.length--
                    continue
                }
                else {
                    if(e.$ <= 1) {
                        e.$++
                        skip()
                    }

                    if(e.$ <= 2) {
                        e.$++
                        const res = ''

                        if(!has) await suspend()
                        if(peek() == 0b1000_0000) {
                            results.push(res)
                            stack.length--
                            continue
                        }
                        e.res = res
                    }

                    let res = e.res

                    while(true) {
                        if(!has) await suspend()
                        const cur = pop()
                        res += String.fromCharCode(cur & 0b0111_1111)
                        if((cur & 0b1000_0000) !== 0) break
                    }
                    stringMap.push(res)

                    results.push(res)
                    stack.length--
                    continue
                }
            }
            else if(t === 4) {
                if(e.$ <= 0) {
                    e.$++
                    if(!has) await suspend()
                    if(peek() === 0b0111_1111) {
                        skip()
                        results.push([0, 0])
                        stack.length--
                        continue
                    }
                }

                if(e.$ <= 1) {
                    e.$++
                    stack.push({ t: 2 })
                    continue
                }
                if(e.$ <= 2) {
                    e.$++
                    e.x = results.pop()
                }

                if(e.$ <= 3) {
                    e.$++
                    stack.push({ t: 2 })
                    continue
                }
                if(e.$ <= 4) {
                    e.$++
                    e.y = results.pop()
                }

                results.push([e.x, e.y])
                stack.length--
                continue
            }
            else if(t === 5) {
                if(e.$ <= 0) {
                    e.$++
                    stack.push({ t: 1 })
                    continue
                }
                if(e.$ <= 1) {
                    e.schemaI = results.pop()
                    e.$++
                }

                const schemaI = e.schemaI

                if(e.$ <= 2) {
                    e.$++
                    pushBySchema(schemaI)
                    continue
                }

                // results.push(results.pop())
                stack.length--
                continue
            }
            else if(t === 6) {
                const schemaI = e.schemaI

                if(e.$ <= 0) {
                    counts[schemaI]++

                    const term = terminals[schemaI]
                    if(term !== null) {
                        results.push(term)
                        stack.length--
                        continue
                    }
                    e.$++
                }

                const schema = schemas[schemaI]

                if(e.$ <= 1) {
                    e.$++
                    e.tic = true
                    e.i = 0
                    e.res = {}
                }

                const res = e.res

                if(e.$ <= 2) {
                    const types = schema.membersT

                    if(e.i < types.length) {
                        pushBySchema(types[e.i])
                        e.i++
                        continue
                    }

                    e.$++
                }

                if(e.$ <= 3) {
                    e.$++
                    const names = schema.members
                    for(let i = 0; i < names.length; i++) {
                        res[names[i]] = results[results.length - names.length + i]
                    }
                    results.length -= names.length
                }

                if(e.$ <= 4) {
                    e.$++
                    if(schema.base != null) {
                        pushBySchema(schema.base)
                        continue
                    }
                }

                if(e.$ <= 5) {
                    e.$++
                    if(schema.base != null) {
                        res._base = results.pop()
                    }
                }

                res._schema = schemaI

                results.push(res)
                stack.length--
                continue
            }
            else if(t === 7) {
                const schemaI = e.schemaI
                const schema = schemas[schemaI]

                if(e.$ <= 0) {
                    e.$++
                    stack.push({ t: 1 })
                    continue
                }
                if(e.$ <= 1) {
                    e.$++
                    const len = results.pop()
                    e.res = Array(len)
                }

                const res = e.res
                if(e.$ <= 2) {
                    e.$++
                    e.i = 0
                }
                if(e.$ <= 3) {
                    if(e.i < res.length) {
                        pushBySchema(schema.elementT)
                        e.i++
                        continue
                    }
                    e.$++
                }
                if(e.$ <= 4) {
                    for(let i = 0; i < res.length; i++) {
                        res[i] = results[results.length - res.length + i]
                    }
                    results.length -= res.length
                    e.$++
                }

                res._schema = schemaI

                results.push(res)
                stack.length--
                continue
            }
            else if(t === 8) {
                throw new Error("None is not parsable i=" + index)
            }
            else {
                throw new Error("Unknown type=" + t)
            }
        }
    }
    catch(e) {
        console.error(stack, results)
        throw e
    }

    console.log(results)
    return [results.pop(), counts]


    function peek() {
        if(index < array.length) return array[index]
        throw new Error('Reading past the end')
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

    async function suspend() {

    }

    function pushBySchema(schemaI) {
        const type = parserType[schemaI]
        if(type <= 8) {
            stack.push({ t: type, $: 0, schemaI })
            return
        }
        else {
           throw new Error("No type " + type + " for schema " + schemaI + " i=" + index)
        }
    }
}
