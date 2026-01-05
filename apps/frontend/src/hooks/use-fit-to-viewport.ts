'use client';

import { useRef, useState, useEffect, useMemo, useCallback } from 'react';

interface UseFitToViewportOptions {
  /** Height of each row in pixels */
  rowHeight: number;
  /** Height of the table header in pixels */
  headerHeight?: number;
  /** Height of pagination controls in pixels */
  paginationHeight?: number;
  /** Gap between rows in pixels */
  gap?: number;
  /** Minimum number of rows to show */
  minRows?: number;
  /** Maximum number of rows to show */
  maxRows?: number;
  /** Debounce delay for resize events in ms */
  debounceMs?: number;
}

interface UseFitToViewportResult<T extends HTMLElement> {
  /** Ref to attach to the container element */
  containerRef: React.RefObject<T | null>;
  /** Calculated page size based on available height */
  pageSize: number;
  /** Current container height */
  containerHeight: number;
  /** Whether the initial measurement is complete */
  isReady: boolean;
}

/**
 * Hook that calculates optimal page size based on container height.
 * Enables "fit to viewport" pagination where content auto-paginates
 * instead of scrolling.
 */
export function useFitToViewport<T extends HTMLElement = HTMLDivElement>({
  rowHeight,
  headerHeight = 0,
  paginationHeight = 48,
  gap = 0,
  minRows = 3,
  maxRows = 100,
  debounceMs = 100,
}: UseFitToViewportOptions): UseFitToViewportResult<T> {
  const containerRef = useRef<T>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced height update
  const updateHeight = useCallback(
    (height: number) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setContainerHeight(height);
      }, debounceMs);
    },
    [debounceMs]
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        updateHeight(entry.contentRect.height);
      }
    });

    observer.observe(element);

    // Initial measurement (immediate, not debounced)
    setContainerHeight(element.offsetHeight);
    setIsReady(true);

    return () => {
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [updateHeight]);

  const pageSize = useMemo(() => {
    if (!isReady || containerHeight === 0) return minRows;

    const availableHeight = containerHeight - headerHeight - paginationHeight;
    const rowWithGap = rowHeight + gap;
    const calculated = Math.floor(availableHeight / rowWithGap);

    return Math.min(Math.max(calculated, minRows), maxRows);
  }, [containerHeight, isReady, rowHeight, headerHeight, paginationHeight, gap, minRows, maxRows]);

  return {
    containerRef,
    pageSize,
    containerHeight,
    isReady,
  };
}

/**
 * Helper hook for managing pagination state with fit-to-viewport
 */
export function useFitToViewportPagination<T>(data: T[], pageSize: number) {
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));

  // Reset to valid page if current page is out of bounds
  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [currentPage, totalPages]);

  const paginatedData = useMemo(() => {
    const start = currentPage * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, currentPage, pageSize]);

  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(0, Math.min(page, totalPages - 1)));
    },
    [totalPages]
  );

  const nextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(p + 1, totalPages - 1));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(p - 1, 0));
  }, []);

  const firstPage = useCallback(() => {
    setCurrentPage(0);
  }, []);

  const lastPage = useCallback(() => {
    setCurrentPage(totalPages - 1);
  }, [totalPages]);

  return {
    currentPage,
    totalPages,
    paginatedData,
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    hasNextPage: currentPage < totalPages - 1,
    hasPrevPage: currentPage > 0,
    startIndex: currentPage * pageSize,
    endIndex: Math.min((currentPage + 1) * pageSize, data.length),
    totalItems: data.length,
  };
}
