// @ts-check
import * as R from 'react'
import reactDom from 'react-dom/client'
import * as Z from 'zustand'
import { meta, parsedSchema } from '/schema.js'
import haveTransitions from '../haveTransitions'

const useCurrentObject = Z.create((set) => ({
    data: {},
    tick: 0,
    update(newData) {
        set((cur) => ({ data: newData, tick: cur.tick + 1 }))
    },
}))

var context
var renderData = { currentObject: null }

const filtersRev = Z.create(() => 0)
export function filtersUpdated() {
    filtersRev.setState((s) => s + 1)
}

export function setup(_context) {
    context = _context
    context.sideMenu = renderData

    const root1 = reactDom.createRoot(document.querySelector('.object-menu'))
    root1.render(<R.StrictMode><ObjectMenu/></R.StrictMode>)

    const root2 = reactDom.createRoot(document.querySelector('.filter-menu-rest'))
    root2.render(<R.StrictMode><FilterMenu/></R.StrictMode>)
}

export function setCurrentObject(obj) {
    useCurrentObject.getState().update(obj)
}

function Filter({ filter }) {
    const [name, displayName, enabled, type, param, collapse] = filter
    var inner, t = 'inline'
    if(type === 'filters' || type === 'group') {
        t = 'newline'
        const filtersA = []
        for(let i = 0; i < param.length; i++) {
            filtersA.push(<Filter key={i} filter={param[i]}/>)
        }
        inner = <div>{filtersA}</div>
    }
    else if(type === 'number') {
        const changed = (e) => {
            filter[4] = parseFloat(e.target.value)
            context.filtersUpdated()
        }
        inner = <input type='number' style={{width: '3rem'}} onChange={changed} value={param}/>
    }
    else if(type === 'name') {
        const changed = (e) => {
            filter[4] = e.target.value
            context.filtersUpdated()
        }
        inner = <input type='text' style={{width: '5rem'}} onChange={changed} value={param}/>
    }
    else if(type === 'boolean') {
        t = 'newline'
        const changed = (v) => (e) => {
            param[v] = e.target.checked
            context.filtersUpdated()
        }
        inner = <div className='filter-list'>
            <label>
                <input type='checkbox' checked={param[0]} onChange={changed(0)}/>
                {$t.no}
            </label>
            <label>
                <input type='checkbox' checked={param[1]} onChange={changed(1)}/>
                {$t.yes}
            </label>
        </div>
    }
    else if(type === 'enum') {
        t = 'newline'
        const innerA = Array(param.length)
        for(let i = 0; i < param.length; i++) {
            const p = param[i]
            const changed = (e) => {
                p[2] = e.target.checked
                context.filtersUpdated()
            }
            innerA[i] = <label key={i}>
                <input type='checkbox' checked={p[2]}
                    onChange={changed}/>{p[1]}
            </label>
        }
        inner = <div className='filter-list'>{innerA}</div>
    }

    const filterChanged = (e) => {
        filter[2] = e.target.checked
        context.filtersUpdated()
    }

    if(collapse) {
        return <div key={name} className={'filter ' + t}>
            <label><input type='checkbox' checked={enabled}
                onChange={filterChanged}/>{displayName}</label>
            <details className="filter-collapse">
                <summary>{$t.more}</summary>
                {inner}
            </details>
        </div>
    }

    return <div key={name} className={'filter ' + t}>
        <label><input type='checkbox' checked={enabled}
            onChange={filterChanged}/>{displayName}</label>
        {inner}
    </div>
}

function Presets() {
    const fp = context.filterPresets
    const s = fp.selected
    if(s === 'custom') {
        return <div key={s} className="presets">
            <Filter key={0} filter={fp.cur[s][0]}/>
            <Filter key={1} filter={fp.cur[s][1]}/>
        </div>
    }
    else if(haveTransitions.includes(s)) {
        function onchange(e) {
            fp.cur[s].transitions = e.target.checked
            context.filtersUpdated()
        }
        return <div key={s} className="presets">
            <div className='filter'>
                <label><input type='checkbox' checked={fp.cur[s].transitions}
                    onChange={onchange}/>{$t.transitions_all}</label>
            </div>
        </div>
    }
    else if(s === 'raceSpirits' || s === 'redCoins') {
        return <div key={s} className="presets"></div>
    }
}

