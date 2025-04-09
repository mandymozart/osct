import { IChapterList } from './chapter-list';
import { ChapterItem } from './chapter-item';
import { TargetItem } from './target-item';

// Declare the custom elements to TypeScript
declare global {
  interface HTMLElementTagNameMap {
    'chapter-list': IChapterList;
    'chapter-item': ChapterItem;
    'target-item': TargetItem;
  }
}
