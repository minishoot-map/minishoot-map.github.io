const moduleP = import('./module.jsx')
var menu

const initialSetupData = { context: {}, currentObject: {} }
var beforeSetupData = { ...initialSetupData }

export function filtersUpdated() {
    if(beforeSetupData) {}
    else { menu.filtersUpdated() }
}

export function setup(context) {
    if(beforeSetupData) {
        beforeSetupData.context = context
    }
    else {
        menu.setup(context)
    }
}

export function setCurrentObject(obj) {
    if(beforeSetupData) {
        beforeSetupData.currentObject = obj
    }
    else {
        menu.setCurrentObject(obj)
    }
}

moduleP.then(_module => {
    menu = _module
    if(beforeSetupData.context !== initialSetupData.context) {
        menu.setup(beforeSetupData.context)
    }
    if(beforeSetupData.currentObject !== initialSetupData.currentObject) {
        menu.setCurrentObject(beforeSetupData.currentObject)
    }
    beforeSetupData = null
})
moduleP.catch(err => {
    console.error(err)
    setMsg('<span style="color: red">' + $t.loading_error + '</span>')
})

function setMsg(msg) {
    try {
        const root1 = document.querySelector('.object-menu')
        root1.innerHTML = msg

        const root2 = document.querySelector('.filter-menu')
        root2.innerHTML = msg
    }
    catch(err) { console.warn(err) }
}

setMsg($t.loading)
