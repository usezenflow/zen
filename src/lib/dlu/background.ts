import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

const NAME = "dlu-sync";
const MIN_INTERVAL_MINUTES = 30;

export async function stopBackgroundSync(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(NAME)) await BackgroundTask.unregisterTaskAsync(NAME);
}

/** Defines (at module load, as the OS requires) and registers the periodic task. iOS runs it when it chooses. */
export async function registerBackgroundSync(run: () => Promise<void>): Promise<void> {
  if (!TaskManager.isTaskDefined(NAME)) {
    TaskManager.defineTask(NAME, async () => {
      try {
        await run();
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  }
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!(await TaskManager.isTaskRegisteredAsync(NAME))) {
    await BackgroundTask.registerTaskAsync(NAME, { minimumInterval: MIN_INTERVAL_MINUTES });
  }
}
