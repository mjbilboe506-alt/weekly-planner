const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('weeklyPlannerDesktop', {
  platform: process.platform
});
