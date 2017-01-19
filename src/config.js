import {LogManager} from 'aurelia-framework'

export const debug = (window.location.href.indexOf('debug=true') >= 0)

export const logger = LogManager.getLogger('gpx-viewer')
