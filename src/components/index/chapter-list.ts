import { GameStoreService } from "@/services/GameStoreService";
import { ChapterData, ChapterResource } from "@/types";
import { assert } from "@/utils";
import * as gameConfig from "@/game.config.json";
// Import sub-components explicitly
import "./chapter-item";
import "./target-item";

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
  private game = GameStoreService.getInstance().getGame();
  private chapters: ChapterResource[] = [];
  private expandedTargetId: string | null = null;
  private unsubscribe: (() => void) | null = null;
  
  // Static property for direct access 
  static instance: ChapterList | null = null;
  
  constructor() {
    super();
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
    
    this.shadowRoot.innerHTML = /* html */`
      <style>
        :host {
          display: block;
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
    this.addEventListener('chapter-select', this.handleChapterSelect as EventListener);
    this.addEventListener('target-toggle', this.handleTargetToggle as EventListener);
    this.addEventListener('target-select', this.handleTargetSelect as EventListener);
  }
  
  private removeEventListeners() {
    this.removeEventListener('chapter-select', this.handleChapterSelect as EventListener);
    this.removeEventListener('target-toggle', this.handleTargetToggle as EventListener);
    this.removeEventListener('target-select', this.handleTargetSelect as EventListener);
  }
  
  private handleStateChange() {
    this.updateChapters();
  }
  
  public updateChapters() {
    assert(this.game, 'Game store not initialized');
    
    // Get all chapters from the game state
    const chaptersRecord = this.game.state.chapters;
    this.chapters = Object.values(chaptersRecord);
    
    // Sort chapters by order if available, otherwise by ID
    this.chapters.sort((a, b) => {
      const aData = this.getChapterData(a.id);
      const bData = this.getChapterData(b.id);
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
      container.innerHTML = '<div class="no-chapters">No chapters available</div>';
      return;
    }
    
    // Clear the container
    container.innerHTML = '';
    
    const currentChapterId = this.game?.state.currentChapter?.id || null;
    
    // Create and append chapter and target elements
    this.chapters.forEach((chapter) => {
      const isCurrent = chapter.id === currentChapterId;
      const chapterData = this.getChapterData(chapter.id);
      
      // Create and append chapter item
      const chapterItem = document.createElement('chapter-item') as any;
      chapterItem.chapter = chapter;
      chapterItem.isCurrent = isCurrent;
      chapterItem.chapterData = chapterData;
      container.appendChild(chapterItem);
      
      // Append targets if they exist
      if (chapter.targets && chapter.targets.length > 0) {
        chapter.targets.forEach((target) => {
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
  
  private getChapterData(chapterId: string) {
    const config = gameConfig;
    if (config && config.chapters) {
      return config.chapters.find((chapter: ChapterData) => chapter.id === chapterId);
    }
    return null;
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
      this.expandedTargetId = this.expandedTargetId === targetId ? null : targetId;
      this.renderChapters();
    }
  }
  
  private handleTargetSelect(event: CustomEvent) {
    const { targetId } = event.detail;
    if (!targetId) return;
    
    // Find the chapter that contains this target
    for (const chapter of this.chapters) {
      const targetExists = chapter.targets.some(target => target.bookId === targetId);
      if (targetExists && chapter.id !== this.game?.state.currentChapter?.id) {
        this.activateChapter(chapter.id);
        break;
      }
    }
  }
  
  private activateChapter(chapterId: string) {
    if (!this.game) return;
    
    // Ask user to confirm chapter switch
    const chapterData = this.getChapterData(chapterId);
    const chapterTitle = chapterData?.title || `Chapter ${chapterId}`;
    const navigate = confirm(`Navigate to ${chapterTitle}?`);
    
    if (navigate) {
      try {
        this.game.chapters.switchChapter(chapterId);
      } catch (error) {
        console.error(`Failed to switch to chapter ${chapterId}:`, error);
        alert(`Failed to load chapter ${chapterId}. Please try again.`);
      }
    }
  }
  
  public scrollToCurrentChapter() {
    if (!this.shadowRoot || !this.game?.state.currentChapter) return;
    
    // Give the DOM time to update
    setTimeout(() => {
      const currentChapterId = this.game?.state.currentChapter?.id;
      if (currentChapterId) {
        const currentChapter = this.shadowRoot?.querySelector(`chapter-item[is-current="true"]`);
        if (currentChapter) {
          currentChapter.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 100);
  }
}

customElements.define('chapter-list', ChapterList);
