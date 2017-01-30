const {app, BrowserWindow} = require('electron')

let mainWindow = null

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('ready', () => {
  mainWindow = new BrowserWindow({width: 1000, height: 625})

  mainWindow.loadURL('file://' + __dirname + '/index.html')

  mainWindow.on('closed', () => {
    mainWindow = null
  })
})
