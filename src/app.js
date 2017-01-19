import {inject} from 'aurelia-framework'
import {EventAggregator} from 'aurelia-event-aggregator'
import {logger, debug} from './config'

@inject(EventAggregator)
export class App {
  constructor (eventBus) {
    this.eventBus = eventBus

    if (debug) {
      this.debugEvents(eventBus)
    }
  }

  activate () {
    logger.info('Application is activated')
  }

  debugEvents (eventBus) {
    eventBus.origPublish = eventBus.publish
    eventBus.publish = (event, data) => {
      logger.info('Event:', event, 'Data:', data)
      eventBus.origPublish(event, data)
    }
  }
}
