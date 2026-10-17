// Saves text as a file through the browser.
export const downloadFile = (fileName: string, content: string, type: string) => {
   const url = URL.createObjectURL(new Blob([content], { type }))
   const link = document.createElement('a')

   link.href = url
   link.download = fileName
   link.click()
   URL.revokeObjectURL(url)
}
