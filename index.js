const { app, ipcMain, dialog, BrowserWindow, Menu } = require('electron');
const cp = require('child_process');
const ytdl = require('ytdl-core');
const {toMb} = require('./utils.js')
const { createWriteStream } = require('fs');
const path = require('path');
const ffmpegStatic = require('ffmpeg-static-electron');
const ffmpeg = require('fluent-ffmpeg');

app.whenReady().then(() => {
    Menu.setApplicationMenu(false);

    const browser = new BrowserWindow({
        width: 720,
        height: 480,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: true
        }
    });
    browser.loadFile("home.html");

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    app.on("window-all-closed", () => {
        if (process.platform !== 'darwin')
            app.quit();
    });

    ipcMain.on('sendUrl', (e, arg) => {
        ytdl.getInfo(arg).then(info => {
            e.sender.send('receiveInfo', info)
        }).catch(error => {
            dialog.showErrorBox('Error', error);
        })
    });

    ipcMain.on('sendDownload', (event, arg) => {
        const format = ytdl.chooseFormat(arg.formats, { quality: arg.itag });
        dialog.showSaveDialog(browser, {
            title: `Save ${arg.detail.title} as...`,
            defaultPath: `${arg.detail.title.replace(/\\|\/|\:|\*|\?|\"|\<|\>|\|/g, '-')}.${!format.qualityLabel ? 'mp3' : format.container}`,
            buttonLabel: 'Download!'
        }).then(res => {
            if (res.canceled) return;

            // Don't have label = Audio file
            if (!format.qualityLabel) {
                const onlyAudio = ytdl(arg.detail.videoId, { format: format });

                let total;
                ffmpeg(onlyAudio).audioBitrate(format.audioBitrate)
                    .save(res.filePath)
                    .on('codecData', codec => {
                        total = parseInt(codec.duration.replace(/:/g, ''));
                    })
                    .on('progress', p => {
                        let time = parseInt(p.timemark.replace(/:/g, ''));
                        browser.setProgressBar((time / total));
                    })
                    .on('end', () => {
                        dialog.showMessageBox(browser, {
                            title: 'Youtube Downloader Desktop',
                            message: "Downloaded"
                        });
                        browser.setProgressBar(-1);
                    });
            } else {
                const tracker = {
                    start: Date.now(),
                    audio: { downloaded: 0, total: Infinity },
                    video: { downloaded: 0, total: Infinity },
                    merged: { frame: 0, speed: '0x', fps: 0 },
                };
                const video = ytdl(arg.detail.videoId, { format: format });
                const audio = ytdl(arg.detail.videoId, { quality: 'highestaudio' });

                video.on('progress', (_, downloaded, total) => {
                    tracker.video = { downloaded, total };
                });

                audio.on('progress', (_, downloaded, total) => {
                    tracker.audio = { downloaded, total };
                });

                const ffmpegProcess = cp.spawn(ffmpegStatic.path.replace('app.asar', 'app.asar.unpacked'), [
                    // Remove ffmpeg's console spamming
                    '-loglevel', '8', '-hide_banner',
                    // Redirect/Enable progress messages
                    '-progress', 'pipe:3',
                    // Set inputs
                    '-i', 'pipe:4',
                    '-i', 'pipe:5',
                    // Map audio & video from streams
                    '-map', '0:a',
                    '-map', '1:v',
                    // Keep encoding
                    '-c:v', 'copy',
                    // Define output file
                    `${res.filePath}`,
                ], {
                    windowsHide: true,
                    stdio: [
                        /* Standard: stdin, stdout, stderr */
                        'inherit', 'inherit', 'inherit',
                        /* Custom: pipe:3, pipe:4, pipe:5 */
                        'pipe', 'pipe', 'pipe',
                    ],
                });

                ffmpegProcess.on('close', (code) => {
                    if (code == 0) 
                    {
                        dialog.showMessageBox(browser, {
                            title: 'Youtube Downloader Desktop | Happy',
                            message: "Downloaded"
                        });
    
                        browser.setProgressBar(-1);
                        event.sender.send('progress', {
                            end: true
                        });
                    } else {
                        dialog.showMessageBox(browser, {
                            title: 'Youtube Downloader Desktop | Oh no!!!',
                            message: "File already exists!"
                        });
                    }
                });

                // Progress when file downloading
                ffmpegProcess.stdio[3].on('data', chunk => {
                    browser.setProgressBar((tracker.video.downloaded / tracker.video.total));
                    event.sender.send('progress', {
                        end: false,
                        percent: (tracker.video.downloaded / tracker.video.total) * 100,
                        text: `${toMb(tracker.video.downloaded)}MB / ${toMb(tracker.video.total)}MB`
                    });

                    // Parse the param=value list returned by ffmpeg
                    const lines = chunk.toString().trim().split('\n');
                    const args = {};
                    for (const l of lines) {
                        const [key, value] = l.split('=');
                        args[key.trim()] = value.trim();
                    }
                    tracker.merged = args;
                });

                audio.pipe(ffmpegProcess.stdio[4]);
                video.pipe(ffmpegProcess.stdio[5]);
            }
        });
    });
});

