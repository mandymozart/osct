import fs from 'fs';
import path from 'path';
import { pairSubtitles, SUBTITLE_EXTENSION, type SubtitleData, subtitleFileOf } from '../../../shared/types/subtitles';
import { webVttProblems } from '../../../shared/text/webvtt';
import { CONTENT_DIR } from '../config';
import { buildErrors, buildWarnings } from '../lib/errors';
import { listFiles } from '../lib/files';

/**
 * The book's subtitles: every `<video name>.<language>.vtt` next to a video of the content is that video's subtitle
 * file in that language (`shared/types/subtitles.ts`) – the configuration lists them per video, nobody writes the
 * pairing down. A subtitle file that is no WebVTT is an error; one whose name fits no video beside it is reported and
 * left out.
 */
export function buildSubtitles(): SubtitleData[] {
  const files = listFiles(CONTENT_DIR);
  const subtitles = pairSubtitles(files.map(file => `/assets/content/${file}`));
  const paired = new Set(subtitles.flatMap(subtitle => Object.values(subtitle.tracks)));
  files.filter(file => file.toLowerCase().endsWith(SUBTITLE_EXTENSION)).forEach(file => {
    if (!paired.has(`/assets/content/${file}`)) {
      const named = subtitleFileOf(file);
      buildWarnings.push(named
        ? `${file}: no video "${named.video}.mp4" (or .webm, .mov) beside it – the subtitles are left out`
        : `${file}: a subtitle file is named <video name>.<language>.vtt (speak.en.vtt) – left out`);
      return;
    }
    webVttProblems(fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8')).forEach(problem => buildErrors.push(`${file}: ${problem}`));
  });
  return subtitles;
}
