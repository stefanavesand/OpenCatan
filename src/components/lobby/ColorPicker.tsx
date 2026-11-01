import { useCallback } from 'react';
import { PLAYER_COLORS, COLOR_CONFIG } from '@/types';
import type { PlayerColor } from '@/types';
import styles from './lobby.module.css';

interface ColorPickerProps {
  selectedColor: PlayerColor | null;
  availableColors: readonly PlayerColor[];
  onChange: (color: PlayerColor) => void;
}

/**
 * ColorPicker - Grid of color options for player color selection
 *
 * Features:
 * - Grid of 12 color options
 * - Taken colors shown as disabled/grayed
 * - Current selection highlighted
 * - Colors: red, blue, orange, white, green, purple, black, bronze, gold, silver, pink, mysticblue
 * - Tooltips showing color names
 */
export function ColorPicker({
  selectedColor,
  availableColors,
  onChange,
}: ColorPickerProps) {
  const handleColorClick = useCallback(
    (color: PlayerColor) => {
      if (availableColors.includes(color)) {
        onChange(color);
      }
    },
    [availableColors, onChange]
  );

  return (
    <div
      className={styles.colorPickerContainer}
      role="radiogroup"
      aria-label="Select player color"
    >
      {PLAYER_COLORS.map((color) => {
        const colorInfo = COLOR_CONFIG[color];
        const isAvailable = availableColors.includes(color);
        const isSelected = color === selectedColor;

        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${colorInfo.name}${!isAvailable ? ' (taken)' : ''}`}
            className={`${styles.colorSwatch} ${isSelected ? styles.colorSwatchSelected : ''} ${
              !isAvailable ? styles.colorSwatchDisabled : ''
            }`}
            style={{ backgroundColor: colorInfo.hex }}
            onClick={() => handleColorClick(color)}
            disabled={!isAvailable}
          >
            <span className={styles.colorSwatchTooltip}>
              {colorInfo.name}
              {!isAvailable && ' (taken)'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default ColorPicker;
