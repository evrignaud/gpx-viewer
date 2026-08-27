import { logger } from './config.js'

const VISIBLE_MS = 6000

/**
 * Transient on-screen messages.
 *
 * Parse and read failures used to be swallowed by a bare `console.log(err)`, so
 * a malformed GPX file looked exactly like a file that had loaded fine but drawn
 * nothing.
 */
export class Notices {
  constructor (parent = document.body) {
    this.container = document.createElement('div')
    this.container.id = 'notices'
    this.container.setAttribute('role', 'status')
    this.container.setAttribute('aria-live', 'polite')
    parent.appendChild(this.container)
  }

  show (message, level = 'error') {
    logger[level === 'error' ? 'error' : 'info'](message)

    const notice = document.createElement('div')
    notice.className = `notice notice-${level}`

    // The message goes in its own element so the dismiss button's label is not
    // read out as part of it by assistive technology.
    const body = document.createElement('span')
    body.className = 'notice-body'
    body.textContent = message
    notice.appendChild(body)

    const dismiss = document.createElement('button')
    dismiss.type = 'button'
    dismiss.className = 'notice-dismiss'
    dismiss.setAttribute('aria-label', 'Dismiss message')
    dismiss.textContent = '\u00d7'
    dismiss.addEventListener('click', () => notice.remove())
    notice.appendChild(dismiss)

    this.container.appendChild(notice)
    setTimeout(() => notice.remove(), VISIBLE_MS)
  }

  error (message) {
    this.show(message, 'error')
  }

  info (message) {
    this.show(message, 'info')
  }
}
