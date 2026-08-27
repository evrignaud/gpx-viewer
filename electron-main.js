// Electron main process.
//
// Electron 1.4 defaulted `nodeIntegration` to true and had no context
// isolation, so the renderer, which parses arbitrary GPX files the user drops
// in, ran with full Node privileges. The switches below are the current
// defaults for a renderer that only needs to display bundled local content.

import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const indexHtml = path.join(dirname, 'dist', 'index.html')

let mainWindow = null

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#eeeeee',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.loadFile(indexHtml)

  // Keep navigation inside the app: anything else goes to the user's browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
