// Below this width panels start collapsed, so they cannot cover the map.
const NARROW_SCREEN = '(max-width: 700px)'

export function isNarrowScreen () {
  return window.matchMedia(NARROW_SCREEN).matches
}

/**
 * Collapse behaviour shared by the summary and track panels: a header button
 * carrying aria-expanded, and a body that is hidden when folded away.
 */
export class Collapsible {
  constructor ({ element, toggle, body, expanded = true }) {
    this.element = element
    this.toggle = toggle
    this.body = body

    this.toggle.addEventListener('click', () => this.setExpanded(!this.expanded))
    this.setExpanded(expanded)
  }

  get expanded () {
    return this.toggle.getAttribute('aria-expanded') === 'true'
  }

  setExpanded (expanded) {
    this.toggle.setAttribute('aria-expanded', String(expanded))
    this.body.hidden = !expanded
    this.element.classList.toggle('is-collapsed', !expanded)
  }
}
