import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../kvBootstrap.js', () => ({
  kv: {
    get: vi.fn(),
  },
  kvAvailable: true,
}))

import { kv } from '../kvBootstrap.js'
import { resolveProfileDisplayName, enrichUserWithProfileName } from '../profileDisplayName.js'

describe('profileDisplayName', () => {
  beforeEach(() => {
    vi.mocked(kv.get).mockReset()
  })

  it('resolveProfileDisplayName reads Settings Your name', async () => {
    vi.mocked(kv.get).mockResolvedValue({
      appSettings: { profile: { displayName: 'Alex Rivera' } },
    })
    await expect(resolveProfileDisplayName('user_1')).resolves.toBe('Alex Rivera')
    expect(kv.get).toHaveBeenCalledWith('user_data_user_1')
  })

  it('enrichUserWithProfileName fills missing displayName from settings', async () => {
    vi.mocked(kv.get).mockResolvedValue({
      appSettings: { profile: { displayName: 'Sam Lee' } },
    })
    const enriched = await enrichUserWithProfileName({ uid: 'user_2', email: 'sam@example.com' })
    expect(enriched.displayName).toBe('Sam Lee')
  })

  it('enrichUserWithProfileName keeps an existing displayName', async () => {
    const enriched = await enrichUserWithProfileName({
      uid: 'user_3',
      email: 'casey@example.com',
      displayName: 'Casey',
    })
    expect(enriched.displayName).toBe('Casey')
    expect(kv.get).not.toHaveBeenCalled()
  })
})
