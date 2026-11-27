namespace Vexta.Api.Domain;

/// <summary>
/// A kind of job kept to start new projects from: its description, its tasks, and the
/// materials, equipment, assemblies and extra charges it usually takes. A copy, not a link:
/// projects made from it keep their own lines, and changing the template restates none of them.
/// </summary>
public class ProjectTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Name { get; set; }
    public string? Description { get; set; }

    public Guid? CategoryId { get; set; }
    public Guid? SubCategoryId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<ProjectTemplateLine> Lines { get; set; } = [];
}

public enum ProjectTemplateLineKind
{
    Tache = 0,
    Materiel = 1,
    Equipement = 2,
    Assemblage = 3,
    Frais = 4
}

/// <summary>One line of a project template, in the one shape all its kinds fit.</summary>
public class ProjectTemplateLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public Guid TemplateId { get; set; }
    public ProjectTemplate? Template { get; set; }

    public ProjectTemplateLineKind Kind { get; set; }

    /// <summary>The product, equipment or assembly the line came from, by kind.</summary>
    public Guid? ProductId { get; set; }
    public Guid? EquipmentId { get; set; }
    public Guid? AssemblyId { get; set; }

    public string? Code { get; set; }
    public required string Description { get; set; }
    public string? Unit { get; set; }

    /// <summary>Hours estimated for a task, units for the rest.</summary>
    public decimal Quantity { get; set; } = 1;
    public decimal? UnitCost { get; set; }
    public decimal UnitPrice { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>
/// A line added by itself to every new invoice: an administration fee, an environmental charge.
/// Set in Paramètres → Facturation; the invoice can still lose it before it is sent.
/// </summary>
public class InvoiceAutoFee
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }

    public required string Description { get; set; }
    public decimal Quantity { get; set; } = 1;
    public decimal UnitPrice { get; set; }
    public bool IsTaxable { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
