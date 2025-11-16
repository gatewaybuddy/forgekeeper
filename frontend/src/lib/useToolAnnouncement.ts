import { useEffect, useRef } from 'react';

/**
 * Hook for announcing tool execution status to screen readers.
 * Creates an aria-live region that announces messages without disrupting the user.
 */
export function useToolAnnouncement() {
  const liveRegionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create aria-live region on mount
    const region = document.createElement('div');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('role', 'status');
    region.style.position = 'absolute';
    region.style.left = '-10000px';
    region.style.width = '1px';
    region.style.height = '1px';
    region.style.overflow = 'hidden';
    document.body.appendChild(region);
    liveRegionRef.current = region;

    return () => {
      // Cleanup on unmount
      if (liveRegionRef.current) {
        document.body.removeChild(liveRegionRef.current);
        liveRegionRef.current = null;
      }
    };
  }, []);

  const announce = (message: string) => {
    if (!liveRegionRef.current) return;

    // Clear the region first to ensure the announcement is picked up
    liveRegionRef.current.textContent = '';

    // Use a small delay to ensure screen readers pick up the change
    setTimeout(() => {
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = message;
      }
    }, 100);
  };

  return { announce };
}

/**
 * Formats a tool success announcement for screen readers.
 */
export function formatToolSuccessAnnouncement(toolName: string, elapsedMs?: number): string {
  const timing = elapsedMs !== undefined ? ` in ${elapsedMs} milliseconds` : '';
  return `Tool ${toolName} completed successfully${timing}`;
}

/**
 * Formats a tool error announcement for screen readers.
 */
export function formatToolErrorAnnouncement(toolName: string, error: string): string {
  return `Tool ${toolName} failed: ${error}`;
}
