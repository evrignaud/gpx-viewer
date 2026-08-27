/**
 * Wires the "Add GPX" file input.
 *
 * Touch devices have no drag and drop, so before this the app was unusable on a
 * phone: there was no way at all to get a file in (GitHub issue #2).
 */
export function installFilePicker ({ input, onFiles }) {
  input.addEventListener('change', () => {
    if (input.files?.length) {
      onFiles(input.files)
    }
    // Clearing the value means picking the same file twice in a row still fires
    // a change event the second time.
    input.value = ''
  })
}
