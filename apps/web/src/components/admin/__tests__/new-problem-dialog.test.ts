import { describe, expect, it } from 'vitest';
import { NO_TOPIC, buildProblemBody } from '../new-problem-dialog';

const BASE = {
  title: '  Time and work  ',
  statement: '  A does work in 10 days.  ',
  explanation: '',
  difficulty: '' as const,
  rating: '1540',
  categorySlug: 'quant',
  topicSlug: 'time-work',
  subtopicSlug: NO_TOPIC,
  examTagInput: 'ssc, banking, ssc',
  options: [
    { text: ' 5 days ', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '6 days', isCorrect: false },
  ],
};

describe('buildProblemBody', () => {
  it('trims text, rounds the rating, dedupes exams and publishes', () => {
    expect(buildProblemBody(BASE)).toEqual({
      title: 'Time and work',
      statement: 'A does work in 10 days.',
      rating: 1500,
      categorySlug: 'quant',
      topicSlug: 'time-work',
      examTagSlugs: ['ssc', 'banking'],
      options: [
        { text: '5 days', isCorrect: true },
        { text: '6 days', isCorrect: false },
      ],
    });
  });

  it('omits topic and subtopic when none is picked', () => {
    const body = buildProblemBody({ ...BASE, topicSlug: NO_TOPIC, subtopicSlug: 'x' });
    expect(body).not.toHaveProperty('topicSlug');
    expect(body).not.toHaveProperty('subtopicSlug');
  });

  it('never sends a subtopic without its topic', () => {
    const body = buildProblemBody({ ...BASE, subtopicSlug: 'daily-wage' });
    expect(body).toMatchObject({ topicSlug: 'time-work', subtopicSlug: 'daily-wage' });
    const orphan = buildProblemBody({ ...BASE, topicSlug: NO_TOPIC, subtopicSlug: 'daily-wage' });
    expect(orphan).not.toHaveProperty('subtopicSlug');
  });

  it('keeps an explicit difficulty', () => {
    const body = buildProblemBody({ ...BASE, difficulty: 'HARD' });
    expect(body).toMatchObject({ difficulty: 'HARD' });
    expect(body).not.toHaveProperty('publish');
  });
});
