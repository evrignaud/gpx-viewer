/*
 * Optional debug hooks plus a "did the bundle boot?" check.
 *
 * This runs as a classic script, ahead of the deferred module bundle, because
 * both jobs have to happen before and independently of src/main.js. It lives in
 * public/ rather than inline in index.html so the page can ship a
 * Content-Security-Policy without needing 'unsafe-inline' for scripts.
 *
 * Supported query parameters:
 *   ?debug                        enable debug logging
 *   ?visual-log                   mirror console output into the page
 *   ?hide-visual-log-on-success   remove that mirror once the app has started
 *   ?status-check-timeout=<ms>    how long to wait before declaring failure
 */
(function bootstrapDiagnostics () {
  var params = new URLSearchParams(window.location.search)

  function flag (name) {
    if (!params.has(name)) {
      return false
    }
    var value = params.get(name)
    return value === '' || value === 'true' || value === '1'
  }

  var debug = flag('debug')
  var visualLog = flag('visual-log')
  var hideVisualLogOnSuccess = flag('hide-visual-log-on-success')
  var statusCheckTimeout = Number(params.get('status-check-timeout')) || 50000

  window.appLogDebug = function () {
    if (debug) {
      console.log.apply(console, arguments)
    }
  }

  if (visualLog) {
    var loggerElem = document.createElement('pre')
    loggerElem.id = 'visual-log'
    document.body.insertBefore(loggerElem, document.getElementById('app'))

    var render = function (args) {
      for (var i = 0; i < args.length; i++) {
        var value = args[i]
        loggerElem.textContent += (typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : String(value)) + ' '
      }
      loggerElem.textContent += '\n'
    }

    var methods = ['log', 'info', 'warn', 'error']
    if (debug) {
      methods.push('debug', 'trace')
    }
    methods.forEach(function (method) {
      var original = console[method]
      console[method] = function () {
        render(arguments)
        if (original) {
          original.apply(console, arguments)
        }
      }
    })
  }

  setTimeout(function checkAppStartedCorrectly () {
    var splash = document.getElementById('splash')
    if (!splash || splash.hidden) {
      window.appLogDebug('App started successfully')
      if (visualLog && hideVisualLogOnSuccess) {
        var log = document.getElementById('visual-log')
        if (log) {
          log.remove()
        }
      }
      return
    }

    // The splash is still up, so the bundle never reached its entry point.
    console.error('ERROR: App failed to start')
    splash.className = 'splash startup-error'
    splash.textContent = ''

    var title = document.createElement('p')
    title.className = 'message startup-error-title'
    title.textContent = 'Application failed to start'

    var detail = document.createElement('p')
    detail.className = 'startup-error-message'
    detail.textContent = 'Reload the page, and check the browser console for details.'

    splash.appendChild(title)
    splash.appendChild(detail)
  }, statusCheckTimeout)
})()
