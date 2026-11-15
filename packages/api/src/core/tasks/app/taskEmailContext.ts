/** What a task email gets from whoever sends it, besides the task's own values. */
export interface TaskEmailContext {
  recipientEmail: string;
  linkOrigin: string;
  companyName: string;
}
