/** Split tasks into open vs completed lists for section display. */
export function splitOpenAndCompletedTasks(tasks = []) {
  const open = []
  const completed = []
  for (const task of tasks) {
    if (!(task?.title ?? '').toString().trim()) continue
    if (task.completed) completed.push(task)
    else open.push(task)
  }
  return { open, completed }
}

export function countCompletedTasks(tasks = []) {
  return splitOpenAndCompletedTasks(tasks).completed.length
}
