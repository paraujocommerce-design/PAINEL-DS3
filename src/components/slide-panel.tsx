import { useEffect, useRef } from "react";
import { ClassicButton } from "@/components/w2k";

interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg" | "xl";
}

export function SlidePanel({
  isOpen,
  onClose,
  title,
  children,
  footer,
  width = "lg",
}: SlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const widthClass = {
    md: "w-96",
    lg: "w-[600px]",
    xl: "w-[800px]",
  }[width];

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed right-0 top-0 h-full ${widthClass} bg-white dark:bg-gray-950 shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="border-b dark:border-gray-800 p-4 flex justify-between items-center">
          <h2 className="text-lg font-bold">{title}</h2>
          <ClassicButton onClick={onClose}>✕</ClassicButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="border-t dark:border-gray-800 p-4 flex gap-2 justify-end">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
