import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Page } from './page';

// Create a concrete implementation for testing
class TestPage extends Page {
    public setupEventListeners(): void {
        super.setupEventListeners();
    }
    public cleanupEventListeners(): void {
        super.cleanupEventListeners();
    }
    protected get styles(): string {
        return /* css */ `
            .test-content {
                color: red;
            }
        `;
    }
}

// Register the custom element
customElements.define('test-page', TestPage);

describe('Page Component', () => {
    let page: TestPage;

    beforeEach(() => {
        page = document.createElement('test-page') as TestPage;
        document.body.appendChild(page);
    });

    afterEach(() => {
        page.remove();
    });

    it('should initialize with default state', () => {
        expect(page.active).toBe(false);
        expect(page.style.visibility).toBe('hidden');
    });

    it('should update visibility when active state changes', () => {
        page.active = true;
        
        expect(page.active).toBe(true);
        expect(page.style.visibility).toBe('visible');
        expect(page.getAttribute('active')).toBe('true');
    });

    it('should render shadow DOM content', () => {
        const shadow = page.shadowRoot!;
        
        // Check if styles are rendered
        const style = shadow.querySelector('style');
        expect(style).toBeTruthy();
        expect(style?.textContent).toContain('position: fixed');
        expect(style?.textContent).toContain('color: red');

        // Check if template content is rendered
        const content = shadow.querySelector('.content');
        expect(content).toBeTruthy();
        expect(content?.innerHTML).toContain('<slot></slot>');
    });

    it('should respond to attribute changes', () => {
        page.setAttribute('active', 'true');
        
        expect(page.active).toBe(true);
        expect(page.style.visibility).toBe('visible');
        expect(page.classList.contains('active')).toBe(true);
    });

    it('should properly clean up on disconnect', () => {
        const cleanupSpy = vi.spyOn(page, 'cleanupEventListeners');
        
        page.remove();
        
        expect(cleanupSpy).toHaveBeenCalled();
    });
});