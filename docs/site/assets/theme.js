/* Manual light/dark override for the two static pages.
 *
 * The stylesheet already follows prefers-color-scheme; this only pins a choice when the
 * reader makes one, and it is loaded in <head> so the pinned theme is on <html> before
 * the first paint. The site is served with CSP script-src 'self', so this cannot be an
 * inline script. Both glyphs live in the markup and CSS picks one, so nothing flashes
 * while this file is still loading. */
;(function () {
  'use strict'

  var KEY = 'asc-demo-theme'
  var root = document.documentElement

  function stored() {
    try {
      var value = window.localStorage.getItem(KEY)
      return value === 'light' || value === 'dark' ? value : null
    } catch (error) {
      return null
    }
  }

  function system() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
    } catch (error) {
      return 'dark'
    }
  }

  var pinned = stored()
  if (pinned) root.setAttribute('data-theme', pinned)

  function current() {
    return root.getAttribute('data-theme') || system()
  }

  function label() {
    var i18n = window.ASCDemo && window.ASCDemo.i18n
    return i18n ? i18n.t('l.nav.theme') : 'Toggle theme'
  }

  function sync(button) {
    var text = label()
    button.setAttribute('aria-label', text)
    button.setAttribute('title', text)
    button.setAttribute('data-current', current())
  }

  function toggle() {
    var next = current() === 'dark' ? 'light' : 'dark'
    root.setAttribute('data-theme', next)
    try {
      window.localStorage.setItem(KEY, next)
    } catch (error) {
      /* Private mode: the theme still applies for this page view. */
    }
    var button = document.querySelector('.theme-btn')
    if (button) sync(button)
  }

  function wire() {
    var button = document.querySelector('.theme-btn')
    if (!button) return
    sync(button)
    button.addEventListener('click', toggle)
    var i18n = window.ASCDemo && window.ASCDemo.i18n
    if (i18n && i18n.onChange) i18n.onChange(function () { sync(button) })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire)
  } else {
    wire()
  }

  window.ASCDemo = window.ASCDemo || {}
  window.ASCDemo.theme = toggle
})()
