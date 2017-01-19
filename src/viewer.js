import {inject} from 'aurelia-framework'
import {EventAggregator} from 'aurelia-event-aggregator'
import randomColor from 'randomcolor'

@inject(EventAggregator)
export class Viewer {
  constructor (eventBus) {
    this.eventBus = eventBus
  }

  attached () {
    initMap()
    initDragAndDrop()
  }
}

let globalMap
let elevation
const baseLayers = {}
const overlays = {}

const mapAPIcodes = {
}

const origProviderInit = L.TileLayer.Provider.prototype.initialize
L.TileLayer.Provider.include({
  initialize: function (providerName, options) {
    this._providerName = providerName
    options = options || {}

    // Replace ma API codes in options
    const provider = this._providerName.split('.')[0]
    if (provider in mapAPIcodes) {
      // overwrite mapAPIcodes with a placeholder to prevent accidental use of these API codes.
      this._exampleAPIcodes = {}
      for (const key in mapAPIcodes[provider]) {
        this._exampleAPIcodes[key] = '<your ' + key + '>'
      }
      L.extend(options, mapAPIcodes[provider])
    }
    origProviderInit.call(this, providerName, options)
  }
})

// save the options while creating tilelayers to cleanly access them later.
const origTileLayerInit = L.TileLayer.prototype.initialize
L.TileLayer.include({
  initialize: function (url, options) {
    this._options = options
    origTileLayerInit.apply(this, arguments)
  }
})

L.tileLayer.provider.eachLayer = function (callback) {
  for (const provider in L.TileLayer.Provider.providers) {
    if (L.TileLayer.Provider.providers[provider].variants) {
      for (const variant in L.TileLayer.Provider.providers[provider].variants) {
        callback(provider + '.' + variant)
      }
    } else {
      callback(provider)
    }
  }
}

function initMap () {
  globalMap = L.map('map', {
    zoomControl: false
  }).setView([48.86, -45.18], 3)

  L.control.graphicScale({}).addTo(globalMap)

  elevation = L.control.elevation({width: 1200})
  elevation.addTo(globalMap)

  const isSelected = function (providerName) {
    const selectedProviders = [
      'OpenStreetMap.Mapnik',
      'OpenStreetMap.France',
      'OpenTopoMap',
      'Stamen.Watercolor',
      'Stamen.Terrain',
      'Esri.WorldImagery'
    ]
    return selectedProviders.indexOf(providerName) !== -1
  }

  L.tileLayer.provider.eachLayer((name) => {
    if (!isSelected(name)) {
      return
    }
    const layer = L.tileLayer.provider(name)
    baseLayers[name] = layer
  })

  // Add minimap control to the map
  L.control.layers.minimap(baseLayers, overlays, {
    collapsed: false
  }).addTo(globalMap)

  baseLayers['OpenTopoMap'].addTo(globalMap)
}

function initDragAndDrop () {
  const callbacks = {
    dragenter: function () {
      globalMap.scrollWheelZoom.disable()
    },
    dragleave: function () {
      globalMap.scrollWheelZoom.enable()
    },
    dragover: function (e) {
      e.stopPropagation()
      e.preventDefault()
    },
    drop: function (e) {
      e.stopPropagation()
      e.preventDefault()

      loadFiles(e.dataTransfer.files)
      globalMap.scrollWheelZoom.enable()
    }
  }

  for (let name in callbacks) {
    globalMap._container.addEventListener(name, callbacks[name], false)
  }
}

function loadFiles (files) {
  files = Array.prototype.slice.apply(files)

  function loadOneFile () {
    load(files.shift())
    if (files.length > 0) {
      setTimeout(loadOneFile, 25)
    }
  }

  setTimeout(loadOneFile, 25)
}

let totalDistance = 0
let totalDuration = 0
let totalElevationGain = 0
let totalElevationLoss = 0

let colorCount = 50
let colors = randomColor({
  luminosity: 'dark',
  count: colorCount
})

let loadedTrackCount = 0

// Read selected file using the HTML5 File API
function load (file) {
  addGpxInfos()

  const reader = new FileReader()
  reader.onload = function (fileLoadEvent) {
    try {
      const gpxContent = fileLoadEvent.target.result
      loadedTrackCount++
      new L.GPX(gpxContent, {
        async: true,
        polyline_options: {
          color: colors[loadedTrackCount % colorCount]
        },
        marker_options: {
          wptIconUrls: {
            '': 'libs/images/red-pin.png'
          },
          startIconUrl: 'libs/images/pin-icon-start.png',
          endIconUrl: 'libs/images/pin-icon-end.png',
          shadowUrl: 'libs/images/pin-shadow.png'
        }
      })
        .on('addline', function (e) {
          elevation.addData(e.line)
        })
        .on('loaded', function (gpxLoadEvent) {
          const gpx = gpxLoadEvent.target
          globalMap.fitBounds(gpx.getBounds())

          $('.info-name').text(`Last track: ${gpx.get_name()}`)
          $('.info-start').text(getStartTime(gpx).toDateString() + ', ' + getStartTime(gpx).toLocaleTimeString())
          const distance = gpx.m_to_km(gpx.get_distance())
          $('.info-distance').text(distance.toFixed(2))
          const movingTime = gpx.get_moving_time()
          $('.info-duration').text(gpx.get_duration_string(movingTime))
          $('.info-pace').text(gpx.get_duration_string(gpx.get_moving_pace(), true))
          $('.info-elevation-gain').text(gpx.get_elevation_gain().toFixed(0))
          $('.info-elevation-loss').text(gpx.get_elevation_loss().toFixed(0))
          $('.info-elevation-net').text((gpx.get_elevation_gain() - gpx.get_elevation_loss()).toFixed(0))

          totalDistance += distance
          totalDuration += movingTime
          totalElevationGain += gpx.get_elevation_gain()
          totalElevationLoss += gpx.get_elevation_loss()

          $('.info-total-distance').text(totalDistance.toFixed(2))
          $('.info-total-duration').text(gpx.get_duration_string(totalDuration))
          $('.info-total-pace').text(gpx.get_duration_string(totalDuration / totalDistance, true))
          $('.info-total-elevation-gain').text(totalElevationGain.toFixed(0))
          $('.info-total-elevation-loss').text(totalElevationLoss.toFixed(0))
          $('.info-total-elevation-net').text((totalElevationGain - totalElevationLoss).toFixed(0))
        }).addTo(globalMap)
    } catch (err) {
      console.log(err)
    }
  }
  reader.readAsText(file)
  return reader
}

function getStartTime (gpx) {
  return gpx.get_start_time() || new Date()
}

let infosAdded = false
function addGpxInfos () {
  if (!infosAdded) {
    infosAdded = true

    // Add the TileLayer source code control to the map
    globalMap.addControl(new (L.Control.extend({
      options: {
        position: 'topleft'
      },
      onAdd: function (map) {
        const infoPanel = L.DomUtil.get('info-panel')
        L.DomEvent.disableClickPropagation(infoPanel)
        return infoPanel
      }
    })))
  }
}
