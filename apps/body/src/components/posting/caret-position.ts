// Where a character of a text box is drawn, measured on a hidden copy of the box with the same font, padding and width. Used to
// put the emoji list and the link bar next to the caret or the selection. Positions are in pixels from the top left of the box.
const COPIED = [
   'direction',
   'box-sizing',
   'width',
   'border-top-width',
   'border-right-width',
   'border-bottom-width',
   'border-left-width',
   'padding-top',
   'padding-right',
   'padding-bottom',
   'padding-left',
   'font-style',
   'font-variant',
   'font-weight',
   'font-stretch',
   'font-size',
   'line-height',
   'font-family',
   'text-align',
   'text-transform',
   'text-indent',
   'letter-spacing',
   'word-spacing',
   'tab-size',
]

export type Spot = {
   top: number
   left: number
   // The height of the line, so a list can open under it.
   height: number
}

export const spotOf = (field: HTMLTextAreaElement, index: number): Spot => {
   const style = getComputedStyle(field)
   const mirror = document.createElement('div')
   const marker = document.createElement('span')

   for (const name of COPIED) {
      mirror.style.setProperty(name, style.getPropertyValue(name))
   }

   mirror.style.position = 'absolute'
   mirror.style.visibility = 'hidden'
   mirror.style.top = '0'
   mirror.style.left = '-9999px'
   mirror.style.whiteSpace = 'pre-wrap'
   mirror.style.overflowWrap = 'break-word'
   mirror.textContent = field.value.slice(0, index)
   marker.textContent = field.value.slice(index, index + 1) || '.'
   mirror.append(marker)
   document.body.append(mirror)

   const spot = {
      top: marker.offsetTop - field.scrollTop,
      left: marker.offsetLeft - field.scrollLeft,
      height: Number.parseFloat(style.lineHeight) || marker.offsetHeight,
   }

   mirror.remove()

   return spot
}
