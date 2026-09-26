import { describe, expect, it } from 'vitest';
import { NO_TOPIC, buildProblemBody } from '../new-problem-dialog';

const BASE = {
  title: '  Time and work  ',
  statement: '  A does work in 10 days.  ',
  questionImage: null,
  explanation: '',
  difficulty: '' as const,
  rating: '1540',
  categorySlug: 'quant',
  topicSlug: 'time-work',
  subtopicSlug: NO_TOPIC,
  examTagInput: 'ssc, banking, ssc',
  options: [
    { text: ' 5 days ', image: null, isCorrect: true },
    { text: '', image: null, isCorrect: false },
    { text: '6 days', image: null, isCorrect: false },
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

  it('attaches a question image as a QUESTION_IMAGE asset', () => {
    const body = buildProblemBody({
      ...BASE,
      questionImage: { key: 'questions/a/b.png', url: 'http://x/b.png', contentType: 'image/png', size: 12 },
    });
    expect(body).toMatchObject({
      assets: [
        { key: 'questions/a/b.png', kind: 'QUESTION_IMAGE', mimeType: 'image/png', sizeBytes: 12 },
      ],
    });
  });

  it('sends option image keys and drops empty options', () => {
    const body = buildProblemBody({
      ...BASE,
      options: [
        { text: '', image: { key: 'questions/a/o1.png', url: 'http://x/o1.png', contentType: 'image/png', size: 7 }, isCorrect: true },
        { text: '', image: null, isCorrect: false },
        { text: '6 days', image: null, isCorrect: false },
      ],
    });
    expect(body).toMatchObject({
      options: [{ assetKey: 'questions/a/o1.png', isCorrect: true }, { text: '6 days', isCorrect: false }],
    });
  });

  it('omits an empty statement when a question image carries the content', () => {
    const body = buildProblemBody({
      ...BASE,
      statement: '   ',
      questionImage: { key: 'questions/a/b.png', url: 'http://x/b.png', contentType: 'image/png', size: 12 },
    });
    expect(body).not.toHaveProperty('statement');
  });
});
