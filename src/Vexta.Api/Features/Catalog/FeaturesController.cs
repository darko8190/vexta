using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vexta.Api.Services;

namespace Vexta.Api.Features.Catalog;

/// <summary>
/// What the company looking is allowed to do. Read by the browser to decide whether to draw
/// the assistant's button and the receipt-reading one — never to decide whether to allow
/// anything, which each endpoint checks for itself.
/// </summary>
[ApiController]
[Route("api/fonctionnalites")]
[Authorize]
public class FeaturesController(IFeatureService features) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<string>>> Active(CancellationToken ct) =>
        Ok(await features.ActiveKeysAsync(ct));
}
