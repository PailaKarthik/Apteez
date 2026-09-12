'use client';

import { cn } from '@apteez/ui';
import type { ContestNavigatorItemDto } from '@apteez/types';

export interface QuestionNavigatorProps {
  questions: ContestNavigatorItemDto[];
  /** Zero-based active position; highlights the "current" circle. */
  currentPosition: number;
  onSelect: (position: number) => void;
  /** Solved/wrong markers (post-contest only; never live by default). */
  revealed?: boolean;
  disabled?: boolean;
  className?: string;
}

const STATE_CLASSES: Record<ContestNavigatorItemDto['state'], string> = {
  unanswered: 'border-border bg-background text-muted-foreground',
  answered: 'border-success bg-success/15 text-success',
  review: 'border-warning bg-warning/15 text-warning',
  current: 'border-primary bg-primary text-primary-foreground',
};

/**
 * Numbered question grid — 5 circles per row (the Figma layout for the
 * common 20-question contest), wrapping responsively on small screens.
 * A number maps to its question's position; states come from the server
 * session snapshot, never from client guesses.
 */
export function QuestionNavigator({
  questions,
  currentPosition,
  onSelect,
  revealed = false,
  disabled = false,
  className,
}: QuestionNavigatorProps): React.JSX.Element {
  return (
    <div
      role="navigation"
      aria-label="Question navigator"
      className={cn('grid grid-cols-5 gap-2', className)}
      data-testid="question-navigator"
    >
      {questions.map((question) => {
        const isCurrent = question.position === currentPosition;
        const classes = isCurrent ? 'current' : question.state;
        const correctnessTone =
          revealed && question.correctness === 'correct'
            ? 'border-success bg-success/15 text-success'
            : revealed && question.correctness === 'incorrect'
              ? 'border-destructive bg-destructive/15 text-destructive'
              : null;
        return (
          <button
            key={question.questionId}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(question.position)}
            aria-current={isCurrent ? 'true' : undefined}
            aria-label={`Question ${question.position + 1}${
              question.state === 'answered'
                ? ', answered'
                : question.state === 'review'
                  ? ', marked for review'
                  : ''
            }`}
            className={cn(
              'flex aspect-square items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-fast',
              correctnessTone ?? STATE_CLASSES[classes],
              !disabled && !isCurrent && 'cursor-pointer hover:opacity-80',
              disabled && 'cursor-default',
            )}
            data-testid={`navigator-item-${question.position}`}
            data-state={isCurrent ? 'current' : question.state}
          >
            {question.position + 1}
          </button>
        );
      })}
    </div>
  );
}
