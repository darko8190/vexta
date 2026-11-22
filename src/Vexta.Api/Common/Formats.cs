using System.Globalization;

namespace Vexta.Api.Common;

/// <summary>
/// How numbers are written for the people who read them here.
///
/// Everything this application prints is in French: a tax rate is "9,975 %", not "9.975 %". The
/// invariant culture is right for storing and parsing and wrong for showing, and the two were
/// being confused in three places that all printed the same label.
/// </summary>
public static class Formats
{
    public static readonly CultureInfo Quebec = CultureInfo.GetCultureInfo("fr-CA");
}
