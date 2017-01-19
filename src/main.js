import '../styles/styles.css'

import {LogManager} from 'aurelia-framework'
import {debug} from './config'

if (debug) {
  LogManager.setLevel(LogManager.logLevel.debug)
}

// Configure Bluebird Promises.
// Note: You may want to use environment-specific configuration.
Promise.config({
  warnings: {
    wForgottenReturn: false
  }
})

export function configure (aurelia) {
  aurelia.use.standardConfiguration()

  if (debug) {
    aurelia.use.developmentLogging()
  }

  aurelia.start().then(() => {
    aurelia.setRoot('app')
  })
}
