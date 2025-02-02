const shortenName = /[.]([^.]+)$/

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
