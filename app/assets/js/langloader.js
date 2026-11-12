const fs = require('fs-extra')
const path = require('path')
const toml = require('toml')
const merge = require('lodash.merge')

let lang

exports.loadLanguage = function(id){
    lang = merge(lang || {}, toml.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', `${id}.toml`))) || {})
}

exports.query = function(id, placeHolders){
    let query = id.split('.')
    let res = lang
    for(let q of query){
        res = res[q]
    }
    let text = res === lang ? '' : res
    if (placeHolders) {
        Object.entries(placeHolders).forEach(([key, value]) => {
            text = text.replace(`{${key}}`, value)
        })
    }
    return text
}

exports.queryJS = function(id, placeHolders){
    return exports.query(`js.${id}`, placeHolders)
}

exports.queryEJS = function(id, placeHolders){
    return exports.query(`ejs.${id}`, placeHolders)
}

function getSystemLanguage() {
    try {
        const electron = require('electron')
        const app = electron.app || (electron.remote && electron.remote.app)
        if (app && typeof app.getLocale === 'function') {
            const loc = app.getLocale()
            if (loc) {
                return loc.replace('-', '_')
            }
        }
    } catch (_e) {}

    const envLang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || process.env.LC_MESSAGES
    if (envLang) {
        return envLang.split('.')[0]
    }
    return Intl.DateTimeFormat().resolvedOptions().locale.replace('-', '_')
}

function getSavedConfigLanguage() {
    try {
        const sysRoot = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME)
        const configPath = path.join(sysRoot, 'SteelPact', 'config.json')
        if (fs.existsSync(configPath)) {
            const cfg = fs.readJsonSync(configPath)
            if (cfg && cfg.settings && cfg.settings.launcher && cfg.settings.launcher.language) {
                return cfg.settings.launcher.language
            }
        }
    } catch (_e) {}
    return null
}

exports.getEffectiveLanguage = function(selectedLang) {
    if (selectedLang) {
        return selectedLang
    }
    const saved = getSavedConfigLanguage()
    if (saved) {
        return saved
    }

    const sys = getSystemLanguage()
    if (sys.startsWith('pt')) {
        return 'pt_BR'
    }
    return 'en_US'
}

exports.setupLanguage = function(selectedLang){
    // Reset lang map
    lang = {}

    // Base English always loaded first as fallback
    exports.loadLanguage('en_US')

    // Determine target language
    const target = exports.getEffectiveLanguage(selectedLang)
    if (target !== 'en_US') {
        try {
            exports.loadLanguage(target)
        } catch (_e) {
            // fallback to base English
        }
    }

    // Load Custom Language File for Launcher Customizer
    try {
        exports.loadLanguage('_custom')
    } catch (_e) {}
}