function FilterMenu() {
    filtersRev()
    const fs = context.flags
    return <>
        <Presets/>
        <Filter key='colliders' filter={fs.cur.colliders}/>
        <Filter key='background' filter={fs.cur.background}/>
    </>
}

function ObjectMenu() {
    const obj = useCurrentObject()
    if(obj.data?.loading) {
        return <div key={obj.tick}>{$t.loading_object_info}</div>
    }
    else if(obj.data?.scene != null) {
        return <div key={obj.tick}>
            <Scene scene={obj.data.scene}/>
        </div>
    }
    else if(obj.data?.first != null) {
        return <div key={obj.tick}>
            <Object first={obj.data?.first}/>
            <div className="space"></div>
            <Other nearby={obj.data?.nearby} nearbyReferenceInfos={obj.data?.nearbyReferenceInfos}/>
        </div>
    }
    else if(obj.data?.error) {
        return <div key={obj.tick}>{$t.object_error}</div>
    }
    else {
        return <div>{$t.no_selected}</div>
    }
}

function vec2s(v) {
    return v[0] + ', ' + v[1]
}

function Scene({ scene }) {
    const children = Array(scene.children.length)
    for(let i = 0; i < scene.children.length; i++) {
        const ci = scene.children[i]
        children[i] = <Link key={i} index={ci} obj={scene}/>
    }

    return <>
        <Props>
            <Prop>{$t.name + ':'}{scene.name}</Prop>
        </Props>
        <div className="space"></div>
        <details className="component" open={true}>
            <summary>{$t.children}</summary>
            <Props>{children}</Props>
        </details>
    </>
}

function Object({ first }) {
    const [status, setStatus] = R.useState(null)

    const components = []
    for(let i = 0; i < first.components.length; i++) {
        components[i] = <Component key={i} comp={first.components[i]} obj={first} />
    }

    function focus() {
        context.camera.posX = first.pos[0]
        context.camera.posY = first.pos[1]
        context.requestRender(1)
    }

    function copyUrl() {
        try {
            const url = new URL(window.location.href)
            url.searchParams.set('posx', first.pos[0])
            url.searchParams.set('posy', first.pos[1])
            url.searchParams.set('obji', first.index)
            navigator.clipboard.writeText(url.toString())
            setStatus(true)
        }
        catch(err) {
            console.error(err)
            setStatus(false)
        }
    }

    let color
    if(status === true) color = '#48e51060'
    else if(status === false) color = '#b40e0660'

    return <>
        <div className='object-buttons'>
            <span>
                <button onClick={focus}>{$t.focus}</button>
                <span className="overlay"/>
            </span>
            <span>
                <button onClick={copyUrl}>{$t.copyurl}</button>
                <span style={{ background: color }} className="overlay"/>
            </span>
        </div>
        <div className="space"></div>
        <Props>
            <Prop>{$t.name + ':'}{first.name}</Prop>
            <Prop>{$t.position + ':'}{vec2s(first.pos)}</Prop>
        </Props>
        <div className="space"></div>
        <div className="components">
            <Parents obj={first}/>
            <Children obj={first}/>
            <ReferencedBy obj={first}/>
        </div>
        <div className="space"></div>
        <div className="prop-name">{$t.components + ':'}</div>
        <div className="components">{components}</div>
    </>
}

const ti = parsedSchema.typeSchemaI

function parentLink(obj, parentI, i) {
    if(parentI < 0) {
        return <span key={i}>[<Link index={parentI} obj={obj}/>]</span>
    }
    else {
        return <span key={i}><Link index={parentI} obj={obj}/></span>
    }
}

