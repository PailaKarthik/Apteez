import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProblemAssetDto, ProblemOptionDto } from '@apteez/types';
import { OptionRenderer } from '../option-renderer';
import { QuestionRenderer } from '../question-renderer';

afterEach(cleanup);

const imageAsset: ProblemAssetDto = {
  id: 'asset-1',
  kind: 'QUESTION_IMAGE',
  url: 'http://localhost:3001/api/v1/storage/seed/diagram.svg',
  mimeType: 'image/svg+xml',
  position: 0,
  altText: 'Rotating polygons',
};

describe('QuestionRenderer', () => {
  it('renders text-only questions', () => {
    render(<QuestionRenderer statement="What is 2 + 2?" assets={[]} />);
    expect(screen.getByText('What is 2 + 2?')).toBeDefined();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders image-only questions without an empty text block', () => {
    render(<QuestionRenderer statement={null} assets={[imageAsset]} />);
    const image = screen.getByRole('img');
    expect(image.getAttribute('alt')).toBe('Rotating polygons');
    expect(screen.queryByText(/What is/)).toBeNull();
  });

  it('renders text and image together', () => {
    render(<QuestionRenderer statement="Study the figure." assets={[imageAsset]} />);
    expect(screen.getByText('Study the figure.')).toBeDefined();
    expect(screen.getByRole('img')).toBeDefined();
  });

  it('skips assets without a resolved URL', () => {
    render(<QuestionRenderer statement="Text only" assets={[{ ...imageAsset, url: '' }]} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Text only')).toBeDefined();
  });
});

function makeOption(overrides: Partial<ProblemOptionDto> = {}): ProblemOptionDto {
  return {
    id: 'option-1',
    position: 0,
    text: 'Seven days',
    assetUrl: null,
    ...overrides,
  };
}

describe('OptionRenderer', () => {
  it('renders text options with their letter', () => {
    render(<OptionRenderer option={makeOption()} />);
    expect(screen.getByText('Seven days')).toBeDefined();
    expect(screen.getByText('A')).toBeDefined();
  });

  it('renders image-backed options', () => {
    render(
      <OptionRenderer
        option={makeOption({ id: 'option-3', position: 2, text: null, assetUrl: 'http://x/y.png' })}
      />,
    );
    expect(screen.getByRole('img').getAttribute('alt')).toBe('Option C');
  });

  it('renders text and image options together', () => {
    render(<OptionRenderer option={makeOption({ assetUrl: 'http://x/y.png' })} />);
    expect(screen.getByText('Seven days')).toBeDefined();
    expect(screen.getByRole('img')).toBeDefined();
  });

  it('reports selection without knowing correctness', () => {
    const onSelect = vi.fn();
    render(<OptionRenderer option={makeOption()} selected onSelect={onSelect} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith('option-1');
  });

  it('is inert when no selection handler is provided', () => {
    render(<OptionRenderer option={makeOption()} />);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });
});
