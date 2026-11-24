using Microsoft.EntityFrameworkCore;
using Vexta.Api.Data;

namespace Vexta.Api.Features.Projects;

/// <summary>
/// Attaching a line of a job — hours, a material, an expense, an extra charge — to one of that
/// job's tasks.
///
/// One place, because four controllers now ask the same question and a fifth will. What it
/// guards against is a task id from somewhere else: the tenant filter already keeps another
/// company's tasks out of reach, but nothing stops a browser sending a task of *this* company's
/// other project, and a task whose totals quietly gather another job's costs is worse than one
/// with no totals at all.
/// </summary>
public static class ProjectTaskLink
{
    /// <summary>
    /// Checks a requested task belongs to this project.
    /// </summary>
    /// <returns>
    /// The error to answer with, or null when there is nothing wrong — including when no task
    /// was asked for, which is the ordinary case: most lines belong to the job and not to a
    /// named task.
    /// </returns>
    public static async Task<string?> ProblemAsync(
        VextaDbContext db, Guid projectId, Guid? taskId, CancellationToken ct)
    {
        if (taskId is not { } id) return null;

        var belongs = await db.ProjectTasks.AsNoTracking()
            .AnyAsync(t => t.Id == id && t.ProjectId == projectId, ct);

        return belongs ? null : "Cette tâche n'appartient pas à ce projet.";
    }
}
