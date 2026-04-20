/**
 * Utility functions for managing background skip trace jobs
 * Jobs are stored in localStorage and polled in the background
 */

const STORAGE_KEY = 'skip_trace_jobs'

const getSkipTraceJobs = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error getting skip trace jobs:', error)
    return []
  }
}

const saveSkipTraceJobs = (jobs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
  } catch (error) {
    console.error('Error saving skip trace jobs:', error)
  }
}

export const addSkipTraceJob = (job) => {
  const jobs = getSkipTraceJobs()
  const jobId = job.jobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

  const newJob = {
    jobId,
    listId: job.listId,
    listName: job.listName,
    isPublic: job.isPublic || false,
    parcelsToTrace: job.parcelsToTrace || [],
    createdAt: job.createdAt || new Date().toISOString(),
    status: job.status || 'pending',
    results: null,
    error: null,
    completedAt: null
  }

  jobs.push(newJob)
  saveSkipTraceJobs(jobs)
  return jobId
}

export const updateSkipTraceJob = (jobId, updates) => {
  const jobs = getSkipTraceJobs()
  const index = jobs.findIndex(j => j.jobId === jobId)

  if (index === -1) {
    console.warn('Job not found:', jobId)
    return false
  }

  jobs[index] = {
    ...jobs[index],
    ...updates,
    ...(updates.status === 'completed' || updates.status === 'failed' ? {
      completedAt: updates.completedAt || new Date().toISOString()
    } : {})
  }

  saveSkipTraceJobs(jobs)
  return true
}

export const removeSkipTraceJob = (jobId) => {
  const jobs = getSkipTraceJobs()
  const filtered = jobs.filter(j => j.jobId !== jobId)
  saveSkipTraceJobs(filtered)
}

export const getPendingSkipTraceJobs = () => {
  const jobs = getSkipTraceJobs()
  return jobs.filter(j => j.status === 'pending' || j.status === 'processing')
}

/** Clean up completed/failed jobs older than 24 hours. */
export const cleanupOldJobs = () => {
  const jobs = getSkipTraceJobs()
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000)

  const filtered = jobs.filter(job => {
    if (job.status === 'completed' || job.status === 'failed') {
      const completedAt = job.completedAt ? new Date(job.completedAt).getTime() : 0
      return completedAt > oneDayAgo
    }
    return true
  })

  if (filtered.length < jobs.length) {
    saveSkipTraceJobs(filtered)
  }
}
