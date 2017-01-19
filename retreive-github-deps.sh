#!/usr/bin/env bash

if [ ! -d deps ]; then
  mkdir deps
fi

curl https://raw.githubusercontent.com/mpetazzoni/leaflet-gpx/master/gpx.js > deps/leaflet-gpx.js

curl https://raw.githubusercontent.com/MrMufflon/Leaflet.Elevation/master/src/L.Control.Elevation.js > deps/leaflet.elevation.js
curl https://raw.githubusercontent.com/MrMufflon/Leaflet.Elevation/master/dist/leaflet.elevation-0.0.4.css > deps/leaflet.elevation.css
