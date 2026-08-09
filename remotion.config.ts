import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setBrowserExecutable('/opt/pw-browsers/chromium');
Config.setChromiumOpenGlRenderer('swangle');
Config.setConcurrency(4);
