const fs = require('fs')
const path = require('path')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('DistroMirror')
const IS_WINDOWS = process.platform === 'win32'

function normalizeKey(targetPath) {
    const resolved = path.resolve(targetPath)
    return IS_WINDOWS ? resolved.toLowerCase() : resolved
}

/**
 * Recursively collects every expected local file path declared by a HeliosServer's modules.
 *
 * @param {object} server HeliosServer instance
 * @param {string} instanceDir Root instances directory
 * @returns {Set<string>} Normalized file paths belonging to the distribution
 */
function collectDistroManagedFiles(server, instanceDir) {
    const expected = new Set()
    if (!server || !server.rawServer || !Array.isArray(server.modules)) {
        return expected
    }
    const serverDir = path.join(instanceDir, server.rawServer.id)

    const visit = (modules) => {
        for (const mdl of modules) {
            if (!mdl) continue
            const p = typeof mdl.getPath === 'function' ? mdl.getPath() : null
            if (p) {
                expected.add(normalizeKey(p))
            }
            const relPath = mdl.rawModule && mdl.rawModule.artifact && mdl.rawModule.artifact.path
            if (relPath) {
                expected.add(normalizeKey(path.join(serverDir, relPath)))
            }
            if (Array.isArray(mdl.subModules) && mdl.subModules.length > 0) {
                visit(mdl.subModules)
            }
        }
    }

    visit(server.modules)
    return expected
}

/**
 * Mirrors managed server subdirectories (`mods`, `Flan`) against the distribution manifest,
 * removing any local files not present in the distro while preserving user saves and configs.
 *
 * @param {object} server HeliosServer instance
 * @param {string} instanceDir Root instances directory
 * @param {string[]} [managedFolders=['mods', 'Flan']] Folders to mirror cleanly
 * @returns {{ removed: string[], kept: number }} Summary of removed and kept files
 */
function syncServerMirror(server, instanceDir, managedFolders = ['mods', 'Flan']) {
    if (!server || !server.rawServer || !Array.isArray(server.modules) || server.modules.length === 0) {
        logger.warn('[DistroMirror] Skipping mirror sync: invalid or empty server module list.')
        return { removed: [], kept: 0 }
    }

    const serverDir = path.join(instanceDir, server.rawServer.id)
    const expectedFiles = collectDistroManagedFiles(server, instanceDir)
    const removed = []
    let kept = 0

    const walkAndPrune = (dirPath, isFolderRoot) => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)
            if (entry.isDirectory()) {
                walkAndPrune(fullPath, false)
            } else if (entry.isFile()) {
                if (!expectedFiles.has(normalizeKey(fullPath))) {
                    try {
                        fs.unlinkSync(fullPath)
                        const rel = path.relative(serverDir, fullPath).replace(/\\/g, '/')
                        removed.push(rel)
                        logger.info(`[DistroMirror] Removed obsolete file: ${rel}`)
                    } catch (err) {
                        logger.warn(`[DistroMirror] Failed to remove obsolete file ${fullPath}:`, err)
                    }
                } else {
                    kept += 1
                }
            }
        }

        if (!isFolderRoot) {
            try {
                if (fs.readdirSync(dirPath).length === 0) {
                    fs.rmdirSync(dirPath)
                }
            } catch (_err) {
                // Ignore directory cleanup failures if locked or non-empty
            }
        }
    }

    for (const folder of managedFolders) {
        const targetDir = path.join(serverDir, folder)
        if (!fs.existsSync(targetDir)) continue
        try {
            if (fs.statSync(targetDir).isDirectory()) {
                walkAndPrune(targetDir, true)
            }
        } catch (err) {
            logger.warn(`[DistroMirror] Failed syncing folder ${targetDir}:`, err)
        }
    }

    return { removed, kept }
}

module.exports = {
    collectDistroManagedFiles,
    syncServerMirror
}
