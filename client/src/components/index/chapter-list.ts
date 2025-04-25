import { GameStoreService } from '@/services/GameStoreService';
import { ChapterData, IGame, TargetData } from '@/types';
import { assert } from '@/utils';
import './chapter-item';
import './target-item';
import { getChapter, getChapters } from '@/utils/config';

export interface IChapterList extends HTMLElement {
  updateChapters(): void;
  scrollToCurrentChapter(): void;
}

/**
 * ChapterList Component
 *
 * Container for all chapters and their targets in the index page
 */
export class ChapterList extends HTMLElement implements IChapterList {
  private game: Readonly<IGame>;
  private chapters: ChapterData[] = [];
  private expandedTargetId: string | null = null;
  private unsubscribe: (() => void) | null = null;

  // Static property for direct access
  static instance: ChapterList | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: 'open' });
    this.handleStateChange = this.handleStateChange.bind(this);
    this.handleChapterSelect = this.handleChapterSelect.bind(this);
    this.handleTargetToggle = this.handleTargetToggle.bind(this);
    this.handleTargetSelect = this.handleTargetSelect.bind(this);

    // Store instance reference for direct access
    ChapterList.instance = this;
  }

  connectedCallback() {
    assert(this.game, 'Game store not initialized');
    this.render();
    this.unsubscribe = this.game.subscribe(this.handleStateChange);
    this.updateChapters();
    this.setupEventListeners();
  }

  disconnectedCallback() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.removeEventListeners();
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          display: block;
          margin-bottom: 2rem;
        }
        
        .no-chapters {
          text-align: center;
          color: var(--color-primary-500);
        }
      </style>
      
      <div id="container">
        <div class="no-chapters">Loading chapters...</div>
      </div>
    `;
  }

  private setupEventListeners() {
    this.addEventListener(
      'chapter-select',
      this.handleChapterSelect as EventListener,
    );
    this.addEventListener(
      'target-toggle',
      this.handleTargetToggle as EventListener,
    );
    this.addEventListener(
      'target-select',
      this.handleTargetSelect as EventListener,
    );
  }

  private removeEventListeners() {
    this.removeEventListener(
      'chapter-select',
      this.handleChapterSelect as EventListener,
    );
    this.removeEventListener(
      'target-toggle',
      this.handleTargetToggle as EventListener,
    );
    this.removeEventListener(
      'target-select',
      this.handleTargetSelect as EventListener,
    );
  }

  private handleStateChange() {
    this.updateChapters();
  }

  public updateChapters() {
    assert(this.game, 'Game store not initialized');

    this.chapters = getChapters();

    this.chapters.sort((a, b) => {
      const aData = getChapter(a.id);
      const bData = getChapter(b.id);
      if (aData && bData) {
        return aData.order - bData.order;
      }
      return a.id.localeCompare(b.id);
    });

    this.renderChapters();
  }

  private renderChapters() {
    if (!this.shadowRoot) return;
    const container = this.shadowRoot.querySelector('#container');
    assert(container, 'Container element not found');

    if (this.chapters.length === 0) {
      container.innerHTML =
        '<div class="no-chapters">No chapters available</div>';
      return;
    }

    // Clear the container
    container.innerHTML = '';

    const currentChapterId = this.game.state.currentChapter || null;

    // Create and append chapter and target elements
    this.chapters.forEach((chapter) => {
      const isCurrent = chapter.id === currentChapterId;
      const chapterData = getChapter(chapter.id);

      // Create and append chapter item
      const chapterItem = document.createElement('chapter-item') as any;
      chapterItem.chapter = chapter;
      chapterItem.isCurrent = isCurrent;
      chapterItem.chapterData = chapterData;
      container.appendChild(chapterItem);

      // Append targets if they exist
      if (chapter.targets && chapter.targets.length > 0) {
        chapter.targets.forEach((target: TargetData) => {
          // Create and append target item
          const targetItem = document.createElement('target-item') as any;
          targetItem.target = target;
          targetItem.isCurrent = isCurrent;
          targetItem.isExpanded = this.expandedTargetId === target.bookId;
          container.appendChild(targetItem);
        });
      } else {
        // No targets message
        const noTargets = document.createElement('div');
        noTargets.classList.add('no-chapters');
        noTargets.textContent = 'No targets in this chapter';
        container.appendChild(noTargets);
      }
    });
  }

  private handleChapterSelect(event: CustomEvent) {
    const { chapterId } = event.detail;
    if (chapterId && this.game) {
      this.activateChapter(chapterId);
    }
  }

  private handleTargetToggle(event: CustomEvent) {
    const { targetId } = event.detail;
    if (targetId) {
      // Toggle expansion
      this.expandedTargetId =
        this.expandedTargetId === targetId ? null : targetId;
      this.renderChapters();
    }
  }

  private handleTargetSelect(event: CustomEvent) {
    const { targetId } = event.detail;
    if (!targetId) return;

    // Find the chapter that contains this target
    for (const chapter of this.chapters) {
      const targetExists = chapter.targets.some(
        (target: TargetData) => target.bookId === targetId,
      );
      if (targetExists && chapter.id !== this.game?.state.currentChapter) {
        this.activateChapter(chapter.id);
        break;
      }
    }
  }

  private activateChapter(chapterId: string) {
    if (!this.game) return;
    this.game.chapters.switchChapter(chapterId);
  }

  public scrollToCurrentChapter() {
    if (!this.shadowRoot || !this.game?.state.currentChapter) return;

    // Give the DOM time to update
    setTimeout(() => {
      const currentChapterId = this.game?.state.currentChapter;
      if (currentChapterId) {
        const currentChapter = this.shadowRoot?.querySelector(
          `chapter-item[is-current="true"]`,
        );
        if (currentChapter) {
          currentChapter.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 100);
  }
}

customElements.define('chapter-list', ChapterList);