function Parents({ obj }) {
    const parentEls = []
    let uselessKey = 0
    for(let i = obj.parentChain.length - 1; i != 0; i--) {
        parentEls.push(parentLink(obj, obj.parentChain[i], uselessKey++))
        parentEls.push(<span key={uselessKey++}>{' ➤ '}</span>)
    }
    if(obj.parentChain.length > 0) {
        parentEls.push(parentLink(obj, obj.parentChain[0], uselessKey++))
    }

    return <Props>
        <Prop>{$t.parents + ':'}{parentEls}</Prop>
    </Props>
}

function Children({ obj }) {
    const children = Array(obj.children.length)
    for(let i = 0; i < obj.children.length; i++) {
        const ci = obj.children[i]
        children[i] = <Link key={i} index={ci} obj={obj}/>
    }

    return <details className="component">
        <summary>{$t.children}</summary>
        <Props>{children}</Props>
    </details>
}

function ReferencedBy({ obj }) {
    const arr = []
    for(let i = 0; i < obj.referencedBy.length; i++) {
        const ri = obj.referencedBy[i]
        arr.push(<Link key={i} index={ri} obj={obj}/>)
    }
    const empty = arr.length == 0

    return <details className="component" open={empty}>
        <summary className={empty ? 'empty-component' : null}>{$t.referenced}</summary>
        <Props>{arr}</Props>
    </details>
}

function componentInfoToComponent(childC) {
    return <details className="component" open={!childC.empty}>
        <summary className={childC.empty ? 'empty-component' : null}>{childC.name}</summary>
        {childC.component}
    </details>
}

function componentInfo(comp, obj) {
    const cname = meta.schemas[comp._schema].shortName

    const decl = componentDecl.get(comp._schema)
    if(decl) {
        return { empty: false, name: cname, component: decl(comp, obj) }
    }

    const s = meta.schemas[comp._schema]
    if(s && s.type === 1 && s.membersT.length > 0) {
        return { empty: isFallbackEmpty(comp), name: cname, component: <FallbackComponent comp={comp} obj={obj}/> }
    }

    var inner = null
    var isEmpty = true
    var base = comp._base
    if(shouldDisplay(base)) {
        const baseInfo = componentInfo(base, obj)
        inner = componentInfoToComponent(baseInfo)
        isEmpty = baseInfo.empty
    }

    const res = <Props>{inner}</Props>
    return { empty: isEmpty, name: cname, component: res }
}

function shouldDisplay(comp) {
    return comp != null;
}

function Component({ comp, obj }) {
    if(!shouldDisplay(comp)) return
    return componentInfoToComponent(componentInfo(comp, obj))
}

const componentDecl = new Map()
function ac(schema, componentC) {
    componentDecl.set(schema, componentC)
}

function isFallbackEmpty(comp) {
    const s = meta.schemas[comp._schema]
    if(s && s.type === 1 && s.membersT.length > 0) {
        let usefulCount = 0

        for(let i = 0; i < s.membersT.length; i++) {
            const type = s.membersT[i]

            if(type === ti.Boolean) {
                usefulCount++
            }
            else if(type === ti.Int32 || type === ti.Single || type === ti.String) {
                usefulCount++
            }
            else if(type === ti['GameManager+Reference']) {
                usefulCount++
            }
            else if(type === ti['GameManager+Reference[]']) {
                if(comp[s.members[i]].length > 0) usefulCount++
            }
            else if(type === ti.Vector2) {
                usefulCount++
            }
        }

        return usefulCount === 0
    }

    return true
}

