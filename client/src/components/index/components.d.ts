import { ISpreadList } from './spread-list';
import { SpreadItem } from './spread-item';
import { TargetItem } from './target-item';

// Declare the custom elements to TypeScript
declare global {
  interface HTMLElementTagNameMap {
    'spread-list': ISpreadList;
    'spread-item': SpreadItem;
    'target-item': TargetItem;
  }
}
