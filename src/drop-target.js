/**
 * Makes the whole app a drop target for GPX files.
 *
 * `dragenter` and `dragleave` fire again for every descendant the pointer
 * crosses, so the original enable/disable pair left wheel zoom disabled whenever
 * a drag passed over a child element. Counting enter and leave events fixes it.
 */
export function installDropTarget ({ element, map, onFiles }) {
  let depth = 0

  const activate = () => {
    element.classList.add('drop-active')
    map?.scrollWheelZoom.disable()
  }

  const deactivate = () => {
    depth = 0
    element.classList.remove('drop-active')
    map?.scrollWheelZoom.enable()
  }

  element.addEventListener('dragenter', (event) => {
    event.preventDefault()
    depth += 1
    activate()
  })

  element.addEventListener('dragover', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  })

  element.addEventListener('dragleave', (event) => {
    event.preventDefault()
    depth -= 1
    if (depth <= 0) {
      deactivate()
    }
  })

  element.addEventListener('drop', (event) => {
    event.preventDefault()
    event.stopPropagation()
    deactivate()
    const files = event.dataTransfer?.files
    if (files?.length) {
      onFiles(files)
    }
  })

  // Dropping outside the target would otherwise make the browser navigate away
  // from the app to render the dropped file.
  for (const name of ['dragover', 'drop']) {
    window.addEventListener(name, (event) => {
      if (!element.contains(event.target)) {
        event.preventDefault()
      }
    })
  }
}
