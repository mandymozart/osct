import type { TargetData, TargetRecognitionData } from '../../../shared/types/game-config';
import { decodePrintedImage, framePng, recognitionData, recognitionFrame } from './recognition';

/**
 * `osct targets prepare` (#306): every target of an experience gets its recognition data made ahead from its printed image
 * – read from the instance's editor API, made here (`recognition.ts`), stored back there: the grey frame as a Library file
 * (`<target>_recognition.png`, the API stores it as WebP), the target's `recognition` naming it. The database stays the
 * only truth (#322): the API drops a target's `recognition` whenever its image changes, and the next run makes it again.
 */

/** The editor API's tree (`GET /editor/experiences/{id}`), as far as targets go */
interface Tree {
  /** `assetsBase`: where the content's `/assets/content/…` paths resolve ("" = the instance's origin) */
  experience?: { assetsBase?: string };
  scenes: { id: string; entries: { id: string; target?: TargetData | null }[] }[];
}

export interface PlannedTarget {
  id: string;
  scene: string;
  /** As the target names it (an imported target: a content path, `/assets/content/…`) */
  imageSrc: string;
  /** Where to download it */
  url: string;
  /** `prepare`: none yet (or `--force`), `ready`: has recognition data, `off`: switched off and not asked for (`--all`) */
  action: 'prepare' | 'ready' | 'off';
  /** Switched off in the editor (#249) – prepared only with `--all` (an experience may hold many switched-off targets) */
  enabled: boolean;
}

export interface PlanOptions {
  /** Make every target's data again */
  force?: boolean;
  /** Switched-off targets too */
  all?: boolean;
  /** The instance's origin – where a content path resolves when the experience has no `assetsBase` */
  origin?: string;
}

/** Where an image the content names is downloaded: a content path below the experience's `assetsBase`, else the instance's origin */
export const imageUrl = (src: string, assetsBase: string, origin: string): string =>
  !src.startsWith('/') || src.startsWith('//') ? src : `${(assetsBase || origin).replace(/\/+$/, '')}${src}`;

/** The targets of a tree and what a run does with each */
export function planTargets(tree: Tree, { force = false, all = false, origin = '' }: PlanOptions = {}): PlannedTarget[] {
  const assetsBase = tree.experience?.assetsBase ?? '';
  return tree.scenes.flatMap(scene =>
    scene.entries.flatMap(entry => {
      const target = entry.target;
      if (!target?.imageSrc) return [];
      const enabled = target.enabled !== false;
      const action: PlannedTarget['action'] = !force && target.recognition ? 'ready' : !enabled && !all ? 'off' : 'prepare';
      return [{ id: target.id, scene: scene.id, imageSrc: target.imageSrc, url: imageUrl(target.imageSrc, assetsBase, origin), action, enabled }];
    }));
}

export const describePlan = (plan: readonly PlannedTarget[]): string[] => {
  const todo = plan.filter(target => target.action === 'prepare');
  const count = (action: PlannedTarget['action']) => plan.filter(target => target.action === action).length;
  return [
    ...todo.map(target => `   + ${target.id} (${target.scene})${target.enabled ? '' : ' – switched off'}  ${target.url}`),
    `${plan.length} targets: ${todo.length} to prepare, ${count('ready')} with recognition data` +
      (count('off') ? `, ${count('off')} switched off (--all prepares them too)` : ''),
  ];
};

/** The calls a run needs – an instance's editor API with a person's token (`OSCT_API_URL`, `OSCT_EDITOR_TOKEN`) */
export interface EditorApi {
  tree(experience: string): Promise<Tree>;
  /** The printed image's bytes */
  download(url: string): Promise<Uint8Array>;
  /** A Library upload → the stored file's URL */
  upload(experience: string, name: string, bytes: Uint8Array): Promise<string>;
  putRecognition(experience: string, target: string, imageSrc: string, recognition: TargetRecognitionData): Promise<void>;
}

/** `fetch` against an instance's API (`api` ends without `/`) */
export function editorApi(api: string, token: string, fetcher: typeof fetch = fetch): EditorApi {
  const call = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const response = await fetcher(`${api}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${body.slice(0, 300)}`);
    }
    return response;
  };
  const experiencePath = (experience: string) => `/editor/experiences/${encodeURIComponent(experience)}`;
  return {
    tree: async experience => (await call(experiencePath(experience))).json() as Promise<Tree>,
    download: async url => {
      const response = await fetcher(url);
      if (!response.ok) throw new Error(`GET ${url} → ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
    upload: async (experience, name, bytes) => {
      const response = await call(`${experiencePath(experience)}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', 'X-File-Name': name },
        body: bytes,
      });
      const { asset } = await response.json() as { asset: { url: string } };
      return asset.url;
    },
    putRecognition: async (experience, target, imageSrc, recognition) => {
      // The image it was made from goes along: the API sets the data only while that is still the target's image (409 else)
      await call(`${experiencePath(experience)}/targets/${encodeURIComponent(target)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recognition, madeFrom: imageSrc }),
      });
    },
  };
}

export interface PreparedTarget {
  id: string;
  recognition: TargetRecognitionData;
  /** Time to make the frame here (decode, frame, PNG), ms */
  makeMs: number;
  bytes: number;
}

/** Makes and stores the recognition data of the planned targets, one after another; `log` per target */
export async function prepareTargets(
  api: EditorApi,
  experience: string,
  plan: readonly PlannedTarget[],
  log: (line: string) => void = () => {},
): Promise<PreparedTarget[]> {
  const done: PreparedTarget[] = [];
  for (const target of plan.filter(t => t.action === 'prepare')) {
    const printed = await api.download(target.url);
    const begun = performance.now();
    const image = await decodePrintedImage(printed);
    const png = framePng(recognitionFrame(image));
    const makeMs = performance.now() - begun;
    const url = await api.upload(experience, `${target.id}_recognition.png`, png);
    const recognition = recognitionData(url, image);
    try {
      await api.putRecognition(experience, target.id, target.imageSrc, recognition);
    } catch (error) {
      // Its image was changed meanwhile: the next run makes it from the new one (the uploaded frame stays unused in the Library)
      if (error instanceof Error && error.message.includes('→ 409')) {
        log(`   ⚠️ ${target.id}: its image changed meanwhile – skipped, run again`);
        continue;
      }
      throw error;
    }
    done.push({ id: target.id, recognition, makeMs, bytes: png.byteLength });
    log(`   ✓ ${target.id}  ${image.width}×${image.height} → ${url} (${Math.round(makeMs)} ms here)`);
  }
  return done;
}
