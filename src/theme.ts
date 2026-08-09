import {continueRender, delayRender, staticFile} from 'remotion';

export const BG = '#0B0B0D';
export const INK = '#EAEAEA';
export const RED = '#C1121F';

export const STAT_FONT = 'Oswald, sans-serif';
export const SERIF = '"EB Garamond", serif';
export const SANS = 'Archivo, sans-serif';

const loaded: Record<string, boolean> = {};

export const ensureFonts = () => {
  if (typeof document === 'undefined') return;
  const fonts: Array<[string, string]> = [
    ['Oswald', 'fonts/Oswald.ttf'],
    ['EB Garamond', 'fonts/EBGaramond.ttf'],
    ['Archivo', 'fonts/Archivo.ttf'],
  ];
  for (const [family, file] of fonts) {
    if (loaded[family]) continue;
    loaded[family] = true;
    const handle = delayRender(`font ${family}`);
    const face = new FontFace(family, `url(${staticFile(file)})`, {
      weight: '100 900',
    });
    face
      .load()
      .then((f) => {
        (document.fonts as unknown as {add: (f: FontFace) => void}).add(f);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }
};

export const dbToGain = (db: number) => Math.pow(10, db / 20);
