const moduleP = import('./module.jsx')
var module

const initialSetupData = { context: {}, currentObject: {} }
var beforeSetupData = { ...initialSetupData }

export function filtersUpdated() {
    if(beforeSetupData) {}
    else { module.filtersUpdated() }
}

export function setup(context) {
    if(beforeSetupData) {
        beforeSetupData.context = context
    }
    else {
        module.setup(context)
    }
}

export function setCurrentObject(obj) {
    if(beforeSetupData) {
        beforeSetupData.currentObject = obj
    }
    else {
        module.setCurrentObject(obj)
    }
}

moduleP.then(_module => {
    module = _module
    if(beforeSetupData.context !== initialSetupData.context) {
        module.setup(beforeSetupData.context)
    }
    if(beforeSetupData.currentObject !== initialSetupData.currentObject) {
        module.setCurrentObject(beforeSetupData.currentObject)
    }
    beforeSetupData = null
})
moduleP.catch(err => {
    console.error(err)
    setMsg('<span style="color: red">Loading error</span>')
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

setMsg('Loading...')
