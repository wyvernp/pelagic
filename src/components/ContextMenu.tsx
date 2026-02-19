import { useEffect, useRef, useCallback } from 'react';
import './ContextMenu.css';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  submenu?: ContextMenuItem[];
}

export interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ isOpen, x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    // Adjust horizontal position
    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }

    // Adjust vertical position
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    menu.style.left = `${Math.max(8, adjustedX)}px`;
    menu.style.top = `${Math.max(8, adjustedY)}px`;
  }, [isOpen, x, y]);

  const handleItemClick = useCallback((item: ContextMenuItem) => {
    if (item.disabled || item.submenu) return;
    item.onClick();
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div 
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => (
        <div key={index} className="context-menu-item-wrapper">
          <button
            className={`context-menu-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''} ${item.submenu ? 'has-submenu' : ''}`}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
          >
            {item.icon && <span className="context-menu-icon">{item.icon}</span>}
            <span className="context-menu-label">{item.label}</span>
            {item.submenu && (
              <svg className="context-menu-arrow" viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
              </svg>
            )}
          </button>
          {item.submenu && (
            <div ref={submenuRef} className="context-submenu">
              {item.submenu.map((subItem, subIndex) => (
                <button
                  key={subIndex}
                  className={`context-menu-item ${subItem.danger ? 'danger' : ''} ${subItem.disabled ? 'disabled' : ''}`}
                  onClick={() => {
                    if (!subItem.disabled) {
                      subItem.onClick();
                      onClose();
                    }
                  }}
                  disabled={subItem.disabled}
                >
                  {subItem.icon && <span className="context-menu-icon">{subItem.icon}</span>}
                  <span className="context-menu-label">{subItem.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
