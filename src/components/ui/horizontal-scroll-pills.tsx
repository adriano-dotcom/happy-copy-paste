import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface HorizontalScrollPillsProps {
  children: React.ReactNode;
  className?: string;
  showArrows?: boolean;
}

export function HorizontalScrollPills({
  children,
  className,
  showArrows = true,
}: HorizontalScrollPillsProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const el = containerRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    }
  }, []);

  // Initialize and update on resize/content changes
  React.useEffect(() => {
    updateScrollState();
    
    const el = containerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    
    // Also observe children for dynamic content
    const mutationObserver = new MutationObserver(updateScrollState);
    mutationObserver.observe(el, { childList: true, subtree: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [updateScrollState]);

  // Convert vertical wheel scroll to horizontal
  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    const el = containerRef.current;
    if (!el) return;
    
    // Only handle if there's horizontal overflow
    if (el.scrollWidth <= el.clientWidth) return;
    
    // Prevent vertical page scroll and scroll horizontally
    e.preventDefault();
    el.scrollLeft += e.deltaY;
    updateScrollState();
  }, [updateScrollState]);

  // Smooth scroll to direction
  const scrollTo = React.useCallback((direction: 'left' | 'right') => {
    const el = containerRef.current;
    if (!el) return;
    
    const scrollAmount = el.clientWidth * 0.6;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
    
    // Update state after animation
    setTimeout(updateScrollState, 300);
  }, [updateScrollState]);

  return (
    <div 
      className={cn("relative group", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left fade gradient */}
      <div 
        className={cn(
          "absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none transition-opacity duration-200",
          "bg-gradient-to-r from-slate-950 to-transparent",
          canScrollLeft ? "opacity-100" : "opacity-0"
        )}
      />
      
      {/* Right fade gradient */}
      <div 
        className={cn(
          "absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none transition-opacity duration-200",
          "bg-gradient-to-l from-slate-950 to-transparent",
          canScrollRight ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Left arrow button */}
      {showArrows && canScrollLeft && (
        <button
          onClick={() => scrollTo('left')}
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 z-20 p-1 rounded-full transition-all duration-200",
            "bg-slate-800/90 backdrop-blur-sm border border-slate-700/50 text-slate-300",
            "hover:bg-slate-700 hover:text-white hover:scale-110",
            "shadow-lg shadow-black/20",
            isHovered ? "opacity-100" : "opacity-0"
          )}
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* Right arrow button */}
      {showArrows && canScrollRight && (
        <button
          onClick={() => scrollTo('right')}
          className={cn(
            "absolute right-0 top-1/2 -translate-y-1/2 z-20 p-1 rounded-full transition-all duration-200",
            "bg-slate-800/90 backdrop-blur-sm border border-slate-700/50 text-slate-300",
            "hover:bg-slate-700 hover:text-white hover:scale-110",
            "shadow-lg shadow-black/20",
            isHovered ? "opacity-100" : "opacity-0"
          )}
          aria-label="Scroll right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Scrollable container */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onScroll={updateScrollState}
        className={cn(
          "flex items-center gap-2 overflow-x-auto pb-1",
          // Subtle visible scrollbar on hover
          "scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent",
          "hover:scrollbar-thumb-slate-600"
        )}
        style={{
          // Enable momentum scrolling on touch devices
          WebkitOverflowScrolling: 'touch',
          // Hide default scrollbar but keep functionality
          scrollbarWidth: 'thin',
        }}
      >
        {children}
      </div>
    </div>
  );
}
