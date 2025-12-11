import * as React from "react";
import { Input, InputProps } from "./input";
import { 
  formatPhoneInternational, 
  getDigitsBeforePosition, 
  getPositionForDigitCount 
} from "@/utils/phoneFormatter";

export interface PhoneInputProps extends Omit<InputProps, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    
    // Combine refs
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const cursorPosition = input.selectionStart || 0;
      const newValue = e.target.value;
      
      // Calculate how many digits are before the cursor
      const digitsBeforeCursor = getDigitsBeforePosition(newValue, cursorPosition);
      
      // Format the new value
      const formatted = formatPhoneInternational(newValue);
      
      // Find the new cursor position
      const newCursorPosition = getPositionForDigitCount(formatted, digitsBeforeCursor);
      
      onChange(formatted);
      
      // Restore cursor position after React updates the DOM
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
        }
      });
    };

    return (
      <Input
        ref={inputRef}
        type="tel"
        value={value}
        onChange={handleChange}
        {...props}
      />
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
