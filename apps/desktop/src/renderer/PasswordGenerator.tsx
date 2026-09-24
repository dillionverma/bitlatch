import { useEffect, useId, useState } from 'react';
import { ArrowsClockwise, MagicWand } from '@phosphor-icons/react';
import { defaultPasswordOptions, type PasswordOptions } from '@latch/shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldError,
} from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  PopoverTrigger,
} from '@/components/ui/popover';

const characterTypes = [
  ['uppercase', 'Uppercase', 'A–Z'],
  ['lowercase', 'Lowercase', 'a–z'],
  ['numbers', 'Numbers', '0–9'],
  ['symbols', 'Symbols', '!@#$%&*-_=+'],
] as const;

export function PasswordGenerator({
  disabled,
  onUse,
}: {
  disabled: boolean;
  onUse: (password: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(defaultPasswordOptions);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    value: string;
    options: PasswordOptions;
    revision: number;
  } | null>(null);
  const [error, setError] = useState('');
  const password = result?.options === options && result.revision === revision ? result.value : '';
  const generating = open && !password && !error;
  const selectedTypes = characterTypes.filter(([key]) => options[key]).length;

  useEffect(() => {
    if (!open) {
      setResult(null);
      return;
    }
    let active = true;
    setError('');
    void window.latch
      .generate(options)
      .then((response) => {
        if (!active) return;
        if (response.ok) setResult({ value: response.value, options, revision });
        else setError(response.error);
      })
      .catch(() => {
        if (active) setError('Could not generate a password. Try again.');
      });
    return () => {
      active = false;
    };
  }, [open, options, revision]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <MagicWand data-icon="inline-start" /> Generate…
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="right"
        sideOffset={12}
        collisionPadding={16}
        className="w-80 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-4"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // The popover is inside the editor form; Enter must never save the item.
          if (event.key === 'Enter') event.stopPropagation();
        }}
      >
        <PopoverHeader>
          <PopoverTitle id={`${id}-title`}>Password generator</PopoverTitle>
          <PopoverDescription id={`${id}-description`}>
            Choose what goes into your password.
          </PopoverDescription>
        </PopoverHeader>
        <Field>
          <FieldLabel htmlFor={`${id}-preview`}>Preview</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-preview`}
              aria-busy={generating}
              readOnly
              value={password}
              placeholder={generating ? 'Generating…' : ''}
              className="min-w-0 font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Regenerate password"
              disabled={generating}
              onClick={() => setRevision((value) => value + 1)}
            >
              {generating ? <Spinner /> : <ArrowsClockwise />}
            </Button>
          </div>
          {error && <FieldError role="alert">{error}</FieldError>}
        </Field>
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor={`${id}-length`}>Length</FieldLabel>
            <output htmlFor={`${id}-length`} className="text-muted-foreground tabular-nums">
              {options.length} characters
            </output>
          </div>
          <input
            id={`${id}-length`}
            type="range"
            min={8}
            max={128}
            value={options.length}
            className="h-5 w-full accent-foreground"
            onChange={(event) => setOptions({ ...options, length: Number(event.target.value) })}
          />
        </Field>
        <div className="flex flex-col gap-3">
          {characterTypes.map(([key, label, hint]) => (
            <Field key={key} orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={`${id}-${key}`}>
                  {label}{' '}
                  <span className="font-mono font-normal text-muted-foreground">{hint}</span>
                </FieldLabel>
              </FieldContent>
              <Switch
                id={`${id}-${key}`}
                checked={options[key]}
                disabled={selectedTypes === 1 && options[key]}
                onCheckedChange={(checked) => setOptions({ ...options, [key]: checked })}
              />
            </Field>
          ))}
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`${id}-ambiguous`}>Easy to read</FieldLabel>
              <FieldDescription>Avoid similar characters like I, l, 1, O and 0.</FieldDescription>
            </FieldContent>
            <Switch
              id={`${id}-ambiguous`}
              checked={options.excludeAmbiguous}
              onCheckedChange={(checked) => setOptions({ ...options, excludeAmbiguous: checked })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!password || disabled}
            onClick={() => {
              onUse(password);
              setOpen(false);
            }}
          >
            Use password
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
