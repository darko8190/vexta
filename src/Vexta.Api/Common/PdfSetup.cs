using System.Reflection;
using QuestPDF.Drawing;
using QuestPDF.Infrastructure;

namespace Vexta.Api.Common;

/// <summary>
/// What every PDF this application produces needs before the first one is produced: the licence,
/// and the typeface.
///
/// Not on any one document class. There are several now -- an invoice, a CV -- and a document
/// that works only because some other document's static method happened to run first is a
/// document that breaks the day it is used on its own.
/// </summary>
public static class PdfSetup
{
    /// <summary>
    /// Registers the embedded fonts and the licence once per process. QuestPDF reads no fonts
    /// from the host: the runtime image has none, and a document that falls back to a different
    /// typeface per machine is a document nobody can vouch for.
    /// </summary>
    public static void Configure()
    {
        // Community: free for individuals and for companies under one million USD of yearly
        // revenue. See https://www.questpdf.com/license/.
        QuestPDF.Settings.License = LicenseType.Community;

        var assembly = Assembly.GetExecutingAssembly();
        foreach (var name in assembly.GetManifestResourceNames().Where(n => n.EndsWith(".ttf")))
        {
            using var stream = assembly.GetManifestResourceStream(name)!;
            FontManager.RegisterFontFromStream(stream);
        }
    }
}
