import * as R from 'react'
import reactDom from 'react-dom/client'
import * as Z from 'zustand'
import { meta, getAsSchema, parsedSchema } from '/schema.js'

const useCurrentObject = Z.create(() => {})

// TODO: transfer object id and use it as key so that values from previous objects do not affect it

var gotoOther = () => { console.log('state?') }

export function setup(_gotoOther) {
    gotoOther = _gotoOther
    const root = reactDom.createRoot(window['side-menu'])
    root.render(<R.StrictMode><SideMenu /></R.StrictMode>)
}

export function setCurrentObject(obj) {
    // console.log(JSON.parse(JSON.stringify(obj)))
    useCurrentObject.setState(obj)
}

function SideMenu() {
    const obj = useCurrentObject()
    return <>
        <Object first={obj?.first} />
    </>
}

function vec2s(v) {
    return v[0] + ', ' + v[1]
}

function Object({ first }) {
    if(first == null) {
        return <div>
            No object selected
        </div>
    }

    const components = []
    for(let i = 0; i < first.components.length; i++) {
        components[i] = <Component key={i} comp={first.components[i]} obj={first} />
    }

    return <>
        <Props>
            <Prop>Name:{first.name}</Prop>
            <Prop>Position:{vec2s(first.pos)}</Prop>
        </Props>
        <div className="space"></div>
        <Parent obj={first}/>
        <Children obj={first}/>
        <div className="space"></div>
        <div>Components:</div>
        <div>{components}</div>
    </>
}

const ti = parsedSchema.typeSchemaI

function Parent({ obj }) {
    return <Props>
        <Prop>
            Parent:
            {<Link index={obj.parent} name={obj.referenceNames[obj.parent]}/>}
        </Prop>
    </Props>
}

function Children({ obj }) {
    const children = Array(obj.children.length)
    for(let i = 0; i < obj.children.length; i++) {
        const ci = obj.children[i]
        children[i] = <Link key={i} index={ci} name={obj.referenceNames[ci]}/>
    }

    return <details className="component">
        <summary>Children</summary>
        <Props>{children}</Props>
    </details>
}

const componentDecl = [
    [ti.Transform, transformC],
    [ti.Enemy, enemyC],
    [ti.Jar, jarC],
    [ti.CrystalDestroyable, crDesC],
    [ti.ScarabPickup, scarabC],
    [ti.Transition, transitionC],
]

function componentInfoToComponent(thisEmpty, childC) {
    return <details className="component" open={thisEmpty}>
        <summary className={childC.empty && 'empty-component'}>{childC.name}</summary>
        {childC.component}
    </details>
}

function componentInfo(comp, obj) {
    const cname = meta.schemas[comp._schema].shortName

    for(let i = 0; i < componentDecl.length; i++) {
        const schemaI = componentDecl[i][0]
        if(comp._schema !== schemaI) continue

        return { empty: false, name: cname, component: componentDecl[i][1](comp, obj) }
    }

    return { empty: true, name: cname, component: fallbackC(comp, obj) }
}

function Component({ comp, obj, isEmpty }) {
    if(comp == null) return
    if(comp._schema === ti.Component) return
    if(comp._schema === ti.MonoBehaviour) return
    if(comp._schema === ti.MiniBehaviour) return
    return componentInfoToComponent(isEmpty, componentInfo(comp, obj))
}

function fallbackC(c, o) {
    return <Props>
        <Component isEmpty={true} comp={c._base} obj={o}/>
    </Props>
}

function transformC(c, o) {
    return <Props>
        <Prop>Local position:{vec2s(c.position)}</Prop>
        <Prop>Local scale:{vec2s(c.scale)}</Prop>
        <Prop>Local rotation:{c.rotation}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
}

function crDesC(c, o) {
    return <Props>
        <Prop>Drops XP:{c.dropXp ? 'yes' : 'no'}</Prop>
        <Prop>Size:{c.size}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
}


function Link({ index, name }) {
    const displayName = name != null ? name || '<No name>' : '<Unknown>'

    // index < 0 is scenes, we can't display info about them yet
    if(index != null && index >= 0) {
        function onClick() { gotoOther(index) }
        return <a href="javascript:void('sorry')" onClick={onClick}>{displayName}</a>
    }
    else {
        return <span>{displayName}</span>
    }
}

function scarabC(c, o) {
    return <Props>
        <Prop>
            Container:
            <Link index={c.container} name={o.referenceNames[c.container]}/>
        </Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
}

function transitionC(c, o) {
    return <Props>
        <Prop>Destination:{<Link index={c.destI} name={o.referenceNames[c.destI]}/>}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
}

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

function jarC(c, o) {
    return <Props>
        <Prop>Drop type:{jarTypes[c.dropType] + getExtra(c)}</Prop>
        <Prop>Size:{c.size}</Prop>
        <Component comp={c._base} obj={o}/>
    </Props>
}

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

function enemyC(c, o) {
    return <Props>
        <Prop>Size:{c.size}</Prop>
        <Prop>Tier:{c.tier}</Prop>
        <Prop>Hp:{c.hp}</Prop>
        <XpCalculator enemy={c} />
        <Component comp={c._base} obj={o}/>
    </Props>
}
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

function Props({ children }) {
    return <div className="props">{children}</div>
}

function Prop({ children }) {
    if(children.length != 2) {
        console.error('Number of children is incorrect:', children.length, children)
        return
    }
    return <div className="prop0">
        <div className="prop">
            <div>{children[0]}</div>
            <div>{children[1]}</div>
        </div>
    </div>
}