import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { TaskPanel } from "@/features/tasks";

export const Route = createFileRoute("/_authenticated/tasks/$taskId")({
  component: function TaskPanelPage() {
    const { taskId } = Route.useParams();
    const navigate = useNavigate();
    return <TaskPanel taskId={taskId} onClose={() => void navigate({ to: "/tasks" })} />;
  },
});
