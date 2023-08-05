const { contextBridge, ipcRenderer } = require('electron');
const utils = require('./utils.js');
contextBridge.exposeInMainWorld('API', {
    sendUrl: (callback) => ipcRenderer.send('sendUrl', callback),
    receiveInfo: (callback) => ipcRenderer.on('receiveInfo', callback),
    sendDownload: (callback) => ipcRenderer.send('sendDownload', callback),
    progress: (callback) => ipcRenderer.on('progress', callback),

    utils: utils
})