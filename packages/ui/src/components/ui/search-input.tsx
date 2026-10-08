'use client';

import { Search, X, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../lib/utils';

export interface SearchInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  /** Accessible label — required; visually hidden unless `hideLabel` is false. */
  label: string;
  hideLabel?: boolean;
  /** Optional trailing icon button (e.g. a filter). */
  trailingIcon?: LucideIcon;
  onTrailingClick?: () => void;
}

/** Search field with leading icon and a clear affordance, keyboard-ready. */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      label,
      hideLabel = true,
      className,
      trailingIcon: TrailingIcon,
      onTrailingClick,
      value: externalValue,
      defaultValue,
      onChange,
      id,
      ...rest
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const inputId = React.useId();
    const resolvedId = id ?? inputId;
    const [value, setValue] = React.useState<string>(String(externalValue ?? defaultValue ?? ''));

    React.useEffect(() => {
      if (externalValue !== undefined) {
        setValue(String(externalValue));
      }
    }, [externalValue]);

    const assignRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }
      },
      [ref],
    );

    const clear = (): void => {
      const node = inputRef.current;
      setValue('');
      if (node) {
        // Push the empty value through React's change pipeline so
        // controlled parents (which only listen to onChange) actually
        // update — otherwise the text snaps right back.
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(node, '');
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.focus();
      }
    };

    return (
      <div className={cn('relative w-full', className)}>
        {hideLabel ? null : (
          <label htmlFor={resolvedId} className="mb-1.5 block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <Search
          className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={assignRef}
          id={resolvedId}
          type="search"
          aria-label={label}
          className="h-control w-full rounded-lg border border-input bg-elevated pl-9 pr-9 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          {...rest}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            onChange?.(event);
          }}
        />
        {value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute bottom-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : TrailingIcon ? (
          <button
            type="button"
            onClick={onTrailingClick}
            aria-label="Filter"
            className="absolute bottom-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <TrailingIcon className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  },
);
SearchInput.displayName = 'SearchInput';
