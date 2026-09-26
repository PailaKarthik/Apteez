import { AiToolRegistry } from './ai-tool-registry';

function createService() {
  const tools = {
    getUserPerformance: jest.fn().mockResolvedValue({ overall: {} }),
    getTopicPerformance: jest.fn().mockResolvedValue([]),
    getRecentSubmissions: jest.fn().mockResolvedValue([]),
    getChallengeHistory: jest.fn().mockResolvedValue([]),
    getContestHistory: jest.fn().mockResolvedValue([]),
    getLearningProgress: jest.fn().mockResolvedValue({}),
    getWeakAreas: jest.fn().mockResolvedValue([]),
    getProblemsForTopic: jest.fn().mockResolvedValue([]),
  };
  return { service: new AiToolRegistry(tools as never), tools };
}

describe('AiToolRegistry', () => {
  it('rejects unknown tools', async () => {
    const { service } = createService();
    await expect(service.execute('u1', 'dropTables', {})).rejects.toThrow('Unknown AI tool');
  });

  it('rejects invalid input before touching services', async () => {
    const { service, tools } = createService();
    await expect(service.execute('u1', 'getRecentSubmissions', { limit: 9999 })).rejects.toThrow(
      'Invalid input',
    );
    expect(tools.getRecentSubmissions).not.toHaveBeenCalled();
  });

  it('delegates validated calls with the explicit authorized userId', async () => {
    const { service, tools } = createService();
    await service.execute('u1', 'getWeakAreas', {});
    expect(tools.getWeakAreas).toHaveBeenCalledWith('u1');
    await service.execute('u1', 'getRecentSubmissions', { limit: 10 });
    expect(tools.getRecentSubmissions).toHaveBeenCalledWith('u1', 10);
  });

  it('exposes exactly the eight approved tools', () => {
    const { service } = createService();
    const names = service
      .definitions()
      .map((definition) => definition.name)
      .sort();
    expect(names).toEqual(
      [
        'getChallengeHistory',
        'getContestHistory',
        'getLearningProgress',
        'getProblemsForTopic',
        'getRecentSubmissions',
        'getTopicPerformance',
        'getUserPerformance',
        'getWeakAreas',
      ].sort(),
    );
  });
});
