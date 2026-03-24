/**
 * Utility functions for managing background skip trace jobs
 * Jobs are stored in localStorage and polled in the background
 */

const STORAGE_KEY = 'skip_trace_jobs'

/**
 * Get all pending/active jobs
 * @returns {Array} Array of job objects
 */
export const getSkipTraceJobs = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error getting skip trace jobs:', error)
    return []
  }
}

/**
 * Save jobs array to localStorage
 * @param {Array} jobs - Array of job objects
 */
const saveSkipTraceJobs = (jobs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
  } catch (error) {
    console.error('Error saving skip trace jobs:', error)
  }
}

/**
 * Add a new job to track
 * @param {Object} job - Job object with { jobId, listId, listName, isPublic, parcelsToTrace, createdAt, status }
 * @returns {string} Job ID
 */
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
    status: job.status || 'pending', // pending, processing, completed, failed
    results: null,
    error: null,
    completedAt: null
  }
  
  jobs.push(newJob)
  saveSkipTraceJobs(jobs)
  console.log('📋 Added skip trace job:', jobId, 'for list:', job.listName)
  window.dispatchEvent(new CustomEvent('skipTraceJobAdded'))
  return jobId
}

/**
 * Update a job's status
 * @param {string} jobId - Job ID
 * @param {Object} updates - Updates to apply { status, results, error, completedAt }
 */
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
  console.log('📋 Updated skip trace job:', jobId, 'status:', updates.status)
  return true
}

/**
 * Get a specific job by ID
 * @param {string} jobId - Job ID
 * @returns {Object|null} Job object or null
 */
export const getSkipTraceJob = (jobId) => {
  const jobs = getSkipTraceJobs()
  return jobs.find(j => j.jobId === jobId) || null
}

/**
 * Remove a completed/failed job (cleanup)
 * @param {string} jobId - Job ID
 */
export const removeSkipTraceJob = (jobId) => {
  const jobs = getSkipTraceJobs()
  const filtered = jobs.filter(j => j.jobId !== jobId)
  saveSkipTraceJobs(filtered)
  console.log('📋 Removed skip trace job:', jobId)
}

/**
 * Get pending jobs (status: pending or processing)
 * @returns {Array} Array of pending job objects
 */
export const getPendingSkipTraceJobs = () => {
  const jobs = getSkipTraceJobs()
  return jobs.filter(j => j.status === 'pending' || j.status === 'processing')
}

/**
 * Clean up old completed jobs (older than 24 hours)
 */
export const cleanupOldJobs = () => {
  const jobs = getSkipTraceJobs()
  const now = Date.now()
  const oneDayAgo = now - (24 * 60 * 60 * 1000)
  
  const filtered = jobs.filter(job => {
    if (job.status === 'completed' || job.status === 'failed') {
      const completedAt = job.completedAt ? new Date(job.completedAt).getTime() : 0
      return completedAt > oneDayAgo
    }
    return true // Keep pending/processing jobs
  })
  
  if (filtered.length < jobs.length) {
    saveSkipTraceJobs(filtered)
    console.log(`🧹 Cleaned up ${jobs.length - filtered.length} old skip trace jobs`)
  }
}
