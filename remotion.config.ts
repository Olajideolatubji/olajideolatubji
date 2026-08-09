import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Preinstalled Playwright Chromium only supports the new headless mode, so
// run it via chrome-for-testing mode instead of chrome-headless-shell.
Config.setChromeMode('chrome-for-testing');
Config.setBrowserExecutable('/opt/pw-browsers/chromium');
Config.setChromiumOpenGlRenderer('swangle');
Config.setConcurrency(4);