function FallbackComponent({ comp, obj }) {
    const s = meta.schemas[comp._schema]

    const properties = []
    for(let i = 0; i < s.membersT.length; i++) {
        const type = s.membersT[i]
        const name = s.members[i]
        const v = comp[name]

        if(type === ti.Boolean) {
            properties.push(<Prop>{name + ':'}{bs(v)}</Prop>)
        }
        else if(type === ti.Int32 || type === ti.Single || type === ti.String) {
            properties.push(<Prop>{name + ':'}{v}</Prop>)
        }
        else if(type === ti['GameManager+Reference']) {
            properties.push(<Prop>{name + ':'}<Link index={v} obj={obj}/></Prop>)
        }
        else if(type === ti['GameManager+Reference[]']) {
            const refs = Array(v.length)
            for(let j = 0; j < v.length; j++) {
                refs[j] = <Link key={j} index={v[j]} obj={obj}/>
            }
            properties.push(<Prop>{name + ':'}<Props>{refs}</Props></Prop>)
        }
        else if(type === ti.Vector2) {
            properties.push(<Prop>{name + ':'}{vec2s(v)}</Prop>)
        }
        else if(type === ti['GameManager+Sprite']) {
            continue;
        }
        else {
            properties.push(<Prop>{name + ':'}{Unknown}</Prop>)
        }
    }

    return <Props>
        {...properties}
        <Component comp={comp._base} obj={obj}/>
    </Props>
}

