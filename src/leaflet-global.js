import L from 'leaflet'

// leaflet-gpx is a plain script with no module wrapper, and the UMD wrapper in
// leaflet-providers tests `typeof modules` (with an "s") so its CommonJS branch
// never runs. Both therefore fall back to reading a global `L`.
//
// This lives in its own module because ES module imports are hoisted: assigning
// the global from inside the module that imports the plugins would run too late.
// Importing this file first guarantees the assignment happens before the plugin
// modules are evaluated.
window.L = L

export default L
