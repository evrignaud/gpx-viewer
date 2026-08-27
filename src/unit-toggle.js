/**
 * Wires the toolbar button that switches between metric and imperial units.
 */
export function installUnitToggle ({ button, label, units }) {
  const render = () => {
    label.textContent = units.distanceLabel
    const next = units.isMetric ? 'imperial' : 'metric'
    button.setAttribute('aria-label',
      `Units: ${units.isMetric ? 'metric' : 'imperial'}. Switch to ${next}.`)
  }

  button.addEventListener('click', () => units.toggle())
  units.onChange(render)
  render()
}