ac(ti.Transform, (c, o) => {
    return <Props>
        <Prop>{$t.localpos + ':'}{vec2s(c.position)}</Prop>
        <Prop>{$t.localscale + ':'}{vec2s(c.scale)}</Prop>
        <Prop>{$t.localrot + ':'}{c.rotation}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

function bs(v) { return v ? $t.yes : $t.no }

ac(ti.CrystalDestroyable, (c, o) => {
    const v = meta.xpForCrystalSize[c.size] ?? Unknown
    return <Props>
        <Prop>{$t.dropsxp + ':'}{bs(c.dropXp) + (c.dropXp ? ` (${v}xp)` : '')}</Prop>
        <Prop>{$t.size + ':'}{c.size}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

ac(ti.Destroyable, (c, o) => {
    return <Props>
        <Prop>Hp:{c.hp}</Prop>
        <Prop>{$t.inv + ':'}{bs(c.invincible)}</Prop>
        <Prop>Flat damage:{bs(c.flatDamage)}</Prop>
        <Prop>{$t.permanent + ':'}{bs(c.permanent)}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

ac(ti.Collider2D, (c, o) => {
    return <Props>
        <Prop>Is trigger:{bs(c.isTrigger)}</Prop>
        <Prop>{$t.offset + ':'}{vec2s(c.offset)}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

ac(ti.BoxCollider2D, (c, o) => {
    return <Props>
        <Prop>{$t.size + ':'}{vec2s(c.size)}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

ac(ti.CapsuleCollider2D, (c, o) => {
    return <Props>
        <Prop>{$t.size + ':'}{vec2s(c.size)}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

ac(ti.CircleCollider2D, (c, o) => {
    return <Props>
        <Prop>{$t.radius + ':'}{c.radius}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

function Link({ index, obj }) {
    const referenceInfo = obj.referenceInfos[index]

    if(referenceInfo != null) {
        const displayName = referenceInfo[0] || <i>{'<No name>'}</i>
        const url = new URL(window.location.href)
        if(referenceInfo[1] != null && referenceInfo[2] != null) {
            url.searchParams.set('posx', referenceInfo[1])
            url.searchParams.set('posy', referenceInfo[2])
        }
        else {
            url.searchParams.delete('posx')
            url.searchParams.delete('posy')
        }
        url.searchParams.set('obji', index)

        function onClick(ev) {
            context.viewObject(index)
            ev.preventDefault()
        }
        return <a href={url} onClick={onClick}>{displayName}</a>
    }
    else {
        return <span><i>{'<None>'}</i></span>
    }
}

ac(ti.ScarabPickup, (c, o) => {
    return <Props>
        <Prop>
            Container:
            <Link index={c.container} obj={o}/>
        </Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

ac(ti.Transition, (c, o) => {
    return <Props>
        <Prop>{$t.dest + ':'}{<Link index={c.destI} obj={o}/>}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

const keyUses = ["None", "Normal", "Boss", "Scarab", "Darker", "FinalBoss"]

ac(ti.Unlocker, (c, o) => {
    const gc = Array(c.group.length)
    for(let i = 0; i < gc.length; i++) {
        const l = c.group[i]
        gc[i] = <Link key={i} index={l} obj={o}/>
    }

    return <Props>
        <Prop>KeyUse:{keyUses[c.keyUse] ?? Unknown}</Prop>
        <Prop>{$t.target + ':'}<Link index={c.target} obj={o}/></Prop>
        <Prop>Target bis (?):<Link index={c.targetBis} obj={o}/></Prop>
        <Prop>{$t.group + ':'}<Props>{gc}</Props></Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

ac(ti.UnlockerTorch, (c, o) => {
    const gc = Array(c.group.length)
    for(let i = 0; i < gc.length; i++) {
        const l = c.group[i]
        gc[i] = <Link key={i} index={l} obj={o}/>
    }

    return <Props>
        <Prop>{$t.target + ':'}<Link index={c.target} obj={o}/></Prop>
        <Prop>Target bis (?):<Link index={c.targetBis} obj={o}/></Prop>
        <Prop>Linked torch:<Link index={c.linkedTorch} obj={o}/></Prop>
        <Prop>{$t.group + ':'}<Props>{gc}</Props></Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

const objectiveNames = [
	"None", "Dungeon1", "Dungeon2", "Dungeon3", "Dungeon4", "Dungeon5", "Temple1", "Temple2", "Temple3", "Tower1", "Tower2",
	"Tower3", "Tower4", "FreeAcademician", "OpenSanctuary", "AwakeTree", "TurtleArrived", "FreeMercantHub", "FreeScarabCollector",
	"FreeBlacksmith", "FreeBard", "FreeFamilly1", "FreeFamilly3", "FreeExplorer", "FreeHealer", "SkillBoost", "SkillDash",
	"SkillSupershot", "SkillHover", "ShopGarden", "ShopForest", "ShopSwamp", "Scarab", "FreeFamilly2", "GotAllCrystalBossKey",
	"TrueLastBoss", "CaveGreenBeach", "CaveGreenGarden", "CaveGreenZelda", "CaveAcademyRuin", "CaveForest", "CaveForestJunkyard",
	"CaveAbyss", "CaveAbyssDesert", "CaveAbyssHouse1", "CaveAbyssHouse2", "CaveDesertNpc", "CaveSewer", "CaveBeachRace",
	"CaveSwampRace", "CaveSunkenToDungeon", "CaveSunkenRace", "CaveDarker", "CaveGreenHoleUnderJar", "CaveJunkyardEast",
	"CaveJunkyardWest", "Lighthouse", "CaveSunkenHouse", "CaveSwampParkour", "CaveDesertRace", "CaveAbyssRace", "CavePrimordial",
	"_CaveTuto", "Town",
]

ac(ti.UnlockerTrigger, (c, o) => {
    return <Props>
        <Prop>{$t.target + ':'}<Link index={c.target} obj={o}/></Prop>
        <Prop>Target bis (?):<Link index={c.targetBis} obj={o}/></Prop>
        <Prop>{$t.prereq + ':'}{objectiveNames[c.objectiveCleared]}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

const moduleNames = [
	'IdolBomb',
	'IdolSlow',
	'IdolAlly',
	'BoostCost',
	'XpGain',
	'HpDrop',
	'PrimordialCrystal',
	'HearthCrystal',
	'SpiritDash',
	'BlueBullet',
	'Overcharge',
	'CollectableScan',
	'Rage',
	'Retaliation',
	'FreePower',
	'Compass',
	'Teleport'
]

const skillNames = ['Supershot', 'Dash', 'Hover', 'Boost']

const statsNames = [
	'PowerAllyLevel',
    '<None>',
	'BoostSpeed',
	'BulletNumber',
	'BulletSpeed',
	'_EmptyStatsSlot',
	'PowerBombLevel',
	'CriticChance',
	'Energy',
	'FireRange',
	'FireRate',
	'Hp',
	'MoveSpeed',
	'Supershot',
	'BulletDamage',
	'PowerSlowLevel',
]

const Unknown = <i>{'<Unknown>'}</i>

ac(ti.ModulePickup, (c, o) => {
    return <Props>
        <Prop>{$t.name + ':'}{moduleNames[c.moduleId] ?? Unknown}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
});

ac(ti.SkillPickup, (c, o) => {
    return <Props>
        <Prop>{$t.name + ':'}{skillNames[c.skillId] ?? Unknown}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
});

ac(ti.StatsPickup, (c, o) => {
    return <Props>
        <Prop>{$t.name + ':'}{statsNames[c.statsId] ?? Unknown}</Prop>
        <Prop>{$t.level + ':'}{c.level}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
});

ac(ti.Buyable, (c, o) => {
    return <Props>
        <Prop>{$t.price + ':'}{c.price}</Prop>
        <Prop>{$t.forsale + ':'}{bs(c.isForSale)}</Prop>
        <Prop>{$t.i_title + ':'}{c.title}</Prop>
        <Prop>{$t.i_desc + ':'}{c.description}</Prop>
        <Prop>{$t.owner + ':'}<Link index={c.owner} obj={o}/></Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
});

ac(ti.KeyUnique, (c, o) => {
    return <Props>
        <Prop>{$t.name + ':'}{keyUses[c.keyId] ?? Unknown}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
});

const npcNames = [
	"Familly1",
	"Familly2",
	"Familly3",
	"Blacksmith",
	"Academician",
	"Explorer",
	"MercantHub",
	"UnchosenPurple",
	"UnchosenBlue",
	"UnchosenPurpleSnow",
	"MercantFrogger",
	"_Ermit",
	"PrimordialScarab",
	"Tiny",
	"Healer",
	"MercantBush",
	"MercantJar",
	"Turtle",
	"ScarabCollector",
	"Bard",
]

function getNpcs(c, o) {
    const npcs = o.npcIds.get(c.id) ?? []
    const other = []
    for(let i = 0; i < npcs.length; i++) {
        if(npcs[i] !== o.index) {
            other.push(<Link key={i} index={npcs[i]} obj={o}/>)
        }
    }
    return <Prop>{'In other places:'}<Props>{other}</Props></Prop>

}

ac(ti.Npc, (c, o) => {
    return <Props>
        <Prop>{$t.name + ':'}{npcNames[c.id]}</Prop>
        {getNpcs(c, o)}
        <Component comp={c._base} obj={o}/>
    </Props>
})

ac(ti.CrystalNpc, (c, o) => {
    return <Props>
        <Prop>{$t.name + ':'}{npcNames[c.id]}</Prop>
        {getNpcs(c, o)}
        <Component comp={c._base} obj={o}/>
    </Props>
})

ac(ti.Tunnel, (c, o) => {
    return <Props>
        <Prop>{$t.dest + ':'}<Link index={c.destination} obj={o}/></Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

const nbsp = '\u00A0'
const jarTypes = ["nothing", "hp", "random", "big crystal", "energy", "full energy", "big srystals (65)"]
function getExtra(e) {
    var extra
    if(e.dropType == 1) extra = e.size - 1
    if(e.dropType == 2) extra = "15% hp, 15% 1-9 xp, 15% 2-4 energy"
    if(e.dropType == 3) extra = (e.size - 1) * 2
    if(e.dropType == 4) extra = "3-5"
    return (extra !== undefined ? ' (' + extra + ')' : '') + ` [value${nbsp}${e.dropType}]`
}

ac(ti.Jar, (c, o) => {
    return <Props>
        <Prop>{$t.droptype + ':'}{jarTypes[c.dropType] + getExtra(c)}</Prop>
        <Prop>{$t.size + ':'}{c.size}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
})

const usePlayerLevel = Z.create((set) => ({
    value: 0,
    set: (newValue) => {
        set({ value: newValue })
    }
}))

function XpCalculator({ enemy }) {
    const playerLevel = usePlayerLevel()
    function onBound(el) {
        if(el) el.value = playerLevel.value
    }
    const input = <input style={{width: '3rem'}} type="number" ref={onBound}
        onChange={(ev) => playerLevel.set(parseInt(ev.target.value))}/>

    return <Prop>
        <>Xp for level {input}:</>
        {calcXp(enemy.size, enemyLevel(enemy), playerLevel.value)}
    </Prop>
}

ac(ti.Enemy, (c, o) => {
    return <Props>
        <Prop>{$t.size + ':'}{c.size}</Prop>
        <Prop>{$t.tier + ':'}{c.tier}</Prop>
        <XpCalculator enemy={c} />
        <Component comp={c._base} obj={o}/>
    </Props>
})
// Copied from the game (TODO: where?)
var levelDiffMax = 35
var num2arr = [0, -0.0005760992, -0.001099514, -0.001562121, -0.001955796, -0.002272415, -0.002503856, -0.002641993, -0.002678705, -0.002605866, -0.002415353, -0.002099043, -0.001648813, -0.001056537, -0.0003140926, 0.000586643, 0.001653795, 0.002895486, 0.004319842, 0.005934983, 0.007749034, 0.009770121, 0.01200636, 0.01446589, 0.01715682, 0.02008727, 0.02326539, 0.02669927, 0.03039706, 0.03436686, 0.03861683, 0.04315505, 0.04798967, 0.05312951, 0.05867211, 0.06471878, 0.07132179, 0.07853336, 0.08640583, 0.09499138, 0.1043423, 0.1145109, 0.1255495, 0.1375101, 0.1504453, 0.1644071, 0.1794479, 0.1956198, 0.2129754, 0.2315666, 0.2514459, 0.2726654, 0.2952775, 0.3193344, 0.3448884, 0.3719916, 0.4006965, 0.4310553, 0.4631202, 0.4969434, 0.5325773, 0.5700741, 0.6094862, 0.6508656, 0.6942647, 0.7397357, 0.7873312, 0.8371028, 0.8891034, 0.9433848, 1] // calculated
var baseXpGain = 1
var gainCoeffMax = 10
var minimumGain = 1
function Round(num) {
    let rounded = Math.round(num);
    if (Math.abs(num % 1) === 0.5) {
        rounded = (rounded % 2 === 0) ? rounded : rounded - 1;
    }
    return rounded;
}
function calcXp(size, level, playerL) {
    var num = level * 10 - playerL
    var num2 = num2arr[Math.min(Math.max(0, num + levelDiffMax), num2arr.length-1)]
    var b = Round(Math.fround(Math.fround(baseXpGain * num2) * gainCoeffMax))
    var num3 = size > 1 ? (size * 0.75) : 1
    return Round(Math.fround(Math.max(minimumGain, b) * num3))
}
function enemyLevel(e) {
    return 3 * (e.tier - 1) + e.size
}

/**
@param {object} arg1
@param {any=} arg1.children
*/
function Props({ children }) {
    return <div className="props">{children}</div>
}

/**
@param {object} arg1
@param {any=} arg1.children
*/
function Prop({ children }) {
    if(children.length != 2) {
        console.error('Number of children is incorrect:', children.length, children)
        return
    }
    return <div className="prop0">
        <div className="prop">
            <div className="prop-name">{children[0]}</div>
            <div>{children[1]}</div>
        </div>
    </div>
}


function Other({ nearby, nearbyReferenceInfos }) {
    if(nearby == null || nearbyReferenceInfos == null) return
    const nearbyObj = { referenceInfos: nearbyReferenceInfos }

    const nearbyC = []
    for(let i = 0; i < nearby.length; i++) {
        const it = nearby[i]
        nearbyC.push(
            <div key={i} className="hanging">
                <Link index={it.index} obj={nearbyObj}/>
                <span> [{$t.away}{nbsp}{it.distance.toFixed(2)}{$t.m}]</span>
            </div>
        )
    }

    return <div className="nearby">
        <div className="prop-name">{$t.objnear + ':'}</div>
        {nearbyC}
    </div>
}
