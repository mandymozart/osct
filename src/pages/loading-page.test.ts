import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../loading-page';

describe('LoadingPage', () => {
    let loading: HTMLElement;

    beforeEach(() => {
        loading = document.createElement('loading-page');
        document.body.appendChild(loading);
    });

    it('should show loading with default message', () => {
        (loading as any).showLoading();
        expect(loading.shadowRoot?.querySelector('.loading')?.textContent).toContain('Loading');
        expect(loading.getAttribute('active')).toBe('true');
    });

    it('should show custom loading message', () => {
        (loading as any).showLoading('Custom loading...');
        expect(loading.shadowRoot?.querySelector('.loading')?.textContent).toContain('Custom loading');
    });

    it('should auto-hide after duration', () => {
        vi.useFakeTimers();
        (loading as any).showLoading('Test', 1000);
        
        expect(loading.getAttribute('active')).toBe('true');
        
        vi.advanceTimersByTime(1000);
        expect(loading.getAttribute('active')).toBe('false');
        
        vi.useRealTimers();
    });

    it('should manually hide loading', () => {
        (loading as any).showLoading();
        (loading as any).hideLoading();
        expect(loading.getAttribute('active')).toBe('false');
    });
});